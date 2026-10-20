-- add_grow_register.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-20). Run by hand in the Supabase SQL editor, AFTER add_grow_payments.sql,
-- add_grow_onboarding.sql and add_grow_cashier.sql. The header is not proof of anything: check with the verify queries below.
--
-- WHAT. Grow's lead registration (GetLink, lib/grow/registration.ts) ends with a webhook that carries the new business's
-- user_id AND its api_key. user_id goes to grow_accounts as before. The api_key is a secret, so it gets its own server-only
-- table, encrypted (AES-256-GCM with TOKEN_ENCRYPTION_KEY, lib/facebook/encryption.ts), instead of a column on grow_accounts:
-- grow_accounts is readable by the business's own session (add_grow_payments.sql grants SELECT to authenticated with an
-- own-row policy), and a new column there would be readable too.
--
-- Nothing else from the webhook is stored here. bank_account is never stored anywhere.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: an approved registration still stores her user_id and switches clearing on;
-- the api_key is simply not kept (the webhook logs "grow_account_secrets missing", without the key).

begin;

create table if not exists public.grow_account_secrets (
  tenant_id          uuid primary key references public.tenants(id) on delete cascade,
  api_key_encrypted  text not null check (api_key_encrypted ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$'),
  source             text not null default 'registration' check (source in ('registration')),
  updated_at         timestamptz not null default now()
);

alter table public.grow_account_secrets enable row level security;

revoke all on public.grow_account_secrets from public;
revoke all on public.grow_account_secrets from anon, authenticated;
grant select, insert, update on public.grow_account_secrets to service_role;

commit;

-- ── verify ────────────────────────────────────────────────────────────────
--   select relrowsecurity from pg_class where oid = 'public.grow_account_secrets'::regclass;                -- true
--   select count(*) from pg_policies where tablename = 'grow_account_secrets';                              -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'grow_account_secrets' and grantee in ('anon', 'authenticated');                    -- no rows
