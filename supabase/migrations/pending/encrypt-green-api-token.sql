-- STATUS: APPLIED.
-- The folder name is not a status. See README.md in this directory.

-- encrypt-green-api-token.sql
--
-- STEP 1. Adds the encrypted column. Changes nothing else.
--
-- ORDER, and it is strict:
--   1. THIS FILE                              add the column
--   2. deploy the code                        writes encrypted, reads EITHER
--   3. scripts/backfill-green-api-token.mjs   encrypt existing rows
--   4. verify                                 that script's --verify mode
--   5. drop-green-api-token-plaintext.sql     remove the old column
--
-- Steps 3 and 5 are NEVER the same transaction and should not even be the same
-- sitting. A backfill that half-succeeds and then drops the source column has
-- destroyed the only copy of a credential that cannot be recovered: GreenAPI
-- does not show a token twice.
--
-- ── Why only the token ─────────────────────────────────────────────────────
-- green_api_instance stays PLAINTEXT on purpose. app/api/whatsapp-webhook
-- resolves the tenant with
--
--     .eq("green_api_instance", String(idInstance))
--
-- and AES-256-GCM uses a random IV, so the same plaintext encrypts to
-- different ciphertext every time and that equality can never match.
-- Encrypting it would silently stop every inbound WhatsApp message. It is also
-- not a secret: an idInstance is an account number, and GreenAPI needs the
-- TOKEN to authenticate.
--
-- green_api_url is a hostname. Nothing to protect.
--
-- ── Format ─────────────────────────────────────────────────────────────────
-- Written by lib/facebook/encryption.ts (AES-256-GCM), the same helper that
-- already protects Facebook page tokens, in the format
--
--     iv:authTag:ciphertext        (all hex)
--
-- Postgres can neither produce nor read this: the key lives only in
-- TOKEN_ENCRYPTION_KEY in the app environment. That is why the backfill is a
-- Node script rather than SQL.
--
-- Safe to run more than once. Additive: no existing value is read or changed.

alter table public.settings
  add column if not exists green_api_token_encrypted text;

comment on column public.settings.green_api_token_encrypted is
  'GreenAPI apiTokenInstance, AES-256-GCM, format iv:authTag:ciphertext (hex). Written only by the server (app/api/settings/whatsapp). Never returned to the browser. Decrypted at point of use in lib/whatsapp.js.';

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The column exists and is nullable. EXPECT one row, is_nullable = YES.
--        select column_name, data_type, is_nullable
--          from information_schema.columns
--         where table_schema = 'public' and table_name = 'settings'
--           and column_name = 'green_api_token_encrypted';
--
--   b) NOTHING ELSE WAS TOUCHED. Run before and after; the numbers must match.
--        select count(*) as settings_rows,
--               count(green_api_instance) as with_instance,
--               count(nullif(btrim(green_api_token), '')) as with_plaintext_token
--          from public.settings;
--
--   c) The new column is empty until the backfill runs. EXPECT 0.
--        select count(nullif(btrim(green_api_token_encrypted), '')) as must_be_zero
--          from public.settings;
--
--   d) settings must still be closed to anon and authenticated after
--      revoke-anon-grants.sql. A new column inherits the table's privileges,
--      so this should be unchanged - worth confirming rather than assuming.
--      EXPECT zero rows.
--        select grantee, privilege_type
--          from information_schema.role_table_grants
--         where table_schema = 'public' and table_name = 'settings'
--           and grantee in ('anon', 'authenticated');
