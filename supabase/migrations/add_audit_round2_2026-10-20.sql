-- add_audit_round2_2026-10-20.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. The code works before it runs.
-- From the second code audit round of 2026-10-20 (written 2026-10-24, when the fix was merged).
--
-- reminder_claims: one row per appointment and reminder kind ('day_before:<date>'), written BEFORE the reminder is sent
-- (lib/reminders/dailyReminders.js claimReminder). A tenant whose run timed out keeps going in the background, and a retry used
-- to send a second reminder next to it; the unique key makes the second sender stop. Until this runs, every claim answers
-- 'none' and reminders behave exactly as before.
--
-- Service role only: no anon / authenticated access, RLS on with no policies.

create table if not exists public.reminder_claims (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind           text not null,
  created_at     timestamptz not null default now(),
  primary key (appointment_id, kind)
);

alter table public.reminder_claims enable row level security;
revoke all on public.reminder_claims from anon, authenticated;

create index if not exists idx_reminder_claims_created on public.reminder_claims (created_at);

-- Verify:
--   select count(*) from public.reminder_claims;                          -- 0 right after, grows each evening run
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'reminder_claims' and grantee in ('anon', 'authenticated');   -- no rows
--
-- Undo:
--   drop table if exists public.reminder_claims;
