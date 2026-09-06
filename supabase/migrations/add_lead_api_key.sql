-- add_lead_api_key.sql
-- Per-tenant API key (SHA-256 hash only; plaintext shown once at generation)
-- for the external lead-intake endpoint (/api/leads/intake). Lives on
-- settings, which is deliberately outside the trial gate - no gate change
-- needed - and follows the same secret discipline as
-- green_api_token_encrypted: written server-side only, never returned to the
-- browser.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run `npm run migrations:status` to verify; where this header and the script
-- disagree, the script is right.
--
-- Safe to run more than once.

alter table public.settings
  add column if not exists lead_api_key_hash text;

-- The intake route resolves tenant BY key hash - this is its lookup path.
create index if not exists settings_lead_api_key_hash_idx
  on public.settings (lead_api_key_hash)
  where lead_api_key_hash is not null;
