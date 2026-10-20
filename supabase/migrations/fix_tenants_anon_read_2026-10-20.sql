-- fix_tenants_anon_read_2026-10-20.sql
--
-- After tenants-anon-read.sql ran, an anonymous caller could STILL read public.tenants (checked 2026-10-20 with the anon key:
-- 6 rows). "revoke select on table" does not remove COLUMN-level grants, nor a grant to PUBLIC (every role, anon included).
-- This removes both for anon. Signed-in users keep reading (explicit grant to authenticated first). Public pages are not
-- affected: they read through get_public_tenant_by_slug (SECURITY DEFINER). Safe to run more than once.

-- Signed-in users keep their access even if it came only from PUBLIC.
grant select on public.tenants to authenticated;

-- Table-level, from anon and from PUBLIC.
revoke all on public.tenants from anon;
revoke all on public.tenants from public;

-- Column-level grants to anon or PUBLIC, whatever columns they are on.
do $$
declare c record;
begin
  for c in
    select column_name, grantee from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'tenants' and grantee in ('anon', 'PUBLIC')
  loop
    execute format('revoke all (%I) on public.tenants from %s', c.column_name, case when c.grantee = 'PUBLIC' then 'public' else 'anon' end);
  end loop;
end $$;

-- VERIFY (the result should be: anon_can_read = false, authenticated_can_read = true)
select has_table_privilege('anon', 'public.tenants', 'select') as anon_can_read,
       has_any_column_privilege('anon', 'public.tenants', 'select') as anon_any_column,
       has_table_privilege('authenticated', 'public.tenants', 'select') as authenticated_can_read;
