-- add_reschedule_intake_2026-11-09.sql
--
-- Two small columns, for two features that already work without them:
--   1. "להזיז את התור" (app/api/confirm/reschedule): how many times the client moved this appointment from her link.
--   2. The pre-visit intake gate (lib/intakeGate.ts): per service, "טופס חובה לפני הטיפול" and "בדיקת רגישות".
--
-- ── STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor. ──
-- Until it runs nothing breaks:
--   * Moving works. The move count is read from her "תור הוזז" notifications for that appointment instead
--     (owner_notifications kind 'reschedule'), so the limit of 2 moves still holds.
--   * The intake gate is off everywhere and its setting is not shown in Settings > שירותים: there is nowhere to store it.
--     No badge, no form link, no queued message. Everything books exactly as before.
-- Safe to run more than once.
--
-- ── What it adds ────────────────────────────────────────────────────────────
-- public.appointments.reschedule_count   smallint NOT NULL DEFAULT 0, >= 0.
--   Raised by one on every move the client makes from her link. Her own moves in the app do not count.
-- public.service_prices.intake           jsonb NULLABLE.
--   null = no gate (the default for every service). { "form": true, "form_type": "general", "patch_test": true }
--   when she turns it on. Only a literal true turns a part on.
-- No data is rewritten.

alter table public.appointments
  add column if not exists reschedule_count smallint not null default 0;

alter table public.appointments
  drop constraint if exists appointments_reschedule_count_nonneg;

alter table public.appointments
  add constraint appointments_reschedule_count_nonneg check (reschedule_count >= 0);

alter table public.service_prices
  add column if not exists intake jsonb;

alter table public.service_prices
  drop constraint if exists service_prices_intake_object;

alter table public.service_prices
  add constraint service_prices_intake_object check (intake is null or jsonb_typeof(intake) = 'object');

-- PostgREST caches the schema: make the new columns visible to the app at once.
notify pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────────
-- a) Both columns exist. EXPECT two rows: appointments | reschedule_count | smallint, service_prices | intake | jsonb
--    select table_name, column_name, data_type from information_schema.columns
--     where table_schema = 'public' and ((table_name = 'appointments' and column_name = 'reschedule_count')
--        or (table_name = 'service_prices' and column_name = 'intake'));
-- b) Nothing is gated yet. EXPECT 0.
--    select count(*) from public.service_prices where intake is not null;
