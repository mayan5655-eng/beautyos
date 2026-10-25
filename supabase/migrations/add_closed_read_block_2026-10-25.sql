-- add_closed_read_block_2026-10-25.sql
--
-- WHY: owner decision 2026-10-21, "after the trial without payment the system closes completely". The app already does
-- this (app/PlanBlockedScreen.jsx replaces the dashboard and loadAll stops before any data reaches state), but the
-- database still let a closed business READ her rows: trial-gate-policies.sql blocks writes only, by design of the old
-- read-only model. With the anon key and her own session, the calendar and client list were one request away.
-- This closes that at the database: a closed business reads nothing from her business tables until she renews.
--
-- WHAT IT DOES: one RESTRICTIVE `for select to authenticated` policy per private business table, the same predicate the
-- write block uses (public.is_tenant_active(), from trial-state.sql). RESTRICTIVE policies are ANDed onto the existing
-- tenant-scoping policies, which are not touched. NOTHING IS DELETED: rows stay exactly as they are and come back the
-- moment plan_status is 'active' (or a trial is extended).
--
-- WHO IS NOT AFFECTED:
--   * anon: the policies are scoped TO authenticated. Her public page, booking, forms and reviews do not change.
--   * service_role bypasses RLS: the reminder crons (booked clients keep their reminders), booking, billing
--     (/api/billing/* reads with the service role, so she can still pay), the owner panel.
--   * the demo businesses (lib/demoTenants.ts): exempted by id in the predicate below.
--   * a business that is active or on a running trial: is_tenant_active() is true, and it FAILS OPEN (a missing row,
--     a null tenant or an unreadable status all count as active).
--
-- DELIBERATELY NOT BLOCKED (read on public pages or needed by the closed screen itself):
--   tenants (the closed screen reads her plan row to notice she paid and reopen), tenant_members (tenant resolution),
--   settings, service_prices, reviews (public page data), community_posts (shared feed), billing_* and grow_accounts
--   (paying must keep working), push_subscriptions, facebook_pages.
--
-- PERFORMANCE: the predicate is wrapped in (select ...), so Postgres evaluates it once per query (an initplan),
-- not once per row.
--
-- Run AFTER trial-state.sql (it defines is_tenant_active). Safe to run more than once.
-- ROLLBACK: section 3 at the bottom (commented out) drops every policy this file creates.
-- AFTER RUNNING: node --env-file=.env.local scripts/smoke/trial-closed.mjs   (it reports "database read block: ON")
--                node --env-file=.env.local scripts/smoke/rls-cross-tenant.mjs (must still end ALL OK)

-- ── 0. LOOK FIRST (read-only): the businesses this closes right now ───────
-- Her own business (448e9e45-...) must NOT be in this list. If it is, stop and activate it in the owner panel first.
select t.id, t.name, t.plan_status, t.trial_ends_at, public.tenant_effective_status(t.id) as effective
  from public.tenants t
 where public.tenant_effective_status(t.id) in ('expired', 'paused')
 order by t.trial_ends_at nulls last;

begin;

-- ── 1. The read block ──────────────────────────────────────────────────────
do $$
declare
  t text;
  targets text[] := array[
    -- calendar, clients, money
    'appointments', 'clients', 'receipts', 'receipt_voids', 'expenses', 'packages', 'package_entries', 'client_credits',
    -- clinical records
    'client_photos', 'treatment_protocols', 'skin_scans', 'treatment_results', 'forms',
    -- leads, messages, notifications
    'leads', 'whatsapp_messages', 'auto_reminders_log', 'owner_notifications', 'owner_questions', 'slot_offers', 'waitlist',
    'wa_cloud_messages',
    -- AI and marketing output
    'advisor_messages', 'campaigns', 'campaign_posts', 'designs',
    -- her clients' card payments (her clearing, not Kalmea billing)
    'grow_payments', 'cancellation_fee_items', 'grow_card_consents', 'grow_token_charges'
  ];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_require_active_select', t);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ('
      '(select public.is_tenant_active()) '
      'or (select public.get_user_tenant_id()) in (''00000000-0000-0000-0000-000000000001''::uuid, ''00000000-0000-0000-0000-000000000002''::uuid))',
      t || '_require_active_select', t);
  end loop;
end $$;

commit;

-- ── 2. Verify (read-only) ─────────────────────────────────────────────────
-- 2a. One row per protected table. Expect about 29 rows (fewer only where a table does not exist; see the notices).
select tablename, policyname, permissive, roles, cmd
  from pg_policies
 where schemaname = 'public' and policyname like '%\_require\_active\_select' escape '\'
 order by tablename;

-- 2b. Must return 0 rows: nothing public-facing or billing-related got a read block.
select tablename, policyname from pg_policies
 where schemaname = 'public' and policyname like '%\_require\_active\_select' escape '\'
   and tablename in ('tenants', 'tenant_members', 'settings', 'service_prices', 'reviews', 'community_posts',
                     'billing_subscriptions', 'billing_payments', 'grow_accounts');

-- 2c. Must be true: the predicate itself works (run in the SQL editor as postgres, there is no tenant, so it fails open).
select public.is_tenant_active() as fails_open_without_a_tenant;

-- ── 3. ROLLBACK (run only to undo) ────────────────────────────────────────
-- do $$
-- declare p record;
-- begin
--   for p in select tablename, policyname from pg_policies
--             where schemaname = 'public' and policyname like '%\_require\_active\_select' escape '\' loop
--     execute format('drop policy %I on public.%I', p.policyname, p.tablename);
--   end loop;
-- end $$;
