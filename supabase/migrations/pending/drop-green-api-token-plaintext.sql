-- STATUS: APPLIED - settings.green_api_token no longer exists.
-- The folder name is not a status. See README.md in this directory.

-- drop-green-api-token-plaintext.sql
--
-- STEP 5. THE LAST ONE, and the irreversible one. Run only after the backfill
-- has run AND verified, and after the deployed code has been confirmed to read
-- the encrypted column.
--
-- After this, the ciphertext is the only copy of every cosmetician's GreenAPI
-- token. That is the point of the exercise - but it means a lost
-- TOKEN_ENCRYPTION_KEY is a lost token for every tenant, and GreenAPI never
-- shows a token twice: recovery is re-generating it and re-pairing her phone.
--
-- NEVER run this in the same transaction, or the same sitting, as the backfill.
-- These are separate files precisely so a half-finished backfill cannot take
-- the source data with it.

-- Refuse if any row still holds a plaintext token with no encrypted
-- counterpart. Without this, the drop would silently delete a credential the
-- backfill missed - the exact failure the staged ordering exists to prevent.
do $$
declare
  unmigrated integer;
begin
  select count(*) into unmigrated
    from public.settings
   where coalesce(btrim(green_api_token), '') <> ''
     and coalesce(btrim(green_api_token_encrypted), '') = '';

  if unmigrated > 0 then
    raise exception
      'REFUSING: % settings row(s) still hold a plaintext token with no encrypted counterpart. Run scripts/backfill-green-api-token.mjs first.', unmigrated;
  end if;
end $$;

alter table public.settings
  drop column if exists green_api_token;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) Only the encrypted column remains. EXPECT exactly one row.
--        select column_name from information_schema.columns
--         where table_schema = 'public' and table_name = 'settings'
--           and column_name like 'green_api_token%';
--
--   b) Every previously-connected tenant still has credentials. Compare with
--      the number recorded before the backfill.
--        select count(*) as tenants_with_encrypted_token
--          from public.settings
--         where coalesce(btrim(green_api_token_encrypted), '') <> '';
--
--   c) BEHAVIOURAL, and the only one that really matters: send one WhatsApp
--      from the app for a connected tenant and confirm it arrives. The column
--      being present proves storage. Only a send proves the decrypt path.
