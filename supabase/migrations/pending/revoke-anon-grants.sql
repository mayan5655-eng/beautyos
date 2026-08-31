-- STATUS: UNKNOWN - verification query in README.md.
-- The folder name is not a status. See README.md in this directory.

-- revoke-anon-grants.sql
--
-- Take every privilege away from `anon` on every table in `public`, except the
-- two SELECTs that public pages genuinely need.
--
-- ── What this fixes ────────────────────────────────────────────────────────
-- The project never tightened Supabase's default grants. Read from
-- information_schema on 2026-08-22, every table in public grants DELETE,
-- INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE to BOTH anon and
-- authenticated, with exactly two exceptions:
--
--     settings   anon lacks SELECT        (the settings lockdown)
--     tenants    BOTH roles lack UPDATE   (gate.sql, table level)
--
-- For anon that is 173 privileges that should not exist:
--     INSERT 29, UPDATE 28, DELETE 29, TRUNCATE 29, REFERENCES 29, TRIGGER 29
--
-- NOTE ON THE EARLIER PROBE. audit-table-grants.js reported settings as lacking
-- anon UPDATE and DELETE. That was WRONG, and the catalog above is authoritative.
-- A filtered PATCH or DELETE over PostgREST must read the rows it targets, so on
-- a table where anon has no SELECT both probes fail with "permission denied for
-- table" and get misread as a missing write grant. The probe cannot distinguish
-- those two cases on any table without SELECT. It is still useful as an
-- after-the-fact behavioural check, but it understated this problem.
--
-- including on platform_admins (who is a platform admin), tenant_members (who
-- belongs to which business), and clients / client_photos / skin_scans /
-- receipts. Only two partial fixes existed before this file: the settings
-- lockdown, which left INSERT behind, and gate.sql, which revoked UPDATE on
-- tenants but left INSERT and DELETE.
--
-- Nothing is currently exploitable: RLS blocks anon INSERT on all 29, verified
-- by probe. But RLS is the ONLY thing standing there, and it is one permissive
-- policy away from not standing there - `public_read_tenants` is proof that
-- such a policy can get added by accident. A revoked privilege is refused
-- before RLS is ever consulted, which does not depend on getting policies right.
--
-- ── What this deliberately does NOT touch ──────────────────────────────────
-- `authenticated`. The app writes to these tables from the browser with the
-- user's own JWT, so revoking there breaks the product. In particular
-- authenticated holds a COLUMN-level `update (name)` on public.tenants from
-- gate.sql, which is what lets onboarding rename a business; that grant is
-- invisible in information_schema.role_table_grants and must survive.
--
-- `service_role` is unaffected by design - it bypasses grants and RLS, and
-- every public write path in the app already goes through a service-role route
-- handler (book-appointment, availability, skin-scan/lead, skin-scan/send,
-- claim, community).
--
-- ── Anon needs no write privilege at all ───────────────────────────────────
-- Checked, not assumed: no public page performs a browser-side insert, update
-- or delete, with one apparent exception - app/form/page.jsx updates `forms`.
-- That call is ALREADY non-functional, because RLS denies anon on forms (anon
-- reads 0 rows there, verified against a real form id). So this migration takes
-- away nothing that currently works. If /form is fixed later it should be fixed
-- the way /book was, through a service-role route, not by re-granting anon.
--
-- Safe to run more than once. REVOKE on a privilege that is already absent is a
-- no-op, and the two SELECTs are re-granted explicitly on every run.

-- ===========================================================================
-- 0. PRECONDITION - run VERIFY (a) at the bottom FIRST.
-- ===========================================================================
-- If any privilege on these tables is granted to the pseudo-role PUBLIC rather
-- than to `anon` directly, then anon INHERITS it and revoking from anon alone
-- changes nothing. This migration assumes (a) returns zero rows. It is the one
-- assumption here that behavioural probing could not settle, because a PUBLIC
-- grant and an anon grant look identical from the outside.

begin;

-- ===========================================================================
-- 1. Strip anon back to nothing, then hand back only the two reads.
-- ===========================================================================
-- `revoke all privileges` rather than naming the six: it covers every privilege
-- type including any added by a future Postgres, and it is correct for views
-- and materialised views too, where TRUNCATE/REFERENCES/TRIGGER do not apply
-- and naming them explicitly would error.
--
-- The loop is driven from pg_class rather than a hardcoded list of 29 names, so
-- a table added since the audit cannot be silently missed.
do $$
declare
  r            record;
  keep_select  constant text[] := array['tenants', 'service_prices'];
  n_stripped   integer := 0;
  n_kept       integer := 0;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')   -- table, partitioned, view, matview, foreign
     order by c.relname
  loop
    execute format('revoke all privileges on public.%I from anon', r.relname);
    n_stripped := n_stripped + 1;

    if r.relname = any (keep_select) then
      -- tenants: still read by the anonymous /[slug] landing page, until
      --   get_public_tenant_by_slug replaces that read. Revoking SELECT here
      --   before the RPC ships would 404 every public landing page.
      -- service_prices: the public /book and /[slug] pages show her price list.
      execute format('grant select on public.%I to anon', r.relname);
      n_kept := n_kept + 1;
      raise notice 'anon: stripped %, SELECT re-granted (public page needs it)', r.relname;
    else
      raise notice 'anon: stripped % (all privileges)', r.relname;
    end if;
  end loop;

  raise notice '---';
  raise notice 'relations processed: %, of which SELECT kept for anon: %', n_stripped, n_kept;
end $$;

