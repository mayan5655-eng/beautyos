-- diagnose_signup_concurrency_2026-10-24.sql   (READ-ONLY: nothing in here changes anything; run it in the Supabase SQL editor)
--
-- WHY: 2026-10-24, scripts/smoke/capacity.mjs and the signup test: when 3-8 new accounts are created at the same moment, a share of them
-- fail with "Database error creating new user" (5 at once: 1-3 lost; 8 at once: 5 lost). Alone or two at a time they all work. A real
-- signup that hits this gets "משהו נתקע אצלנו" and has to try again; the sign-up page now retries by itself (app/signup/page.tsx), which
-- hides the symptom but not the cause. The cause is in the sign-up step of the database (a trigger on auth.users that creates the tenant,
-- the membership and the settings row, plus whatever other triggers hang on auth.users and tenants). Its text is not in this repo, so the
-- first step is to read it. Send the output of the three queries below to whoever fixes it.
--
-- WHAT TO LOOK FOR in the function bodies: a slug or name made from count(*) / max(...) + 1 or from the time (two simultaneous signups
-- compute the same one and the second hits a unique index), a `lock table`, a select ... for update on a shared row, a read of a row another
-- signup is writing, a loop that retries on unique_violation.

-- 1. Every trigger on auth.users, tenants, tenant_members and settings (enabled flag 'O' = on)
select c.relname as on_table, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal
   and ((n.nspname = 'auth' and c.relname = 'users') or (n.nspname = 'public' and c.relname in ('tenants', 'tenant_members', 'settings')))
 order by c.relname, t.tgname;

-- 2. The source of every function those triggers call
select distinct p.proname, pg_get_functiondef(p.oid) as source
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal
   and ((n.nspname = 'auth' and c.relname = 'users') or (n.nspname = 'public' and c.relname in ('tenants', 'tenant_members', 'settings')));

-- 3. The unique indexes a simultaneous signup can collide on
select schemaname, tablename, indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename in ('tenants', 'tenant_members', 'settings') and indexdef ilike '%unique%'
 order by tablename, indexname;
