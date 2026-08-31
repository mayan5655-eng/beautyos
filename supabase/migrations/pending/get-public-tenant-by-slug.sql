-- STATUS: APPLIED (verified 2026-09-01).
-- The folder name is not a status. See README.md in this directory.

-- get-public-tenant-by-slug.sql
--
-- STEP 1 of closing the anon read on public.tenants. RUN THIS FIRST.
--
-- ── The ordering, and why it is not optional ───────────────────────────────
-- app/[slug]/page.jsx is the ONLY anonymous reader of public.tenants. It runs
-- in the browser on the anon key and resolves a business by slug. Drop
-- public_read_tenants before that page stops reading the table and every
-- cosmetician's public landing page goes to "not found" for every visitor.
--
--   1. Run THIS file.                          (additive; nothing changes yet)
--   2. Repoint app/[slug]/page.jsx at the RPC, deploy, confirm a landing page
--      still renders.
--   3. Only then: drop public_read_tenants + run revoke-anon-grants.sql.
--   4. Verify anon reads 0 rows from tenants and the landing page still works.
--
-- ── Why an RPC rather than a narrower policy ───────────────────────────────
-- RLS is row-level; it cannot say "this row but only these two columns". The
-- landing page needs exactly `id` and `name`, looked up by slug - it consumes
-- nothing else from the row. A SECURITY DEFINER function is how the rest of
-- this codebase already solves that (get_public_branding), so this mirrors it
-- exactly rather than inventing a second pattern.
--
-- Everything else on the row - plan_status, plan_price, trial dates,
-- signup_source, business_description, target_audience, price_range, owner_id -
-- stops being reachable by an anonymous caller the moment step 3 runs. Today
-- all of it is world-readable.
--
-- Safe to run more than once.

create or replace function public.get_public_tenant_by_slug(p_slug text)
returns table (
  id   uuid,
  name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name
    from public.tenants t
   where t.slug = p_slug
   limit 1;
$$;

revoke execute on function public.get_public_tenant_by_slug(text) from public;
grant  execute on function public.get_public_tenant_by_slug(text) to anon, authenticated;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) It returns the two columns and nothing else, for a real slug.
--      Use a slug from: select slug from public.tenants;
--        select * from public.get_public_tenant_by_slug('<a-real-slug>');
--
--   b) An unknown slug returns ZERO ROWS rather than an error.
--        select count(*) as must_be_zero
--          from public.get_public_tenant_by_slug('no-such-slug-at-all');
--
--   c) anon can execute it.  EXPECT true.
--        select has_function_privilege('anon',
--          'public.get_public_tenant_by_slug(text)', 'execute');
