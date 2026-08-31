-- STATUS: UNKNOWN - verification query in README.md.
-- The folder name is not a status. See README.md in this directory.

-- appointment-cancel-audit.sql
--
-- Records WHO cancelled an appointment and WHEN.
--
-- ── Why ────────────────────────────────────────────────────────────────────
-- Until now the cosmetician's own cancel DELETED the row, while a client's
-- cancel (app/api/confirm) set confirmation_status = 'cancelled'. Two different
-- meanings of "cancelled" in one calendar: the client's stayed visible and
-- marked, hers vanished with no record that the appointment had ever existed.
--
-- The app now soft-cancels on both paths. These two columns are what let the
-- calendar answer "who cancelled this, and when" instead of only "cancelled".
--
-- ── Safe, and additive only ────────────────────────────────────────────────
-- Two nullable columns. NOTHING existing is deleted or rewritten: every row
-- already in public.appointments keeps every value it has, and the new columns
-- are simply NULL for cancellations that happened before this ran.
-- appointments.hour is untouched.
--
-- The app works BEFORE this runs. app/beautyos.jsx writes the cancel with these
-- columns, and on a "column does not exist" error retries without them - so a
-- cancel always succeeds and only the audit trail waits on this file. After it
-- runs, new cancellations start recording provenance with no code change.
--
-- Safe to run more than once.

alter table public.appointments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text;

comment on column public.appointments.cancelled_at is
  'When the appointment was cancelled. NULL for appointments that were never cancelled, and for cancellations made before this column existed.';
comment on column public.appointments.cancelled_by is
  'Who cancelled: ''business'' (the cosmetician, in-app) or ''client'' (via the confirm/cancel link). NULL for cancellations made before this column existed.';

-- Only the two values the app writes, but nullable so historic rows stay valid.
alter table public.appointments drop constraint if exists appointments_cancelled_by_check;
alter table public.appointments add constraint appointments_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('business', 'client'));

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) Both columns exist and are nullable. EXPECT two rows, is_nullable = YES.
--        select column_name, data_type, is_nullable
--          from information_schema.columns
--         where table_schema = 'public' and table_name = 'appointments'
--           and column_name in ('cancelled_at', 'cancelled_by');
--
--   b) NOTHING WAS LOST. Run BEFORE and AFTER; the two numbers must match.
--        select count(*) as appointments_total from public.appointments;
--
--   c) appointments.hour is still there and still populated.
--        select count(*) as total, count(hour) as with_hour
--          from public.appointments;
--
--   d) The check constraint accepts the two real values and rejects others.
--      Rolled back, so nothing is left behind. The third insert must fail.
--        begin;
--          update public.appointments set cancelled_by = 'business'
--           where id = (select id from public.appointments limit 1);
--          update public.appointments set cancelled_by = 'client'
--           where id = (select id from public.appointments limit 1);
--          update public.appointments set cancelled_by = 'nonsense'
--           where id = (select id from public.appointments limit 1);
--        rollback;
--
-- ── After this runs ────────────────────────────────────────────────────────
-- app/api/confirm/route.ts still writes only confirmation_status. Worth a
-- follow-up so a client cancellation stamps cancelled_by = 'client' - until
-- then, a NULL cancelled_by on a cancelled row means "client, or before this
-- migration", which is exactly the ambiguity the column exists to remove.
