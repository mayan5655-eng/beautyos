-- add_service_buffer_2026-11-05.sql
--
-- "זמן הפסקה אחרי הטיפול": minutes kept free after a treatment, per service.
--
-- ── STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor. ──
-- Until it runs, nothing breaks: every service reads as "use the business default" (Settings > כללי קביעת תור, stored in
-- settings.branding.booking_rules.buffer_minutes, jsonb, needs no migration), and that default is 0 unless she set one.
-- Every appointment writer retries once without appointments.buffer_minutes (lib/apptBuffer.ts), and the database
-- keeps guarding [start, start + duration) as it does today.
-- The per-service field in Settings is shown disabled with a line saying it is waiting for this update. Safe to run more
-- than once.
--
-- ── What it adds ────────────────────────────────────────────────────────────
-- public.service_prices.buffer_minutes   integer, NULLABLE, 0..120.
--   null  = use the business default (the column default, so every existing service keeps today's behaviour).
--   0     = no buffer for this service, even when the business default has one.
--   n     = n minutes after this treatment are busy, on the public page and in her calendar.
--
-- public.appointments.buffer_minutes     smallint, NULLABLE, 0..120. null means 0.
--   The buffer the app CHECKED this appointment with when it was booked or moved (lib/apptBuffer.ts): the service's
--   buffer, or 0 for a personal block. Written by every booking writer; an edit that does not move the appointment
--   leaves it alone. Every existing row stays null (= 0), so nothing about today's appointments changes.
--
-- ── What it changes: appointments_no_overlap ───────────────────────────────
-- Vercel security review (2026-11-08): the buffer was enforced only by the app, against a snapshot. Two concurrent
-- public bookings could both read an empty day, both pass, and both insert back-to-back rows that eat each other's
-- buffer, because the constraint guarded [start, start + duration) only.
--
-- The constraint is rebuilt below, by name, in ONE transaction, so each row's range includes its own trailing buffer:
--     [start_minute, start_minute + duration + coalesce(buffer_minutes, 0))
-- Everything else is copied verbatim from add_appointment_no_overlap.sql: tenant_id with =, date with =, the CASE that
-- turns a null start_minute, a null duration or a duration <= 0 into 'empty' (it overlaps nothing), and the WHERE
-- clause that leaves cancelled appointments out. The original has no `kind` term and no `hour` fallback (hour is kept
-- in sync with start_minute by appointments_sync_start_minute_trg), so this has none either: a personal block is an
-- ordinary row and simply stores buffer_minutes 0.
--
-- Why this is exactly the app's rule. Existing A = [sA, eA + bA), new B = [sB, eB + bB), half-open. Two half-open
-- ranges overlap iff sA < eB + bB and sB < eA + bA. lib/serviceBuffer.ts clashesWithBuffer refuses B iff
-- sB < eA + bA (B starts before A's buffer ends) and sA < eB + bB (A starts before B's own buffer ends): the same two
-- inequalities. Back-to-back with no buffers (eA = sB, bA = 0) is still allowed. test-appointment-buffer-constraint.ts
-- checks this over a grid.
--
-- CLOSING TIME. The database does not know her hours, so a buffer may run past closing, exactly as the app allows
-- (the treatment must end by closing; the clean-up after the last client may not). Her lunch break is not known here
-- either: the app keeps a booking's buffer out of it.
--
-- Why it cannot fail on existing data: every existing row has buffer_minutes null, so its range is exactly what the
-- live constraint already accepted. The rebuilt constraint is validated against the same ranges.
--
-- ── What it does NOT change ────────────────────────────────────────────────
-- uniq_appt_slot_active, appointments.hour and its sync trigger. No appointment row changes, nothing is deleted.
--
-- get_public_services (service-prices-tenant-isolation.sql) returns `setof service_prices` with `select *`, so the new
-- service column is included there automatically; the public booking page reads the buffer of the service a visitor
-- is booking from that list. /api/availability sends merged busy ranges only (no per-appointment buffer).
--
-- Run the WHOLE file at once: it is one transaction (begin ... commit), so the constraint is never missing.

begin;

-- So the gist operator classes resolve wherever btree_gist landed (add_appointment_no_overlap.sql installed it).
set local search_path = public, extensions;

alter table public.service_prices
  add column if not exists buffer_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_prices_buffer_minutes_range'
      and conrelid = 'public.service_prices'::regclass
  ) then
    alter table public.service_prices
      add constraint service_prices_buffer_minutes_range
      check (buffer_minutes is null or (buffer_minutes >= 0 and buffer_minutes <= 120));
  end if;
end $$;

comment on column public.service_prices.buffer_minutes is
  'Minutes kept free after this treatment (lib/serviceBuffer.ts). null = business default in settings.branding.booking_rules.buffer_minutes.';

-- ── appointments.buffer_minutes ────────────────────────────────────────────
alter table public.appointments
  add column if not exists buffer_minutes smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_buffer_minutes_range'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_buffer_minutes_range
      check (buffer_minutes is null or (buffer_minutes >= 0 and buffer_minutes <= 120));
  end if;
end $$;

comment on column public.appointments.buffer_minutes is
  'Minutes kept free after this appointment, as checked when it was booked or moved (lib/apptBuffer.ts). null = 0. Part of appointments_no_overlap.';

