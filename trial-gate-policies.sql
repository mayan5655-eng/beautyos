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
    'slot_offers', 'whatsapp_messages', 'auto_reminders_log', 'facebook_pages',
    -- Her configuration. Blocked too: read-only means she cannot re-brand or
    -- re-price while on hold. Onboarding is unaffected because a brand new
    -- tenant is on 'trial', which is_tenant_active() treats as active.
    'settings'
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
-- After this, she can still rename her business (the only column onboarding
-- writes) and nothing else. service_role is unaffected, so the Phase 4 admin
-- panel can still change plan state.
revoke update on public.tenants from authenticated;
revoke update on public.tenants from anon;
grant  update (name) on public.tenants to authenticated;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

-- 6a. Inventory. Every row must read permissive = RESTRICTIVE, roles =
--     {authenticated}, and cmd in (INSERT, UPDATE, DELETE).
select tablename, policyname, permissive, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
 order by tablename, cmd;

-- 6b. Expect 3 policies per gated table. Anything less is a partial gate.
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
--     can_update_name = true, can_update_plan_status = false.
select has_column_privilege('authenticated', 'public.tenants', 'name', 'update')
         as can_update_name,
       has_column_privilege('authenticated', 'public.tenants', 'plan_status', 'update')
         as can_update_plan_status,
       has_column_privilege('authenticated', 'public.tenants', 'trial_ends_at', 'update')
         as can_update_trial_ends_at;


-- ===========================================================================
-- HOW TO TEST ON A THROWAWAY TENANT
-- ===========================================================================
-- 1. Sign up a fresh account. Confirm it lands as plan_status='trial' with
--    trial_ends_at about 30 days out.
-- 2. Expire it by hand:
--      update public.tenants set plan_status = 'expired' where id = '<throwaway>';
-- 3. Logged in AS THAT TENANT, confirm:
--      READS STILL WORK   - the calendar and client list still load fully.
--      WRITES ARE BLOCKED - creating an appointment or a client fails.
--      SELF-ACTIVATION FAILS - in the browser console,
--        await supabase.from('tenants').update({plan_status:'active'}).eq('id','<throwaway>')
--        must NOT change plan_status. Re-select the row to confirm.
--      HER CLIENTS ARE FINE - /book?t=<throwaway> still loads AND a public
--        booking still succeeds, because that path runs on the service-role key.
--      GUARDED ROUTES REFUSE - the AI advisor returns 402, not a 500.
--      READ ROUTES STILL WORK - loading advisor history (GET) still returns.
-- 4. Set it to 'paused' and confirm the same write block applies.
-- 5. Put it back: update public.tenants set plan_status='active' where id='<throwaway>';
--
-- Expect RAW errors in the UI at this stage. The friendly Hebrew explanations
-- on every write affordance are the NEXT step, deliberately not in this script.
