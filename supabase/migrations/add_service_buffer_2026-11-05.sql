-- add_service_buffer_2026-11-05.sql
--
-- "זמן הפסקה אחרי הטיפול": minutes kept free after a treatment, per service.
--
-- ── STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor. ──
-- Until it runs, nothing breaks: every service reads as "use the business default" (Settings > כללי קביעת תור, stored in
-- settings.branding.booking_rules.buffer_minutes, jsonb, needs no migration), and that default is 0 unless she set one.
-- The per-service field in Settings is shown disabled with a line saying it is waiting for this update. Safe to run more
-- than once.
--
-- ── What it adds ────────────────────────────────────────────────────────────
-- public.service_prices.buffer_minutes   integer, NULLABLE, 0..120.
--   null  = use the business default (the column default, so every existing service keeps today's behaviour).
--   0     = no buffer for this service, even when the business default has one.
--   n     = n minutes after this treatment are busy, on the public page and in her calendar.
--
-- ── What it does NOT change ────────────────────────────────────────────────
-- appointments_no_overlap (add_appointment_no_overlap.sql) still guards [start, start + duration) only. The buffer is
-- enforced by the app (lib/serviceBuffer.ts, used by /api/availability, /api/book-appointment, the booking page and the
-- in-app checks). No appointment row changes, nothing is deleted.
--
-- get_public_services (service-prices-tenant-isolation.sql) returns `setof service_prices` with `select *`, so the new
-- column is included there automatically. The booking page does not depend on that: /api/availability sends the buffers.

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

-- PostgREST caches the schema; without this the app keeps answering "column does not exist" for a while.
notify pgrst, 'reload schema';

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
