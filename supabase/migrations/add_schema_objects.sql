-- add_schema_objects.sql
--
-- Creates the missing public.schema_objects() function. RUN BY HAND in the Supabase SQL editor. Safe to run more than once.
--
-- WHY: the daily data check (lib/invariants.js, check 7 "missing_tables" / "missing_columns") calls
--   db.rpc('schema_objects')
-- and the function does not exist in the live database, so every night since 2026-10-06 that check fails with
-- "Could not find the function public.schema_objects" and the nightly alert carries that error line. scripts/migration-status.mjs
-- calls the same function.
--
-- WHAT THE CODE EXPECTS (read from lib/invariants.js and scripts/migration-status.mjs):
--   - callable with NO arguments, by the service role only;
--   - rows of (kind text, name text);
--   - kind 'table'  -> name = the table name                    (REFERENCED_TABLES are compared to these)
--   - kind 'column' -> name = 'table.column'                    (REFERENCED_COLUMNS are compared to these)
--   - migration-status also reads kinds 'constraint', 'index', 'function', 'policy', 'trigger'.
--   NAMES ONLY: no definitions, no data, nothing about any row of any business.
--
-- ONE DETAIL THAT MATTERS: the API returns at most 1000 rows per call (the "max rows" setting) and does not say it stopped.
-- This schema has about 650 table and column rows but more than 1000 rows in total once constraints, indexes, functions,
-- policies and triggers are added. So the rows are returned in a fixed order, tables first, then columns, then the rest: the
-- nightly check only needs the first two kinds, and they can never be the ones cut off.
--
-- This is the same function as supabase/migrations/add_schema_introspection.sql (written earlier, never run), plus the ordering
-- above. Run EITHER file, not both: if both are run, whichever ran last defines the function. This one is the better one.

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
  select o.kind, o.name
    from (
      select 'table'::text as kind, c.relname::text as name
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
       where n.nspname = 'public' and not t.tgisinternal
    ) o
   order by case o.kind when 'table' then 1 when 'column' then 2 else 3 end, o.kind, o.name;
$$;

-- Only the service role may call it: no business, no browser, no anonymous visitor can list the schema.
revoke execute on function public.schema_objects() from public, anon, authenticated;
grant  execute on function public.schema_objects() to service_role;

-- Make the API notice the new function straight away (otherwise it can answer "not found" for a short while).
notify pgrst, 'reload schema';

-- VERIFY (run each in the SQL editor)
--   a) It returns names, tables first. Expect the first rows to be kind = 'table':
--        select * from public.schema_objects() limit 5;
--   b) Counts per kind (expect table around 50, column several hundred):
--        select kind, count(*) from public.schema_objects() group by kind order by 1;
--   c) The tables the nightly check needs are present (expect 3 rows):
--        select * from public.schema_objects()
--         where kind = 'table' and name in ('grow_onboarding_updates', 'grow_onboarding_pending', 'owner_questions');
--   d) Nobody else can call it. Expect a permission error:
--        set local role anon;
--        select * from public.schema_objects();
--        reset role;
--   e) The next nightly run (01:00) should no longer report "Could not find the function public.schema_objects".
