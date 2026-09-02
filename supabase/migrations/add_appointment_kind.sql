-- add_appointment_kind.sql
--
-- Personal events in the calendar: an accountant meeting, a course, a day off,
-- the school run. Her own time, blocked out on the same calendar her clients
-- book into.
--
-- ── STATUS: APPLIED to production on 2026-09-02 ────────────────────────────
-- Run by hand in the Supabase SQL Editor, like every other file here.
--
-- Verified by BEHAVIOUR rather than by assuming the DDL took. Verify (d) below
-- was run and returned exactly what it was written to return: with a 10:00
-- personal event in place, a client appointment at 10:30 was REJECTED with
-- SQLSTATE 23P01 from appointments_no_overlap. That single result is the whole
-- feature - the personal event sits inside the overlap constraint, so a booking
-- cannot land on top of it - and it is the one thing that could not have been
-- established any other way. Both inserts were inside a transaction that was
-- rolled back.
--
-- The other verify blocks were NOT run. (a) and (b) are catalogue reads, and
-- (d) succeeding at all means the column exists and accepts 'personal'. (c) is
-- the exception worth naming: nothing has confirmed that the check constraint
-- REJECTS a bad kind. Its DDL is unconditional in the same script that (d)
-- proves ran, so it is almost certainly there, but "almost certainly" is not
-- what this header is for. Run (c) if you want it closed.
--
-- The application code that reads these columns shipped BEFORE this migration
-- was applied and was harmless without it: `kind` came back undefined on every
-- row, `kind === 'personal'` was false, and every screen behaved exactly as it
-- had. Only creating a personal event needed the column.
--
-- Safe to run more than once.
--
-- ── Why these live in `appointments` and not in a table of their own ────────
--
-- Because of add_appointment_no_overlap.sql. There is a live GiST exclusion
-- constraint on this table:
--
--     exclude using gist (tenant_id with =, date with =,
--                         int4range(start_minute, start_minute+duration) with &&)
--     where (coalesce(confirmation_status,'') <> 'cancelled')
--
-- That constraint is the only thing that stops a double-booking under a race,
-- and its own migration is blunt about why the application checks were not
-- enough: they are "enforced only on the paths that remembered to call it, and
-- never against a concurrent writer".
--
-- An exclusion constraint cannot span two tables. A personal event in a
-- separate table would be invisible to it, and "a client must not be able to
-- book over her accountant meeting" would fall back to application-only checks
-- - exactly the arrangement that constraint exists to replace.
--
-- In this table, a personal event is simply a row that occupies an interval, so
-- it blocks a booking through every path that already exists, with no new code
-- on any of them:
--
--   * the exclusion constraint above  - the database refuses the overlap
--   * /api/availability               - selects date, start_minute, hour,
--                                       duration and nothing else, so the event
--                                       blocks the public booking page and its
--                                       TITLE CANNOT LEAK. Keep it that way:
--                                       there is no select('*') in that route
--                                       and there must never be one.
--   * /api/book-appointment           - clashesWith over the day's rows
--   * isFreeAt, apptBusy, the rebooking slot list, the gap-fill offer
--
-- The cost is the other direction: screens that assume every row has a client,
-- a service and a price. That set is enumerable and most of it already fails
-- safe, because the client-facing automations key off client_id - which a
-- personal event does not have - and skip a row without one.
--
-- ── kind ───────────────────────────────────────────────────────────────────
--
-- text rather than a boolean so a later 'break' or 'holiday' does not need
-- another migration, and so the value reads for itself in a predicate.
--
-- NOT NULL DEFAULT 'appointment' means every existing row is already correct
-- and there is no backfill to get wrong.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'appointments'
      and column_name  = 'kind'
  ) then
    alter table public.appointments
      add column kind text not null default 'appointment';
    raise notice 'added appointments.kind';
  else
    raise notice 'appointments.kind already exists, skipping';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_kind_check'
  ) then
    alter table public.appointments
      add constraint appointments_kind_check
      check (kind in ('appointment', 'personal'));
    raise notice 'added appointments_kind_check';
  end if;
end $$;

