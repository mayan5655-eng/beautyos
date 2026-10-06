-- service-prices-tenant-isolation.sql
--
-- ── STATUS: PENDING - not applied. Run by hand in the Supabase SQL Editor. ──────────────
--
-- WHY. Found 2026-10-06: public.service_prices could be read across tenants. An ANONYMOUS
-- caller got every business's menu (21 rows, 4 tenants at the time) and, with it, every
-- tenant_id - the one input the public booking and skin-scan endpoints need. A SIGNED-IN
-- tenant got the same rows: a brand-new empty account saw 21 services in its cashier, none of
-- them its own. Every other table the dashboard reads is correctly scoped; this is the one that
-- was readable by everyone, because the public booking page needs an anonymous read.
--
-- WHAT THIS DOES.
--   1. get_public_services(tenant): the public read, as a function. ONE tenant's ACTIVE
--      services and nothing else. The booking page and /[slug] call it (lib/publicServices.js).
--   2. Drops every SELECT policy on service_prices (they are the ones that let one business see
--      another's menu) and replaces them with one: a signed-in tenant reads its own rows.
--   3. Does NOT touch insert / update / delete policies, and does NOT drop a policy of type ALL:
--      an ALL policy also carries the write rules, so if one exists it is only REPORTED (see the
--      notices) and you decide. The service role (the API routes) bypasses RLS and is unaffected.
--
-- The app is safe on either side of this: it calls the function when it exists and falls back to
-- the old direct read when it does not (with a console warning). Run the whole file at once.
-- Safe to run more than once.
--
-- ── STEP 0 - look first (read-only) ─────────────────────────────────────────────────────
--   select policyname, cmd, roles, qual from pg_policies where tablename = 'service_prices';

-- ── 1. the public read ─────────────────────────────────────────────────────────────────
create or replace function public.get_public_services(p_tenant_id uuid)
returns setof public.service_prices
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.service_prices
  where tenant_id = p_tenant_id
    and (active is null or active = true)
$$;

revoke all on function public.get_public_services(uuid) from public;
grant execute on function public.get_public_services(uuid) to anon, authenticated;

-- ── 2. replace the SELECT policies; report (never drop) an ALL policy ───────────────────
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'service_prices' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.service_prices', p.policyname);
    raise notice 'dropped SELECT policy "%" on service_prices', p.policyname;
  end loop;

  for p in
    select policyname, roles, qual from pg_policies
    where schemaname = 'public' and tablename = 'service_prices' and cmd = 'ALL'
  loop
    raise notice 'REVIEW: policy "%" is type ALL (roles %, condition %) and also grants SELECT. Left in place. If its condition is not tenant-scoped, rewrite it as separate insert/update/delete policies.',
      p.policyname, p.roles, p.qual;
  end loop;
end $$;

-- ── 3. a signed-in tenant reads its own rows ────────────────────────────────────────────
alter table public.service_prices enable row level security;

drop policy if exists service_prices_select_own on public.service_prices;
create policy service_prices_select_own
  on public.service_prices
  for select
  to authenticated
  using (tenant_id = public.get_user_tenant_id());

-- ── VERIFY (run each, one at a time) ─────────────────────────────────────────────────────
-- (a) what an anonymous caller can read now: expect 0 rows, or a permission error.
--       begin; set local role anon; select count(*) from public.service_prices; rollback;
-- (b) the public read still works for a tenant that has services (the demo cosmetics menu):
--       select count(*) from public.get_public_services('00000000-0000-0000-0000-000000000001');
--     expect 6.
-- (c) the policies left on the table:
--       select policyname, cmd, roles, qual from pg_policies where tablename = 'service_prices';
--     expect service_prices_select_own, your insert/update/delete policies, and no SELECT policy
--     for anon/public. Any "REVIEW" notice above means an ALL policy is still there: read it.
-- (d) in the app, signed in as a brand-new empty tenant: the cashier's service list is empty and
--     the checklist does not call services done. Signed in as the demo: its own six.

-- ── ALSO (safe, same idea as tenants-anon-read.sql): anonymous callers have no table grant at all ──
-- The RPC above is SECURITY DEFINER and does not need it. Run after confirming (b) works.
--   revoke select on public.service_prices from anon;
