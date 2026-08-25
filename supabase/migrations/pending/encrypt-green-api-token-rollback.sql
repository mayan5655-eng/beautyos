-- encrypt-green-api-token-rollback.sql
--
-- Undoes encrypt-green-api-token.sql by removing the encrypted column.
--
-- ── READ THIS BEFORE RUNNING ───────────────────────────────────────────────
-- LOSSLESS ONLY WHILE public.settings.green_api_token STILL EXISTS.
--
-- Before drop-green-api-token-plaintext.sql has run, the plaintext is still
-- there and this merely discards a second copy. Safe.
--
-- AFTER that drop, the encrypted column is the ONLY copy, and this file would
-- destroy it. There is no decrypt-back path in SQL: the key lives in
-- TOKEN_ENCRYPTION_KEY, in the app environment, and Postgres cannot reach it.
-- Recovery would mean every cosmetician generating a NEW GreenAPI token and
-- re-pairing her phone, because GreenAPI does not show an existing one twice.
--
-- To go back after the plaintext is gone, do NOT run this. Run
--     node scripts/backfill-green-api-token.mjs --decrypt-back
-- first, which restores the plaintext column from the ciphertext using the app
-- key, and only then run this file.
--
-- The guard below enforces that rather than trusting it to be remembered.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'settings'
       and column_name = 'green_api_token'
  ) then
    raise exception
      'REFUSING: public.settings.green_api_token no longer exists, so green_api_token_encrypted is the ONLY copy of every tenant token. Run the backfill with --decrypt-back before rolling back.';
  end if;
end $$;

alter table public.settings
  drop column if exists green_api_token_encrypted;

-- ── Verify ─────────────────────────────────────────────────────────────────
--   The encrypted column is gone and the plaintext one survives.
--   EXPECT exactly one row: green_api_token.
--     select column_name from information_schema.columns
--      where table_schema = 'public' and table_name = 'settings'
--        and column_name like 'green_api_token%';
