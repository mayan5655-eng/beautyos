-- trial-gate-policies.sql
-- PHASE 3 of the trial / subscription mechanism: the write block.
--
-- Run AFTER trial-state.sql, and only once check 5g there returns 0.
-- The fast way back is trial-gate-rollback.sql, which drops everything below.
--
-- ===========================================================================
-- READ-ONLY MEANS READ-ONLY. THIS SCRIPT BLOCKS WRITES AND NOTHING ELSE.
-- ===========================================================================
-- Every policy created here is `for insert`, `for update` or `for delete`.
-- There is NO `for select` policy and NO `for all` policy anywhere in this file
-- (`for all` would silently include SELECT, which is why it is never used).
-- A tenant on hold keeps full read access to her calendar and client list:
--   * she may have appointments tomorrow with no other record of them, and
--   * her clients keep booking through /book while she is on hold, so she has
--     to be able to see what is accumulating.
-- Check 6c at the bottom asserts this mechanically rather than on trust.
--
-- ===========================================================================
-- WHY THIS IS SAFE FOR EXISTING POLICIES
-- ===========================================================================
-- Nothing here modifies, drops or replaces an existing policy. Postgres ANDs
-- RESTRICTIVE policies onto whatever PERMISSIVE policies already exist, so the
-- tenant-scoping rules stay exactly as they are and simply gain one more
-- condition. Every policy is also scoped `to authenticated`, and a RESTRICTIVE
-- policy applies ONLY to the roles it names, so:
--   * anon is untouched. Public client flows cannot be affected by this file
--     even if the predicate below were wrong.
--   * service_role bypasses RLS entirely, so /api/book-appointment, the
--     reminder senders and the WhatsApp webhook keep working while she is on
--     hold. That is deliberate: her clients must never notice her billing.
--
-- ===========================================================================
-- ATOMIC ON PURPOSE
-- ===========================================================================
-- Sections 1 and 2 are wrapped in a single transaction. Postgres DDL is
-- transactional, so either the whole gate lands or none of it does. Without
-- this, section 1 could succeed while section 2 failed, leaving the gate
-- switched ON and simultaneously BYPASSABLE, which is the worst of both.
-- The verification queries sit AFTER the commit on purpose, so what they report
-- is the state that is actually live rather than an uncommitted snapshot.
--
-- ===========================================================================
-- WHY public.settings IS DELIBERATELY *NOT* BLOCKED
-- ===========================================================================
-- settings is excluded by design. Her public booking site serves its contents
-- (business name, phone, opening hours) to her clients through the
-- get_public_branding RPC, so if she were locked out of it, a wrong phone number
-- or wrong opening hours would keep misleading real customers with no way for
-- her to correct it. Being on hold must never make her mini-site wrong.
--
-- The accepted trade-off: settings also holds her GreenAPI credentials and the
-- `automations` JSONB. A blocked tenant can therefore still edit those, and the
-- cron senders run on the service-role key, so she could re-enable an
-- automation and have messages continue to go out. That is a deliberate
-- decision to favour her clients over airtight metering. If it ever needs
-- closing, the fix is a BEFORE UPDATE trigger that preserves green_api_* and
-- automations from OLD while a tenant is inactive. Column privileges CANNOT be
-- used here the way they are on public.tenants below, because the app saves
-- settings as one wide UPDATE and Postgres checks privileges on every column
-- named in a SET list, which would break saving for ACTIVE tenants too.

begin;

-- ── 1. The write block ─────────────────────────────────────────────────────
-- Applied in a loop so a table that does not exist is SKIPPED with a notice
-- instead of aborting the whole script. Read the notices when this runs: a
-- skipped table is a hole in the gate, not a harmless message.
do $$
declare
  t text;
  targets text[] := array[
    -- Core business data she works with every day.
    'appointments', 'clients', 'service_prices', 'receipts', 'leads',
    'expenses', 'packages', 'waitlist', 'forms',
    -- Clinical / client records.
    'client_photos', 'treatment_protocols', 'skin_scans',
    -- AI and marketing output.
    'advisor_messages', 'campaigns', 'campaign_posts', 'community_posts',
    -- Messaging and automation state.
    'slot_offers', 'whatsapp_messages', 'auto_reminders_log', 'facebook_pages'
    -- NOTE: 'settings' is intentionally absent. See the header for why.
    --
    -- skin_scans, whatsapp_messages and auto_reminders_log are kept here on
    -- purpose even though every writer today is a service-role route, so these
    -- three policies change nothing in practice. They are future-proofing: if
    -- any of those writes ever moves to a browser call, the gate is already
    -- correct instead of silently missing a table.
  ];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist. This is a GAP in the gate.', t;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated '
      'with check (public.is_tenant_active())',
      t || '_require_active_insert', t);

    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated '
      'using (public.is_tenant_active()) with check (public.is_tenant_active())',
      t || '_require_active_update', t);

    -- DELETE is blocked as well: read-only means read-only. This is separate
    -- from the product rule that WE never delete a tenant's data.
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated '
      'using (public.is_tenant_active())',
      t || '_require_active_delete', t);

    raise notice 'gated %', t;
  end loop;
