-- anon-revoke.sql
-- FINAL security step: stop anonymous clients from reading the whole settings
-- row (which today still exposes green_api_token etc. via a direct anon API
-- call). Run these TWO statements IN ORDER, top to bottom, in the PRODUCTION
-- Supabase SQL editor.
--
-- Safe because:
--   • 3a is created FIRST, so authenticated clinic users never lose read access
--     to their own settings row — the dashboard keeps working. The `public`
--     role covers everyone (anon + authenticated), so dropping public_read_settings
--     without 3a would also block logged-in clinics; 3a prevents that.
--   • The public customer pages (/book, /skin-scan, /[slug]) do NOT read the
--     settings table directly anymore — they call the get_public_branding RPC,
--     which is SECURITY DEFINER and runs with the function owner's rights, so it
--     is unaffected by this policy change and keeps returning the safe fields.
--   • service_prices and appointments are SEPARATE tables with their own
--     policies — untouched here, so public booking availability still loads.
--   • Server API routes use the service-role key, which bypasses RLS entirely —
--     also unaffected.

-- 3a. SAFETY FIRST: authenticated clinic users keep reading THEIR OWN settings
--     row (tenant-scoped). Idempotent: drop-if-exists then create.
drop policy if exists settings_auth_tenant_read on public.settings;
create policy settings_auth_tenant_read
  on public.settings
  for select
  to authenticated
  using (tenant_id = get_user_tenant_id());

-- 3b. CLOSE THE LEAK: remove the anonymous "read the whole row" policy.
drop policy if exists public_read_settings on public.settings;

-- ---------------------------------------------------------------------------
-- Post-run verification (do these after running the two statements above):
--   1) Dashboard: log in as a clinic — settings still load and save.
--   2) Public: open production /book?t=<tenant> and /skin-scan?t=<tenant> in an
--      incognito window — branding still renders (served by the RPC).
--   3) Leak closed: with the ANON key only, `select * from settings` returns
--      ZERO rows, and the Network response on /book shows NO green_api_token.
