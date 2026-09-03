-- add_schema_introspection.sql
--
-- One read-only function that lists what actually exists in `public`, so a
-- script can answer "is this migration applied?" by asking the database instead
-- of reading a comment.
--
-- ── STATUS: NOT APPLIED ────────────────────────────────────────────────────
-- Run by hand in the Supabase SQL Editor. And then, pointedly, do not update
-- this line by hand - run `npm run migrations:status`, which is the whole
-- reason this file exists.
--
-- Safe to run more than once.
--
-- ── Why ────────────────────────────────────────────────────────────────────
--
-- Every migration in this directory carries a STATUS header written by a human.
-- Twice in one week those headers were wrong, and both times in the same
-- direction - the file claimed NOT APPLIED while the object was live in
-- production:
--
--   * add_appointment_no_overlap.sql said NOT APPLIED while its exclusion
--     constraint was enforcing on every insert
--   * tenant-resolution-fix.sql said "PARKED - do not run yet" while the
--     ordered function it describes was already the live definition
--
-- Neither was caught by reading. Both were caught by asking the database, and
-- only because somebody happened to ask.
--
-- A STATUS line is a claim about a system it cannot observe. It is true only
-- for as long as someone updates it in the same hour they run the SQL, and
-- nothing enforces that. So the header stops being the source of truth and
-- becomes a note; `scripts/migration-status.mjs` derives the real answer by
-- parsing each file for the objects it creates and checking whether they are
-- there.
--
-- ── What it returns, and what it deliberately does not ────────────────────
--
-- NAMES ONLY. Table names, column names, constraint names, index names,
-- function names, policy names. No definitions, no data, nothing about rows.
-- Knowing that a constraint called appointments_no_overlap exists tells you
-- nothing about anybody's appointments.
--
-- Granted to service_role alone. The status script runs from a terminal with
-- the service key; anon and authenticated have no reason to enumerate the
-- schema and are not given one.
create or replace function public.schema_objects()
returns table (
  kind text,
  name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'table'::text, c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all
  select 'column'::text, (c.relname || '.' || a.attname)::text
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and a.attnum > 0 and not a.attisdropped
  union all
  select 'constraint'::text, con.conname::text
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
   where n.nspname = 'public'
  union all
  select 'index'::text, i.indexname::text
    from pg_indexes i
   where i.schemaname = 'public'
  union all
  select 'function'::text, p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
  union all
  select 'policy'::text, pol.policyname::text
    from pg_policies pol
   where pol.schemaname = 'public'
  union all
  select 'trigger'::text, t.tgname::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal;
$$;

revoke execute on function public.schema_objects() from public, anon, authenticated;
grant  execute on function public.schema_objects() to service_role;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) It returns something, and only names.
--        select kind, count(*) from public.schema_objects() group by kind order by 1;
--
--   b) The thing it is for. Expect one row each.
--        select * from public.schema_objects()
--         where name in ('appointments_no_overlap', 'reviews', 'package_entries');
--
--   c) anon cannot call it. Expect a permission error.
--        set local role anon;
--        select * from public.schema_objects();
--        reset role;
