-- skin-followup-automation.sql   (PROPOSED — do NOT run without approval)
--
-- Adds the automation controls behind the Skin-scan → WhatsApp follow-up feature.
-- Additive and default-safe: every clinic starts OFF, so applying this migration
-- changes NO behavior until a cosmetician explicitly opts in. Mirrors the pattern
-- in automation-flags.sql. Safe to re-run (uses "if not exists").
--
-- The app reads both columns DEFENSIVELY (missing/null -> default), so the
-- feature works in preview/test mode even BEFORE this runs — this migration only
-- makes the per-clinic choice persistable.

alter table public.settings
  -- Three-state control for the skin follow-up automation:
  --   'off'        -> feature disabled (DEFAULT)
  --   'approval'   -> build the approval queue; a human approves each message
  --   'automatic'  -> (reserved) auto-send; NOT implemented yet, never sends today
  add column if not exists skin_followup_mode text not null default 'off'
    check (skin_followup_mode in ('off','approval','automatic')),

  -- Clinic-level master pause. When true, ALL automations are held regardless of
  -- their individual mode. Individual settings are preserved (this is a pause,
  -- not a reset), so "resume" restores each automation's own mode.
  add column if not exists automations_paused boolean not null default false;

-- ROLLBACK (fully reversible; no data loss — these columns hold only preferences):
--   alter table public.settings
--     drop column if exists skin_followup_mode,
--     drop column if exists automations_paused;
