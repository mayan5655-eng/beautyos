-- move_evening_summary_2026-11-05.sql
--
-- Moves the "סיכום ערב" switch from settings.branding.evening_summary (the PUBLIC bag) to
-- settings.automations.evening_summary, for every tenant at once.
--
-- ── STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor. ──
-- OPTIONAL. The code does not depend on it: it reads automations first and the old branding key as a fallback, writes
-- only automations, removes the old key on her next Settings save, and strips it from every public read
-- (lib/eveningSummarySetting.ts). This file only cleans the public bag now instead of on each tenant's next save, so
-- the get_public_branding / get_public_page RPCs stop returning the key immediately.
-- Safe to run more than once. Touches only rows that still have the old key.
--
-- An explicit value already in automations always wins (she set it after this change); the old one is only copied
-- when automations has none.

update public.settings
   set automations = coalesce(automations, '{}'::jsonb)
                     || jsonb_build_object('evening_summary', (branding->>'evening_summary') = 'true')
 where branding ? 'evening_summary'
   and jsonb_typeof(branding) = 'object'
   and (automations is null or (jsonb_typeof(automations) = 'object' and not (automations ? 'evening_summary')));

-- Only rows whose value now sits in automations lose the old key, so nothing is ever dropped without being carried.
update public.settings
   set branding = branding - 'evening_summary'
 where jsonb_typeof(branding) = 'object'
   and branding ? 'evening_summary'
   and jsonb_typeof(automations) = 'object'
   and automations ? 'evening_summary';

-- ── Verify (run after) ─────────────────────────────────────────────────────
-- 1. No public bag still carries it:
--      select count(*) from public.settings where branding ? 'evening_summary';
--    expect 0.
-- 2. Who has it on now (same number as had branding.evening_summary = true before, plus anyone who set it since):
--      select count(*) from public.settings where (automations->>'evening_summary') = 'true';
