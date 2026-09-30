-- STATUS: NOT YET APPLIED.
-- The folder name is not a status. See README.md in this directory.

-- appointment-actual-duration.sql
--
-- WHY THIS EXISTS. appointments.duration is what she BOOKED - a chip she
-- tapped (30/45/60/90) or a service's configured default. Nothing has ever
-- recorded what actually happened: a gel fill booked at 60 minutes might
-- routinely run 75, and the only record of that has been her own memory.
--
-- These two timestamps let the UI capture the real start and end of a
-- treatment (a "started" / "finished" button pair on the appointment) so the
-- gap between booked and actual can be shown back to her once, right when
-- she finishes - not buried in a report nobody opens. See lib/durationDrift.ts.
--
-- ADDITIVE: `duration` keeps meaning exactly what it always has (the booked
-- length, read by the calendar's own clash/overlap checks and by
-- lib/scheduleGaps.ts). These columns are a separate, optional record of what
-- really happened; both null means "never started/finished with the new
-- buttons," not "zero duration."
--
-- Safe to run more than once.

alter table public.appointments
  add column if not exists actual_start_at timestamptz,
  add column if not exists actual_end_at timestamptz;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The columns exist.
--        select column_name, data_type from information_schema.columns
--         where table_name = 'appointments'
--           and column_name in ('actual_start_at','actual_end_at');
--
--   b) Once in use: the appointments whose actual run differs most from booked.
--        select id, name, service, duration as booked_minutes,
--               round(extract(epoch from (actual_end_at - actual_start_at))/60) as actual_minutes
--          from public.appointments
--         where actual_start_at is not null and actual_end_at is not null
--         order by abs(round(extract(epoch from (actual_end_at - actual_start_at))/60) - duration) desc
--         limit 20;
