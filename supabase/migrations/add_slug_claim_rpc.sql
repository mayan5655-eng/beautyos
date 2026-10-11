-- add_slug_claim_rpc.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: Settings > "My page" lets her claim her own address (/<slug>). The browser did it with
--   supabase.from('tenants').update({ slug }).eq('id', tenant)
-- but the only UPDATE the authenticated role holds on public.tenants is the column `name`
-- (legacy/gate.sql, trial-gate-policies.sql). The write is refused (42501), so claiming an address most
-- likely never worked. Granting UPDATE(slug) on tenants would open the table's other columns to the same
-- policy review, so this adds one narrow, definer-run function instead.
--
-- WHAT:
--   1. claim_tenant_slug(p_slug): sets the slug of the CALLER's own business and nothing else. The tenant
--      comes from get_user_tenant_id() (the session), never from an argument. The existing constraints still
--      decide: tenants_slug_lower_key (unique, case-insensitive) raises 23505, the shape and reserved-word
--      checks raise 23514 - the app maps both to Hebrew messages already.
--   2. The reserved list gains the live routes it was missing: demo, logo, og, accessibility (a tenant could
--      claim /demo and get a dead address, because the real route wins). It keeps every name it had.
--
-- The app tries the function first and falls back to the direct update while this file has not been run, so
-- it is safe to deploy the code first.
--
-- Safe to run more than once.

-- 1. The reserved words: the list from add_reviews.sql plus the routes that exist now.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tenants_slug_not_reserved') then
    alter table public.tenants drop constraint tenants_slug_not_reserved;
  end if;

  alter table public.tenants
    add constraint tenants_slug_not_reserved
    check (
      slug is null
      or slug not in (
        'api', 'auth', 'book', 'claim', 'community', 'confirm', 'dashboard',
        'form', 'login', 'onboarding', 'privacy', 'reset-password', 'signup',
        'skin-scan', 'terms', 'review', 'reviews',
        'accessibility', 'demo', 'logo', 'og',
        'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
        'pricing', 'public', 'settings', 'splash', 'static', 'support',
        'www', '_next'
      )
    );
end $$;

-- 2. Claiming an address.
create or replace function public.claim_tenant_slug(p_slug text)
returns table (id uuid, slug text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no business for this session' using errcode = '42501';
  end if;
  return query
    update public.tenants t
       set slug = p_slug
     where t.id = v_tenant
    returning t.id, t.slug;
end;
$$;

revoke all on function public.claim_tenant_slug(text) from public;
revoke all on function public.claim_tenant_slug(text) from anon;
grant execute on function public.claim_tenant_slug(text) to authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the constraint lists the new words:
--      select pg_get_constraintdef(oid) from pg_constraint where conname = 'tenants_slug_not_reserved';
-- 2) only signed-in users may call the function:
--      select grantee, privilege_type from information_schema.routine_privileges
--       where routine_name = 'claim_tenant_slug';
--      -- expect authenticated (and the owner); anon and PUBLIC absent
-- 3) in the app, signed in: Settings > My page > change the address, save. It must succeed, and a name that
--    is taken or reserved ("demo") must show the Hebrew "taken" / "not available" message.
