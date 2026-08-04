-- automation-flags.sql
-- Adds the per-tenant on/off columns backing the "אוטומציות" (Automations)
-- settings tab. Each reminder automation is ON by default, matching how the
-- cron jobs (send-reminders, send-smart-reminders) behaved before the toggles
-- existed. Run in the Supabase SQL Editor.
--
-- Safe to re-run: every statement uses "if not exists".
-- The cron routes read these with default-ON semantics (a tenant is skipped
-- only when the flag is explicitly false), so even before this migration runs
-- nothing breaks — every tenant simply stays enabled.

alter table public.settings
  add column if not exists reminders_enabled         boolean not null default true,  -- day-before appointment reminders
  add column if not exists review_requests_enabled   boolean not null default true,  -- review request ~2 days after a visit
  add column if not exists winback_enabled            boolean not null default true,  -- win-back for clients dormant 90+ days
  add column if not exists package_reminders_enabled  boolean not null default true;  -- nudge after a treatment package is finished

-- Note: the WhatsApp bot (bot_active/bot_mode), gap-fill (gap_fill_enabled) and
-- auto-receipt (send_receipt_auto) toggles reuse columns that already exist —
-- only the four reminder flags above are new.
