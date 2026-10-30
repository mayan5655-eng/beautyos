-- fix_tenants_read_own_row_2026-10-24.sql
--
-- FOUND 2026-10-24 (phone review, black-box test with two new smoke businesses, scripts/smoke/rls-cross-tenant.mjs):
-- any SIGNED-IN owner can read EVERY row of public.tenants. A new business that signs up sees all the other businesses:
-- name, slug (their public page address), plan, plan_status, trial dates, signed-up date and owner_id (the user's id), 7 other
-- businesses in the test. No phone, email or client data, but it is the customer list of Kalmea handed to any competitor who
-- opens a free trial, and fix_tenants_anon_read_2026-10-20.sql deliberately kept "signed-in users keep reading".
--
-- Checked in the code: every read of tenants made as the signed-in user is for HER OWN row (.eq('id', myTenantId)): the dashboard load,
-- usePlanState, onboarding, the slug claim and the billing card. The platform-owner screens (subscribers, signups) and the crons read
-- with the service role, which bypasses RLS. So limiting what she can see to her own row changes nothing she uses.
--
-- WHAT IT DOES: drops every existing SELECT policy on public.tenants and adds one: you see the business you belong to, or own.
-- UPDATE/INSERT/DELETE policies are not touched. Safe to run more than once.
--
-- AFTER RUNNING: run  node --env-file=.env.local scripts/smoke/rls-cross-tenant.mjs  (it must end ALL OK), open the app signed in
-- (dashboard loads, plan banner shows) and the public booking page (it reads through get_public_tenant_by_slug, unaffected).
-- ROLLBACK: create policy tenants_select_all on public.tenants for select to authenticated using (true);

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'tenants' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.tenants', p.policyname);
  end loop;
  -- policies written for ALL commands also grant SELECT; list them so they are looked at, not silently dropped
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'tenants' and cmd = 'ALL' loop
    raise notice 'a FOR ALL policy still exists on tenants: % (it also grants SELECT; review it)', p.policyname;
  end loop;
end $$;

alter table public.tenants enable row level security;

create policy tenants_select_own on public.tenants
  for select to authenticated
  using (
    id = (select public.get_user_tenant_id())
    or owner_id = (select auth.uid())
  );

-- VERIFY 1: should list only tenants_select_own for SELECT (and no FOR ALL policy)
select policyname, cmd, roles, qual from pg_policies where schemaname = 'public' and tablename = 'tenants' order by policyname;

-- VERIFY 2 (as a signed-in owner in the app, or with the script above): reading tenants returns exactly 1 row.
