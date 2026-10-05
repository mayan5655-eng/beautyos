-- add_ops_events.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-05). Run by hand in the Supabase SQL
-- editor. The header is not proof of anything - check with
-- `npm run migrations:status`, or the verify queries at the bottom.
--
-- WHAT IT IS. The log behind "alerts to the operator" (lib/opsAlert.js), shown
-- at /dashboard/admin. Every cron that finishes incomplete, and the nightly
-- invariants report, writes a row here BEFORE it tries WhatsApp, and records
-- what WhatsApp did afterwards. The alert used to travel on one channel only:
-- a WhatsApp message through the central GreenAPI number whose disconnection it
-- was meant to report. A WhatsApp alert about WhatsApp being down cannot arrive,
-- and GreenAPI answers 200 either way, so "sent" proved nothing.
--
-- WHO CAN SEE IT. Nobody but the service role. RLS is on, no policy exists, and
-- anon/authenticated hold no privileges: the admin page and the crons read and
-- write it through the service-role client, so a tenant cannot read, enumerate
-- or discover it. Rows describe the PLATFORM (which cron missed which tenant
-- ids), never client data.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: raiseOpsAlert logs "ops_events
-- table does not exist" to the Vercel log, still attempts WhatsApp, and returns
-- recorded:false. The nightly invariants check will ALSO report this table as
-- missing (lib/referencedTables.js) until this file has run - that is the check
-- working, not a fault.

begin;

create table if not exists public.ops_events (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- which job raised it: 'send-reminders', 'send-owner-evening',
  -- 'send-smart-reminders', 'legal-receipts-retry', 'invariants'
  source            text not null,
  severity          text not null check (severity in ('info', 'warning', 'error')),
  message           text not null,
  details           jsonb,
  -- what the WhatsApp attempt did: pending | handed_to_greenapi | queued_not_sent
  -- | failed | timed_out | no_operator_number. "handed_to_greenapi" is NOT
  -- "delivered": GreenAPI returns 200 whether or not anything reaches a phone.
  whatsapp_delivery text not null default 'pending'
);

create index if not exists ops_events_created_idx on public.ops_events (created_at desc);

alter table public.ops_events enable row level security;
revoke all on public.ops_events from anon, authenticated;
-- Deliberately no policies: only the service role (which bypasses RLS) can touch it.

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (run after the above; each should return what the comment says)
-- ---------------------------------------------------------------------------
-- table exists, RLS on, no policies:
--   select relrowsecurity from pg_class where oid = 'public.ops_events'::regclass;      -- t
--   select count(*) from pg_policies where tablename = 'ops_events';                     -- 0
-- tenants and anonymous visitors hold nothing on it:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'ops_events' and grantee in ('anon', 'authenticated');           -- no rows
-- it works end to end (then remove the test row):
--   insert into public.ops_events (source, severity, message) values ('manual-test', 'info', 'hello');
--   select id, created_at, source, whatsapp_delivery from public.ops_events order by created_at desc limit 1;
--   delete from public.ops_events where source = 'manual-test';