-- ===========================================================================
-- 2. Column-level grants to anon, if any exist.
-- ===========================================================================
-- This is not theoretical padding. This database uses column privileges:
-- gate.sql grants `update (name) on public.tenants to authenticated`. A
-- table-level REVOKE does not necessarily remove a separately-granted column
-- privilege, and information_schema.role_table_grants does not show them - so
-- the grant matrix that motivated this migration could not have revealed one.
--
-- Runs AFTER section 1 on purpose: with the table-level grants already gone,
-- anything still listed here is a genuine column grant rather than a
-- table-level privilege being reported per column.
--
-- privilege_type comes from the catalog and is checked against a fixed list
-- before being interpolated, because a privilege keyword cannot be passed as a
-- quoted identifier.
do $$
declare
  r      record;
  n      integer := 0;
begin
  for r in
    select table_name, column_name, privilege_type
      from information_schema.column_privileges
     where table_schema = 'public'
       and grantee = 'anon'
     order by table_name, column_name
  loop
    if r.privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') then
      raise notice 'SKIPPING unexpected column privilege % on %.%',
        r.privilege_type, r.table_name, r.column_name;
      continue;
    end if;

    -- Do not strip the two SELECTs section 1 deliberately re-granted.
    if r.privilege_type = 'SELECT'
       and r.table_name in ('tenants', 'service_prices') then
      continue;
    end if;

    execute format('revoke %s (%I) on public.%I from anon',
                   r.privilege_type, r.column_name, r.table_name);
    n := n + 1;
    raise notice 'anon: revoked column privilege % on %.%',
      r.privilege_type, r.table_name, r.column_name;
  end loop;

  if n = 0 then
    raise notice 'no column-level grants to anon (expected)';
  end if;
end $$;

commit;


-- ===========================================================================
-- 3. OPTIONAL - stop this coming back on the next table you create.
-- ===========================================================================
-- Everything above fixes the 29 tables that exist today. It does NOT stop the
-- 30th from arriving with the same defaults: Supabase ships a default-privilege
-- rule that grants new tables in `public` to anon and authenticated, so the
-- hole reopens the next time a table is added and nobody re-runs this file.
--
-- DELIBERATELY LEFT COMMENTED OUT. It reaches beyond the scope of "fix the 29",
-- it only affects objects created by the role that runs it (run as the same
-- role your migrations use, or it will not apply to them), and it can surprise
-- tooling that assumes the Supabase defaults. Read it, decide, then uncomment.
--
-- alter default privileges in schema public revoke all on tables from anon;
-- alter default privileges in schema public revoke all on sequences from anon;
-- alter default privileges in schema public revoke all on functions from anon;


-- ===========================================================================
-- VERIFY. Run these AFTER the migration. (a) must also be run BEFORE it.
-- ===========================================================================
--
--   a) THE PRECONDITION, and the one thing probing could not settle.
--      MUST RETURN ZERO ROWS, before and after. Any row here means the
--      privilege is held by PUBLIC, which anon inherits, and this migration
--      does not close it - come back before assuming anything is fixed.
--        select table_name, privilege_type
--          from information_schema.role_table_grants
--         where table_schema = 'public' and grantee = 'PUBLIC'
--         order by table_name, privilege_type;
--
--   b) THE MAIN RESULT. Every anon privilege left in the schema.
--      MUST RETURN EXACTLY TWO ROWS:
--        service_prices | SELECT
--        tenants        | SELECT
--      Anything else, on any table, means a revoke did not land.
--        select table_name, privilege_type
--          from information_schema.role_table_grants
--         where table_schema = 'public' and grantee = 'anon'
--         order by table_name, privilege_type;
--
--   c) The write privileges specifically. MUST RETURN 0.
--      This is the number the whole migration exists to move. Before it runs
--      the answer is 173: INSERT 29, UPDATE 28, DELETE 29, TRUNCATE 29,
--      REFERENCES 29, TRIGGER 29. Worth running this one BEFORE as well, so
--      you see it go 173 -> 0 rather than taking the 0 on trust.
--        select count(*) as must_be_zero
--          from information_schema.role_table_grants
--         where table_schema = 'public'
--           and grantee = 'anon'
--           and privilege_type <> 'SELECT';
--
--   d) COLUMN-level grants to anon. MUST RETURN ZERO ROWS.
--      Separate from (b) on purpose: role_table_grants cannot see these, which
--      is exactly how `update (name) on tenants` stayed invisible in the audit.
--        select table_name, column_name, privilege_type
--          from information_schema.column_privileges
--         where table_schema = 'public' and grantee = 'anon'
--           and not (privilege_type = 'SELECT'
--                    and table_name in ('tenants', 'service_prices'))
--         order by table_name, column_name;
--
--   e) AUTHENTICATED MUST BE UNHARMED. This is the regression check.
--      The column grant that lets onboarding rename a business must still be
--      there. MUST RETURN EXACTLY ONE ROW: tenants | name | UPDATE.
--        select table_name, column_name, privilege_type
--          from information_schema.column_privileges
--         where table_schema = 'public' and grantee = 'authenticated'
--           and table_name = 'tenants' and privilege_type = 'UPDATE';
--
--   f) And authenticated still holds its table-level grants.
--      MUST RETURN 29 (one row per table, all still granted).
--        select count(distinct table_name) as should_be_29
--          from information_schema.role_table_grants
--         where table_schema = 'public'
--           and grantee = 'authenticated'
--           and privilege_type = 'SELECT';
--
-- ── After this, verify by BEHAVIOUR too ────────────────────────────────────
-- node --env-file=.env.local audit-table-grants.js
--   expected: every table NO-GRANT for INSERT/UPDATE/DELETE, and only
--   tenants + service_prices readable. The audit reads privileges off
--   PostgREST's own responses, so it confirms the revoke from the outside
--   rather than from the catalog that was just written to.
