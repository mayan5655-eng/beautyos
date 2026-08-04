-- gate.sql
-- Copy-paste extract of trial-gate-policies.sql: the migration only, BEGIN to
-- COMMIT. Run this in one go in the Supabase SQL editor, then run checks.sql.
--
-- SOURCE OF TRUTH is trial-gate-policies.sql. If you change the table list or
-- the policies, change it THERE and re-extract, otherwise the two will drift.
--
-- Prerequisite: trial-state.sql has been run and its check 5g returns 0.
-- The way back out is trial-gate-rollback.sql, Section 1.
--
-- ===========================================================================
-- READ-ONLY MEANS READ-ONLY. THIS BLOCKS WRITES AND NOTHING ELSE.
-- ===========================================================================
-- Every policy below is `for insert`, `for update` or `for delete`. There is NO
-- `for select` policy and NO `for all` policy anywhere in this file (`for all`
-- would silently include SELECT, which is why it is never used). A tenant on
-- hold keeps full read access to her calendar and client list: she may have
-- appointments tomorrow with no other record of them, and her clients keep
-- booking through /book while she is on hold, so she has to see what arrives.
--
-- ===========================================================================
-- WHY THIS IS SAFE FOR EXISTING POLICIES
-- ===========================================================================
-- Nothing here modifies, drops or replaces an existing policy. Postgres ANDs
-- RESTRICTIVE policies onto whatever PERMISSIVE policies already exist, so the
-- tenant-scoping rules stay exactly as they are and simply gain one more
-- condition. Every policy is scoped `to authenticated`, and a RESTRICTIVE policy
-- applies ONLY to the roles it names, so:
--   * anon is untouched. Public client flows cannot be affected by this file
--     even if the predicate were wrong.
--   * service_role bypasses RLS entirely, so /api/book-appointment, the reminder
--     senders and the WhatsApp webhook keep working while she is on hold. That
--     is deliberate: her clients must never notice her billing.
--
-- ===========================================================================
-- ATOMIC ON PURPOSE
-- ===========================================================================
-- Sections 1 and 2 are one transaction. Postgres DDL is transactional, so either
-- the whole gate lands or none of it does. Without this, section 1 could succeed
-- while section 2 failed, leaving the gate switched ON and simultaneously
-- BYPASSABLE, which is the worst of both.
--
-- ===========================================================================
-- WHY public.settings IS DELIBERATELY *NOT* BLOCKED
-- ===========================================================================
-- Her public booking site serves settings (business name, phone, opening hours)
-- to her clients through the get_public_branding RPC. If she were locked out, a
-- wrong phone number or wrong opening hours would keep misleading real customers
-- with no way for her to correct it. Being on hold must never make her mini-site
-- wrong.
--
-- Accepted trade-off: settings also holds her GreenAPI credentials and the
-- `automations` JSONB, so a blocked tenant can still edit those, and the cron
-- senders run on the service-role key, so she could re-enable an automation and
-- have messages continue to go out. Deliberate: her clients come before airtight
-- metering. If it ever needs closing, the fix is a BEFORE UPDATE trigger that
-- preserves green_api_* and automations from OLD while a tenant is inactive.
-- Column privileges CANNOT be used here the way they are on public.tenants
-- below, because the app saves settings as one wide UPDATE and Postgres checks
-- privileges on every column named in a SET list, which would break saving for
-- ACTIVE tenants too.

begin;

-- ── 1. The write block ─────────────────────────────────────────────────────
-- Applied in a loop so a table that does not exist is SKIPPED with a notice
-- instead of aborting the whole script. Read the notices when this runs: a
-- skipped table is a hole in the gate, not a harmless message. checks.sql 6g
-- reports the same thing more reliably, since the dashboard may hide notices.
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
-- without this, any tenant could open the browser console and run
--     supabase.from('tenants').update({ plan_status: 'active' }).eq('id', ...)
-- to un-expire herself, or push trial_ends_at years into the future. Every
-- restrictive policy above would still pass, because is_tenant_active() would
-- then legitimately return true. RLS cannot express "this row but not this
-- column", so column-level privileges are the right tool.
--
-- Column privileges are safe HERE (unlike on settings) because `name` is the
-- only column any browser code writes: app/onboarding/page.tsx line 108, and
-- nothing else in the codebase updates public.tenants from the client.
--
-- After this she can still rename her business and nothing else. service_role is
-- unaffected, so the Phase 4 admin panel can still change plan state.
revoke update on public.tenants from authenticated;
revoke update on public.tenants from anon;
grant  update (name) on public.tenants to authenticated;

commit;
