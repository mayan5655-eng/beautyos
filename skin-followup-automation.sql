-- skin-followup-automation.sql   (PROPOSED — do NOT run without approval)
--
-- Reuses the EXISTING per-tenant config store (public.settings) — no new table,
-- no new settings architecture. Adds ONE additive JSONB column `automations`,
-- matching the store's existing structured-config convention (settings.business_hours,
-- settings.faq are already JSONB). This single column holds structured config for
-- EVERY automation (mode now; later: working hours, sending days, cooldown,
-- included/excluded services, template, approval) with no further migrations.
--
-- Additive + fully backward compatible:
--   * Existing boolean automation flags (reminders_enabled, gap_fill_enabled,
--     send_receipt_auto, …) are UNTOUCHED and keep working exactly as before.
--   * Default is an empty object, so every clinic starts effectively OFF — applying
--     this changes NO behavior until a cosmetician opts in.
--   * The app reads `automations` DEFENSIVELY (missing/null -> defaults), so the
--     feature already works in preview/test mode BEFORE this runs; the column only
--     makes the per-clinic choice persistable.
-- Safe to re-run ("if not exists").

alter table public.settings
  add column if not exists automations jsonb not null default '{}'::jsonb;

-- Shape stored inside settings.automations (all keys optional; read with defaults):
-- {
--   "paused": false,                         -- clinic-level master pause (overrides all)
--   "skin_followup": { "mode": "off" }       -- 'off' | 'approval' | 'automatic'
--   -- future automations add their own key here, e.g.
--   -- "reminders": { "mode": "approval", "cooldownDays": 14, "sendDays": [0,1,2,3,4] }
-- }

-- ROLLBACK (fully reversible; the column holds only preferences — no data loss):
--   alter table public.settings drop column if exists automations;