end $$;

-- ── 2. Close the self-activation bypass on public.tenants ─────────────────
--
-- THIS IS THE STATEMENT THAT MAKES THE GATE MEAN ANYTHING.
--
-- app/onboarding/page.tsx updates public.tenants from the BROWSER with the
-- user's own JWT, which means `authenticated` holds UPDATE on that table. So
-- before this fix, any tenant could open the browser console and run
--     supabase.from('tenants').update({ plan_status: 'active' }).eq('id', ...)
-- to un-expire herself, or push trial_ends_at years into the future. Every
-- restrictive policy above would still pass, because is_tenant_active() would
-- now legitimately return true. RLS cannot express "this row but not this
-- column", so column-level privileges are the right tool.
--
-- Column privileges are safe HERE (unlike on settings) because `name` is the
-- only column any browser code writes: app/onboarding/page.tsx line 108, and
-- nothing else in the codebase updates public.tenants from the client.
--
-- After this, she can still rename her business and nothing else. service_role
-- is unaffected, so the Phase 4 admin panel can still change plan state.
revoke update on public.tenants from authenticated;
revoke update on public.tenants from anon;
grant  update (name) on public.tenants to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION. Run after the commit above; these read the live state.
-- ===========================================================================

-- 6a. Inventory. Every row must read permissive = RESTRICTIVE, roles =
--     {authenticated}, and cmd in (INSERT, UPDATE, DELETE).
select tablename, policyname, permissive, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
 order by tablename, cmd;

-- 6b. EXPECT policy_count = 60 and tables_gated = 20 (three policies each on
--     twenty tables). A lower number means a table was skipped: scroll back to
--     the NOTICE output from section 1 to see which, and treat it as a gap.
select count(*) as policy_count, count(distinct tablename) as tables_gated
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%';

-- 6c. THE READ-ONLY GUARANTEE, checked mechanically.
--     MUST return 0. Any non-zero result means something in this file blocks
--     reads, which is the one thing it must never do.
select count(*) as must_be_zero_no_read_blocking
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
   and cmd in ('SELECT', 'ALL');

-- 6d. anon must appear in NO policy from this file. MUST return 0.
select count(*) as must_be_zero_anon_never_restricted
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
   and 'anon' = any(roles);

-- 6e. The self-activation bypass must be closed. Expect:
--     can_update_name = true, and BOTH plan columns false.
select has_column_privilege('authenticated', 'public.tenants', 'name', 'update')
         as can_update_name,
       has_column_privilege('authenticated', 'public.tenants', 'plan_status', 'update')
         as can_update_plan_status,
       has_column_privilege('authenticated', 'public.tenants', 'trial_ends_at', 'update')
         as can_update_trial_ends_at;

-- 6f. settings must NOT be gated, so she can always fix what her public
--     booking site shows her clients. MUST return 0.
select count(*) as must_be_zero_settings_not_gated
  from pg_policies
 where schemaname = 'public'
   and tablename = 'settings'
   and policyname like '%\_require\_active\_%';


-- ===========================================================================
-- HOW TO TEST ON A THROWAWAY TENANT
-- ===========================================================================
-- 1. Sign up a fresh account. Confirm it lands as plan_status='trial' with
--    trial_ends_at about 30 days out.
-- 2. Expire it by hand:
--      update public.tenants set plan_status = 'expired' where id = '<throwaway>';
-- 3. Logged in AS THAT TENANT, confirm:
--      READS STILL WORK   - the calendar and client list still load fully.
--      WRITES ARE BLOCKED - creating an appointment or a client is refused,
--        with the Hebrew read-only explanation rather than a raw error.
--      SETTINGS STILL SAVE - change her opening hours or phone number and save.
--        This MUST succeed, and /book?t=<throwaway> must show the new value.
--      SELF-ACTIVATION FAILS - in the browser console,
--        await supabase.from('tenants').update({plan_status:'active'}).eq('id','<throwaway>')
--        must NOT change plan_status. Re-select the row to confirm.
--      HER CLIENTS ARE FINE - /book?t=<throwaway> still loads AND a public
--        booking still succeeds, because that path runs on the service-role key.
--      GUARDED ROUTES REFUSE - the AI advisor returns 402, not a 500.
--      READ ROUTES STILL WORK - loading advisor history (GET) still returns.
-- 4. Set it to 'paused' and confirm the same write block applies, with the
--    softer "החשבון בהשהיה" wording.
-- 5. Put it back: update public.tenants set plan_status='active' where id='<throwaway>';
-- 6. As YOUR OWN active tenant, confirm nothing changed at all: create an
--    appointment, save settings, ask the advisor a question.
