-- add_service_rebook_days_2026-11-09.sql
--
-- "להזכיר לחזור אחרי": per service, how many days after a visit the client gets a friendly "time for the next one" nudge.
--
-- ── STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor. ──
-- Until it runs nothing breaks: the column is simply absent, every service reads as "no number of its own", and the
-- daily nudge (lib/reminders/rebookPlan.js) uses the client's own rhythm, then a suggestion by the treatment's name
-- (gel 21 days, facial 35, brows 28, ...), then the business default (21 nails-only, otherwise 35), exactly as the
-- rebook nudge worked before. The per-service field in Settings > שירותים is shown disabled with a line saying it is
-- waiting for this update. Safe to run more than once.
--
-- ── What it adds ────────────────────────────────────────────────────────────
-- public.service_prices.rebook_days   smallint, NULLABLE, 0 or 7..365.
--   null = automatic (her client's own rhythm, else the suggestion for this kind of treatment).
--   0    = never nudge for this service (a once-a-year touch-up, a one-off treatment).
--   n    = nudge n days after the client's last visit of this service, if she has nothing booked.
-- Nothing else changes. No data is rewritten; every existing service stays null (= automatic).

alter table public.service_prices
  add column if not exists rebook_days smallint;

alter table public.service_prices
  drop constraint if exists service_prices_rebook_days_range;

alter table public.service_prices
  add constraint service_prices_rebook_days_range
  check (rebook_days is null or rebook_days = 0 or (rebook_days between 7 and 365));

-- PostgREST caches the schema: make the new column visible to the app at once.
notify pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────────
-- a) The column exists. EXPECT one row: rebook_days | smallint | YES
--    select column_name, data_type, is_nullable from information_schema.columns
--     where table_schema = 'public' and table_name = 'service_prices' and column_name = 'rebook_days';
-- b) The range check exists. EXPECT one row.
--    select conname from pg_constraint where conname = 'service_prices_rebook_days_range';
