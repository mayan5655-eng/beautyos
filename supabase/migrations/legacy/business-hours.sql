-- business-hours.sql
-- Per-day working hours for each tenant, as a JSONB object on public.settings.
-- Keys are day-of-week (JS getDay(): 0=Sun … 6=Sat); each value is either
-- {"open": <hour int>, "close": <hour int>} or null (closed). Hours are whole
-- integers, matching the rest of the app.
--
-- The legacy working_hours_start / working_hours_end / working_days columns are
-- KEPT for back-compat; this only ADDS business_hours. Safe to re-run.

-- 1. Add the column (nullable for now, so existing rows are backfilled below
--    rather than force-defaulted into new behaviour).
alter table public.settings
  add column if not exists business_hours jsonb;

-- 2. BACK-COMPAT backfill for EXISTING tenants: reuse each tenant's current
--    single start/end on the days they already effectively work (Sun–Fri open,
--    Saturday closed — today's booking-page behaviour), so nobody's hours or
--    open days change. Only touches rows not yet populated → re-run safe, never
--    clobbers later per-day edits.
update public.settings s
set business_hours = jsonb_build_object(
  '0', jsonb_build_object('open', coalesce(working_hours_start, 9), 'close', coalesce(working_hours_end, 18)),
  '1', jsonb_build_object('open', coalesce(working_hours_start, 9), 'close', coalesce(working_hours_end, 18)),
  '2', jsonb_build_object('open', coalesce(working_hours_start, 9), 'close', coalesce(working_hours_end, 18)),
  '3', jsonb_build_object('open', coalesce(working_hours_start, 9), 'close', coalesce(working_hours_end, 18)),
  '4', jsonb_build_object('open', coalesce(working_hours_start, 9), 'close', coalesce(working_hours_end, 18)),
  '5', jsonb_build_object('open', coalesce(working_hours_start, 9), 'close', coalesce(working_hours_end, 18)),
  '6', null
)
where business_hours is null;

-- 3. NEW tenants default to Sun–Thu 09:00–18:00, Fri & Sat closed
--    (the requested sensible default; applies to future inserts only).
alter table public.settings
  alter column business_hours set default '{
    "0": {"open": 9, "close": 18},
    "1": {"open": 9, "close": 18},
    "2": {"open": 9, "close": 18},
    "3": {"open": 9, "close": 18},
    "4": {"open": 9, "close": 18},
    "5": null,
    "6": null
  }'::jsonb;

-- 4. OPTIONAL hardening (skip if you want maximum leniency): every existing row
--    is now populated and new rows get the default, so presence can be enforced,
--    plus a light shape guard. Code will still treat a missing value as "fall
--    back to legacy", so leaving these off breaks nothing either.
-- alter table public.settings alter column business_hours set not null;
-- alter table public.settings
--   add constraint settings_business_hours_is_object
--   check (jsonb_typeof(business_hours) = 'object');
