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

-- 3b. THE TRIGGER THAT MAKES THE ROLLOUT WINDOW SAFE.
--
--     Between running this file and deploying the new code, production is still
--     the OLD build: it writes `hour` and knows nothing about start_minute, so
--     every row it inserts would land with start_minute NULL.
--
--     That matters because of step 4b. In PostgreSQL NULLs are DISTINCT in a
--     unique index, so a table full of NULL start_minute rows satisfies
--     uniq_appt_slot_active no matter how many share a slot - the double-booking
--     guard would be silently disabled for the whole window. Silently is the bad
--     part: bookAppointmentSlot detects a lost race by catching a 23505, and
--     with no violation raised the race is simply won twice.
--
--     Keeping both columns in sync in the database removes the window entirely:
--       old code writes hour        -> start_minute derived here
--       new code writes both        -> hour recomputed here (same value)
--       anything updates either one -> the other follows
--
--     It also means `hour` stays correct for free until it is dropped, so the
--     eventual cleanup migration is just "drop trigger, drop column".
create or replace function public.appointments_sync_start_minute()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- start_minute wins when supplied; otherwise derive it from hour.
    if new.start_minute is null and new.hour is not null then
      new.start_minute := new.hour * 60;
    end if;
    if new.start_minute is not null then
      new.hour := new.start_minute / 60;   -- integer division, floors
    end if;
    return new;
  end if;

  -- UPDATE. Which column actually moved decides the direction.
  --
  -- This distinction is not cosmetic. The old build reschedules by setting
  -- `hour` alone, and on UPDATE new.start_minute still carries the row's
  -- EXISTING value - so blindly recomputing hour from it would overwrite the
  -- reschedule and silently put the appointment back where it was.
  if new.start_minute is distinct from old.start_minute then
    -- start_minute was set explicitly (new build): it is the truth.
    if new.start_minute is not null then
      new.hour := new.start_minute / 60;
    end if;
  elsif new.hour is distinct from old.hour then
    -- only hour moved (old build): follow it.
    if new.hour is not null then
      new.start_minute := new.hour * 60;
    end if;
  end if;

  -- Backstop for a row that somehow still has no start_minute.
  if new.start_minute is null and new.hour is not null then
    new.start_minute := new.hour * 60;
  end if;

  return new;
end $$;

drop trigger if exists appointments_sync_start_minute_trg on public.appointments;
create trigger appointments_sync_start_minute_trg
  before insert or update on public.appointments
  for each row execute function public.appointments_sync_start_minute();

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
--
--     Depends on 3b: without the trigger, rows written by the old build would
--     carry a NULL start_minute, and NULLs are distinct in a unique index, so
--     this would enforce nothing at all until the new code shipped.
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

-- 6. Verify. Run each separately; the SQL editor shows only the last result.
--
--    a) No row is missing the new value, and the two columns agree.
--       Expect 0 and 0.
--         select
--           count(*) filter (where start_minute is null)          as missing,
--           count(*) filter (where start_minute <> hour * 60
--                              and start_minute is not null)      as disagreeing
--         from public.appointments;
--
--    b) The trigger is installed. Expect one row.
--         select tgname from pg_trigger
--          where tgrelid = 'public.appointments'::regclass
--            and not tgisinternal;
--
--    c) The unique index is keyed on start_minute, not hour.
--         select indexdef from pg_indexes
--          where tablename = 'appointments' and indexname = 'uniq_appt_slot_active';
--
-- ── Whose tenant ────────────────────────────────────────────────────────────
--
-- Every <your-tenant-id> below is a real decision, not a formality. These
-- blocks run in the Supabase SQL editor, where RLS does not apply: the literal
-- in the INSERT is the ONLY thing deciding whose table is written to.
--
-- The owner's tenant is 448e9e45-2251-4572-b665-886c5bc7a4c8. This file used to
-- spell b09637c8-a5c8-4b80-bda8-ff603f7ada60 into every example, because
-- STAGE_SUMMARY.md had annotated that id "(yours)" and six files copied the
-- annotation. It is a different, nearly empty tenant - 2 appointments against
-- 448e9e45's 29 - and for weeks every check described as running against the
-- owner's data ran against it instead. Placeholders now, so the id has to be
-- typed deliberately rather than inherited.
--
--    d) OPTIONAL end-to-end check of the rollout window, in a transaction that
--       is rolled back so nothing is left behind. Simulates the OLD build: it
--       writes `hour` only, and start_minute must come out populated. Replace
--       the tenant id with your own.
--         begin;
--           insert into public.appointments (tenant_id, date, hour, name, service, duration)
--           values ('<your-tenant-id>', '2020-01-09', 14, 'trigger test', 'test', 30)
--           returning hour, start_minute;      -- expect 14, 840
--         rollback;