-- ── series_id ──────────────────────────────────────────────────────────────
--
-- A multi-day event is ONE ROW PER DAY, grouped by this id. Not one row with a
-- long duration, and the difference is not stylistic.
--
-- `date` is a single column and the exclusion constraint above keys on
-- `date with =`. A two-day event stored as one row with duration 2880 produces
-- the range [start, start+2880) ON ITS OWN DATE ONLY. The second day would not
-- be blocked - not by the constraint, not by /api/availability, not by any
-- calendar view, all of which filter on a single date. It would look booked and
-- be bookable, which is the exact failure this codebase has already shipped
-- twice and does not need a third time.
--
-- One row per day means every per-date mechanism keeps working untouched, and
-- series_id is what edit and delete operate on.
--
-- Nullable: an ordinary appointment has no series, and neither does a
-- single-day personal event.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'appointments'
      and column_name  = 'series_id'
  ) then
    alter table public.appointments add column series_id uuid;
    raise notice 'added appointments.series_id';
  else
    raise notice 'appointments.series_id already exists, skipping';
  end if;
end $$;

-- Edit and delete load a whole series at once. Partial, because the column is
-- null on every appointment and on most personal events.
create index if not exists appointments_tenant_series_idx
  on public.appointments (tenant_id, series_id)
  where series_id is not null;

-- ── What this deliberately does NOT do ─────────────────────────────────────
--
-- It does not touch confirmation_status, and the application does not write a
-- new value into it for personal events.
--
-- An earlier draft of this feature set confirmation_status = 'blocked' on them,
-- so that the confirmed/pending counters would drop them without knowing this
-- feature exists. Two reasons that was dropped:
--
--   1. public.appointments was created outside this repo, so nothing here can
--      show whether a CHECK constraint restricts that column's values. If one
--      does, every personal event insert fails with 23514 and the feature is
--      simply broken against the live database. That is not a risk worth
--      taking for defence in depth, and it is not verifiable from here.
--   2. `kind` is then the single source of truth, rather than a fact spread
--      across two columns that can disagree.
--
-- So personal events keep the column default ('pending'). Note that this is
-- what makes them participate in appointments_no_overlap, whose predicate is
-- `<> 'cancelled'` - a personal event has to be inside that constraint, or it
-- would not block anything. Every screen that counts confirmations filters on
-- `kind` explicitly instead; they are listed in the commit that adds them.
--
-- It also adds no all_day column. All-day is start_minute 0 with duration 1440,
-- which every existing overlap test already reads as "the whole day is busy",
-- and which the UI derives for display. A flag would be a second way to say the
-- same thing, and the two could disagree.
--
-- RLS needs no change: these are rows in a table that is already scoped to the
-- tenant, so a personal event is protected exactly as an appointment is.

-- ── Verify ─────────────────────────────────────────────────────────────────
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
--   a) The columns and the check exist.
--        select column_name, data_type, column_default, is_nullable
--          from information_schema.columns
--         where table_schema = 'public' and table_name = 'appointments'
--           and column_name in ('kind', 'series_id');
--        select conname, pg_get_constraintdef(oid)
--          from pg_constraint where conname = 'appointments_kind_check';
--
--   b) Every existing row came out as an appointment. Expect one row,
--      'appointment', with the full table count.
--        select kind, count(*) from public.appointments group by kind;
--
--   c) The check bites. Expect 23514.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration, kind)
--          values ('<your-tenant-id>', '2020-01-09', 600, 'bad kind', '', 60, 'nonsense');
--        rollback;
--
--   d) THE ONE THAT MATTERS. A personal event must block a client booking on
--      the same interval - this is the whole feature. The second insert must
--      fail with 23P01 (exclusion_violation), raised by
--      appointments_no_overlap.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration, kind)
--          values ('<your-tenant-id>', '2020-01-09', 600, 'רואה חשבון', '', 90, 'personal');
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 630, 'לקוחה', 'פנים', 60);
--        rollback;
--
--   e) And an all-day event must block the entire day, at any hour.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration, kind)
--          values ('<your-tenant-id>', '2020-01-09', 0, 'חופש', '', 1440, 'personal');
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 1140, 'לקוחה', 'פנים', 60);
--        rollback;
