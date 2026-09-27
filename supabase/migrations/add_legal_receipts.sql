-- add_legal_receipts.sql
--
-- Legal receipts through a REGISTERED provider (Morning first), optional per clinic.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run by hand in the Supabase SQL Editor. Safe to run more than once.
-- Until it runs, the till behaves exactly as before and the Settings screen says
-- the migration is missing; nothing breaks.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- We do NOT issue tax documents ourselves: that needs a product registered with the
-- Tax Authority. A document is created by Morning inside the cosmetician's OWN
-- account (her business number, her numbering). Our receipts table is a record of
-- PAYMENTS; these columns say whether a provider document exists for one, and which.
--
-- ── receipts: the document that belongs to a payment ────────────────────────
--   legal_status     none | pending | issued | failed | unknown
--                    failed  = the provider said no (nothing was created): may retry
--                    unknown = no trustworthy answer (timeout, 5xx): the document MAY
--                              exist, so nothing retries by itself
--   legal_doc_*      what the provider returned: id, number, type key, link
--   legal_attempts   how many tries (the daily job stops after 5)
-- ── receipt_voids: the credit document that a void needs ────────────────────
--   credit_status    none | pending_request | pending | issued | failed | unknown
--                    A void of a payment that HAS a legal document is only complete when
--                    the credit document (מסמך זיכוי) exists; until then the payment
--                    still counts in her totals, because legally it still stands.
--
-- ── legal_receipt_accounts: her connection ──────────────────────────────────
-- One row per clinic. The API key id and secret are stored ENCRYPTED (AES-256-GCM,
-- TOKEN_ENCRYPTION_KEY, same as the other stored tokens). RLS is on and there are NO
-- policies and no grants for anon or authenticated: only the server (service role)
-- can read it, so the browser can never fetch the secret.

alter table public.receipts
  add column if not exists legal_status       text not null default 'none',
  add column if not exists legal_provider     text,
  add column if not exists legal_doc_id       text,
  add column if not exists legal_doc_number   text,
  add column if not exists legal_doc_type     text,
  add column if not exists legal_doc_url      text,
  add column if not exists legal_issued_at    timestamptz,
  add column if not exists legal_error        text,
  add column if not exists legal_attempts     int  not null default 0,
  add column if not exists legal_attempted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receipts_legal_status_check') then
    alter table public.receipts
      add constraint receipts_legal_status_check
      check (legal_status in ('none', 'pending', 'issued', 'failed', 'unknown'));
  end if;
end $$;

create index if not exists receipts_legal_status_idx
  on public.receipts (legal_status) where legal_status <> 'none';

alter table public.receipt_voids
  add column if not exists credit_status       text not null default 'none',
  add column if not exists credit_doc_id       text,
  add column if not exists credit_doc_number   text,
  add column if not exists credit_doc_url      text,
  add column if not exists credit_issued_at    timestamptz,
  add column if not exists credit_error        text,
  add column if not exists credit_attempts     int  not null default 0,
  add column if not exists credit_attempted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receipt_voids_credit_status_check') then
    alter table public.receipt_voids
      add constraint receipt_voids_credit_status_check
      check (credit_status in ('none', 'pending_request', 'pending', 'issued', 'failed', 'unknown'));
  end if;
end $$;

create table if not exists public.legal_receipt_accounts (
  tenant_id             uuid primary key,
  provider              text not null check (provider in ('morning')),
  credentials_encrypted text not null,
  environment           text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  business_name         text,
  needs_reconnect       boolean not null default false,
  last_error            text,
  last_verified_at      timestamptz,
  connected_at          timestamptz not null default now()
);

alter table public.legal_receipt_accounts enable row level security;
revoke all on public.legal_receipt_accounts from anon, authenticated, public;

-- ── Grants on the new columns ───────────────────────────────────────────────
-- The browser INSERTs a void with credit_status = 'pending_request' when the payment
-- has a legal document (so the request is recorded even if the network drops); it
-- never writes the other credit_* or legal_* columns - the server does, on the
-- service role. If receipt_voids has column-level insert grants in your project, add
-- credit_status to them; a table-level grant needs nothing.
-- (Check: select grantee, privilege_type, column_name from information_schema.column_privileges
--   where table_name = 'receipt_voids' and grantee = 'authenticated';)

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_name = 'receipts' and column_name like 'legal\_%' order by 1;   -- 10 rows
--   select column_name from information_schema.columns
--    where table_name = 'receipt_voids' and column_name like 'credit\_%' order by 1;   -- 8 rows
--   select relrowsecurity from pg_class where relname = 'legal_receipt_accounts';  -- true
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'legal_receipt_accounts' and grantee in ('anon','authenticated');  -- no rows
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop table if exists public.legal_receipt_accounts;
--   alter table public.receipts drop column if exists legal_status, drop column if exists legal_provider,
--     drop column if exists legal_doc_id, drop column if exists legal_doc_number, drop column if exists legal_doc_type,
--     drop column if exists legal_doc_url, drop column if exists legal_issued_at, drop column if exists legal_error,
--     drop column if exists legal_attempts, drop column if exists legal_attempted_at;
--   alter table public.receipt_voids drop column if exists credit_status, drop column if exists credit_doc_id,
--     drop column if exists credit_doc_number, drop column if exists credit_doc_url, drop column if exists credit_issued_at,
--     drop column if exists credit_error, drop column if exists credit_attempts, drop column if exists credit_attempted_at;