-- ── appointments_no_overlap, rebuilt with the buffer ───────────────────────
-- Skipped when the live definition already has the buffer term, so running the file twice is a no-op.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'appointments_no_overlap'
      and conrelid = 'public.appointments'::regclass
      and pg_get_constraintdef(oid) like '%buffer_minutes%'
  ) then
    raise notice 'appointments_no_overlap already includes buffer_minutes, skipping';
    return;
  end if;

  alter table public.appointments drop constraint if exists appointments_no_overlap;

  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      tenant_id with =,
      date with =,
      (
        -- The half-open interval [start, start + duration + buffer), as int4range. Only the upper bound differs from
        -- add_appointment_no_overlap.sql; the CASE is the same and for the same reason (a NULL bound is INFINITE, so a
        -- row with no usable time must be 'empty', not veto the whole day). A null buffer is 0. The buffer may run
        -- past closing time: the database does not check closing.
        case
          when start_minute is null or duration is null or duration <= 0
            then 'empty'::int4range
          else int4range(start_minute, start_minute + duration + coalesce(buffer_minutes, 0))
        end
      ) with &&
    )
    -- Copied verbatim from add_appointment_no_overlap.sql: cancelled appointments free their slot.
    where (coalesce(confirmation_status, '') <> 'cancelled');

  raise notice 'rebuilt appointments_no_overlap with buffer_minutes';
end $$;

-- PostgREST caches the schema; without this the app keeps answering "column does not exist" for a while.
-- Inside the transaction, so it is delivered at commit.
notify pgrst, 'reload schema';

commit;

-- ── Verify (run after) ─────────────────────────────────────────────────────
-- 1. The column exists, nullable, integer:
--      select column_name, data_type, is_nullable
--        from information_schema.columns
--       where table_schema = 'public' and table_name = 'service_prices' and column_name = 'buffer_minutes';
--    expect one row: buffer_minutes | integer | YES
-- 2. The range check exists:
--      select conname from pg_constraint where conname = 'service_prices_buffer_minutes_range';
--    expect one row.
-- 3. Nothing changed for existing services (all null = business default):
--      select count(*) filter (where buffer_minutes is not null) as set_rows, count(*) as all_rows from public.service_prices;
--    expect set_rows = 0 right after running.
-- 4. appointments.buffer_minutes exists, smallint, nullable, with its range check:
--      select column_name, data_type, is_nullable
--        from information_schema.columns
--       where table_schema = 'public' and table_name = 'appointments' and column_name = 'buffer_minutes';
--    expect one row: buffer_minutes | smallint | YES
--      select conname from pg_constraint where conname = 'appointments_buffer_minutes_range';
--    expect one row.
-- 5. The constraint has the buffer term and the old WHERE clause:
--      select pg_get_constraintdef(oid) from pg_constraint where conname = 'appointments_no_overlap';
--    expect one row containing COALESCE((buffer_minutes)::integer, 0) and WHERE (COALESCE(confirmation_status, ''::text) <> 'cancelled'::text)
-- 6. It bites on a buffer, and only on a buffer. Rolled back, so nothing is left behind. Use a TEST tenant id, never
--    the owner's (448e9e45-...): the SQL editor bypasses RLS and the literal decides whose table is written to.
--      begin;
--        -- 14:00+60 with a 15 minute buffer: busy until 15:15.
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration, buffer_minutes)
--        values ('<test-tenant-id>', '2020-01-09', 840, 'buffer test a', 'test', 60, 15);
--        -- 15:00+30 starts inside that buffer: must FAIL with 23P01.
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--        values ('<test-tenant-id>', '2020-01-09', 900, 'buffer test b', 'test', 30);
--      rollback;
--      begin;
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration, buffer_minutes)
--        values ('<test-tenant-id>', '2020-01-09', 840, 'buffer test a', 'test', 60, 15);
--        -- 15:15+30 starts as the buffer ends: must SUCCEED.
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--        values ('<test-tenant-id>', '2020-01-09', 915, 'buffer test c', 'test', 30);
--        -- 13:30+15 with its own 15 minute buffer ends at 14:00 exactly: must SUCCEED.
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration, buffer_minutes)
--        values ('<test-tenant-id>', '2020-01-09', 810, 'buffer test d', 'test', 15, 15);
--      rollback;
--      begin;
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--        values ('<test-tenant-id>', '2020-01-09', 840, 'buffer test a', 'test', 60);
--        -- 13:30+15 whose own 20 minute buffer runs to 14:05: must FAIL with 23P01.
--        insert into public.appointments (tenant_id, date, start_minute, name, service, duration, buffer_minutes)
--        values ('<test-tenant-id>', '2020-01-09', 810, 'buffer test e', 'test', 15, 20);
--      rollback;
--
-- ── Rollback (only if something is wrong) ──────────────────────────────────
-- Restores the original constraint from add_appointment_no_overlap.sql exactly. Always succeeds: the original ranges
-- are never longer than the buffered ones, so rows the rebuilt constraint accepted cannot overlap under it. The
-- buffer_minutes columns can stay (the app reads and writes them either way); drop them only if you also want the
-- app back on its pre-migration fallback.
--      begin;
--        set local search_path = public, extensions;
--        alter table public.appointments drop constraint if exists appointments_no_overlap;
--        alter table public.appointments
--          add constraint appointments_no_overlap
--          exclude using gist (
--            tenant_id with =,
--            date with =,
--            (
--              case
--                when start_minute is null or duration is null or duration <= 0
--                  then 'empty'::int4range
--                else int4range(start_minute, start_minute + duration)
--              end
--            ) with &&
--          )
--          where (coalesce(confirmation_status, '') <> 'cancelled');
--      commit;
--    Optional, after that:
--      alter table public.appointments drop constraint if exists appointments_buffer_minutes_range;
--      alter table public.appointments drop column if exists buffer_minutes;
--      notify pgrst, 'reload schema';
