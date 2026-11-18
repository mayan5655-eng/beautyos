-- revoke_anon_internal_tables_2026-11-18.sql
--
-- WHY: the 2026-11-16 audit (read-only probe) found that the anon role (anyone with the public key, no login) still holds table
-- grants on three internal tables. Row-level security returns 0 rows to it today (checked again 2026-11-17: each answers 200 with
-- an empty list), so nothing leaks. But a grant that is not needed is one policy mistake away from a leak, so it goes.
--
-- WHO READS THEM: the owner dashboard (signed in, the authenticated role: package_offerings in app/beautyos.jsx) and the server
-- (service role: billing_addons in lib/addonQuota.ts, lib/billing/repo.ts). Neither is anon, so nothing in the app changes.
-- The public booking page does not read any of them.
--
-- SAFE: changes no data, can be run more than once. Do NOT re-run revoke-anon-grants.sql instead (it re-grants tenants to anon).
--
-- Supabase -> SQL Editor -> New query -> paste ALL of this -> Run.

begin;

do $$
declare t text;
begin
  foreach t in array array['admin_audit_log', 'billing_addons', 'package_offerings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
      raise notice 'revoked anon on %', t;
    else
      raise notice 'skipped % (table does not exist)', t;
    end if;
  end loop;
end $$;

commit;

-- CHECK (expect 0 rows):
-- select table_name, privilege_type from information_schema.role_table_grants
--  where grantee = 'anon' and table_schema = 'public'
--    and table_name in ('admin_audit_log', 'billing_addons', 'package_offerings');
