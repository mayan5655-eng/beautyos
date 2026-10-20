-- add_cron_runs.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-20). Run by hand in the Supabase SQL editor. Check with the verify queries below.
--
-- WHAT. One row per scheduled job (vercel.json "crons"): when it last started. Every cron route stamps it right after its auth
-- check (lib/cronHeartbeat.js markCronRun), and the nightly invariants check reports a job whose stamp is older than its
-- schedule allows (a job that never starts writes nothing, so nothing else could notice). The admin page shows the same list.
--
-- WHO CAN SEE IT. Only the service role: RLS on, no policy, nothing granted to anon or authenticated. It holds job names and
-- timestamps only.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: the stamp is logged as "cron_runs missing" and the job runs as before; the nightly
-- check reports 0 for this item.

begin;

create table if not exists public.cron_runs (
  job          text primary key check (job ~ '^[a-z0-9-]{2,60}$'),
  last_run_at  timestamptz not null default now()
);

alter table public.cron_runs enable row level security;

revoke all on public.cron_runs from public;
revoke all on public.cron_runs from anon, authenticated;
grant select, insert, update on public.cron_runs to service_role;

commit;

-- ── verify ────────────────────────────────────────────────────────────────
--   select relrowsecurity from pg_class where oid = 'public.cron_runs'::regclass;          -- true
--   select count(*) from pg_policies where tablename = 'cron_runs';                        -- 0
--   -- a day after running it, every job should be here:
--   select job, last_run_at from public.cron_runs order by job;
