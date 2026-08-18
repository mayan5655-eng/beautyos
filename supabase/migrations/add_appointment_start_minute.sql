-- add_appointment_start_minute.sql
--
-- Appointments can currently only start on a whole hour: `hour` is an integer
-- and every screen renders `${hour}:00`. A cosmetician cannot book 14:30, which
-- is most of her day - the duration column already contains 30 and 45, so a
-- 30-minute treatment at 09:00 ends at 09:30 and the next bookable slot is
-- 10:00. Half an hour is lost per short appointment, today.
--
-- start_minute is minutes from midnight (0..1439). Chosen over a separate
-- `minute` column or a `time` type because the application ALREADY computes
-- `hour * 60` at every point where the value matters - overlap detection,
-- availability, the booking guard - so those sites simplify rather than change
-- shape.
--
-- ADDITIVE ON PURPOSE. `hour` is left in place and kept in sync by the
-- application during the transition, so a deployment still running the old code
-- keeps working. A later migration drops `hour` once nothing reads it.
--
-- Safe to run more than once.

-- 1. The column.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'appointments'
      and column_name  = 'start_minute'
  ) then
    alter table public.appointments add column start_minute integer;
    raise notice 'added appointments.start_minute';
  else
    raise notice 'appointments.start_minute already exists, skipping';
  end if;
end $$;

-- 2. Backfill. Exact and lossless: every existing row starts on the hour.
update public.appointments
   set start_minute = hour * 60
 where start_minute is null
   and hour is not null;

-- 3. Guard rails. Applied AFTER the backfill so the table is already valid.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_start_minute_range'
  ) then
    alter table public.appointments
      add constraint appointments_start_minute_range
      check (start_minute is null or (start_minute >= 0 and start_minute <= 1439));
    raise notice 'added range check on start_minute';
  end if;
end $$;

-- 4. The calendar reads a day at a time and orders by start time.
create index if not exists appointments_tenant_date_start_minute_idx
  on public.appointments (tenant_id, date, start_minute);

-- 4b. THE ONE THAT WOULD OTHERWISE BLOCK EVERYTHING.
--
--     uniq_appt_slot_active enforces at most one active appointment per
--     (tenant_id, date, HOUR). Under that index a 14:30 booking is a duplicate
--     of a 14:00 one and the insert is rejected by the database, no matter what
--     the application allows. Re-key it on start_minute.
--
--     Note what this does and does not guarantee. It prevents two appointments
--     starting at the SAME minute. It does not prevent a 14:00+60 overlapping a
--     14:30+30 - at whole-hour granularity those were the same thing, and now
--     they are not. Overlap is enforced in the application (lib/apptTime
--     clashesWith, used by the booking guard and the in-app modal).
--
--     A database-level overlap guarantee is possible with an exclusion
--     constraint over int4range(start_minute, start_minute + duration) and
--     btree_gist. That is a stronger fix and worth doing, but it needs an
--     extension and would fail outright if any existing row already overlaps -
--     so it is deliberately NOT bundled into this migration.
drop index if exists uniq_appt_slot_active;
create unique index if not exists uniq_appt_slot_active
  on public.appointments (tenant_id, date, start_minute)
  where confirmation_status <> 'cancelled';

-- 5. The same move for the gap-fill offer table, so a reclaimed slot can carry
--    a half-hour start too. Empty today (0 rows), so the backfill is a no-op.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'slot_offers'
      and column_name  = 'slot_start_minute'
  ) then
    alter table public.slot_offers add column slot_start_minute integer;
    update public.slot_offers set slot_start_minute = slot_hour * 60 where slot_start_minute is null and slot_hour is not null;
    raise notice 'added slot_offers.slot_start_minute';
  else
    raise notice 'slot_offers.slot_start_minute already exists, skipping';
  end if;
end $$;

-- 6. Verify. Expect zero rows from each.
--    select count(*) from public.appointments where start_minute is null;
--    select count(*) from public.appointments where start_minute <> hour * 60;
