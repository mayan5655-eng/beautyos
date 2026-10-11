-- add_grow_payments.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: card payments through Grow (Meshulam). Each cosmetician clears to HER OWN Grow account (money never
-- passes through Kalmea); Grow issues the legal receipt; Kalmea keeps the record so a payment, its receipt and
-- the revenue reports are all visible in one place.
--
-- WHAT:
--   1. public.grow_accounts  - one row per business: her Grow userId and whether she switched Grow on.
--                              Not a secret (it identifies the merchant; the platform apiKey is what authorises
--                              a call, and that lives in Vercel env, never here).
--   2. public.grow_payments  - one row per charge she starts from the cashier: the amount, the Grow process and
--                              transaction ids, the paid/failed status, the link to Grow's legal document, and the
--                              Kalmea receipt it produced.
--                              notify_token is the random secret in the callback URL Grow posts to: the browser
--                              can never read it (the column is not granted), only the server.
-- Both tables: members of the business may SELECT their own rows (without notify_token); every write goes
-- through the server with the service role.
--
-- Safe to run more than once.

create table if not exists public.grow_accounts (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  user_id      text not null check (user_id ~ '^[A-Za-z0-9_-]{4,64}$'),
  enabled      boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.grow_payments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  status         text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  amount         numeric(12,2) not null check (amount > 0),
  currency       text not null default 'ILS',
  description    text,
  client_id      text,
  client_name    text,
  appointment_id text,
  payer_phone    text,
  process_id     text,
  transaction_id text,
  asmachta       text,
  invoice_url    text,
  receipt_id     text,
  error          text,
  notify_token   text not null unique,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists grow_payments_tenant_created_idx on public.grow_payments (tenant_id, created_at desc);

alter table public.grow_accounts enable row level security;
alter table public.grow_payments enable row level security;

drop policy if exists grow_accounts_select_own on public.grow_accounts;
create policy grow_accounts_select_own on public.grow_accounts
  for select to authenticated using (tenant_id = public.get_user_tenant_id());

drop policy if exists grow_payments_select_own on public.grow_payments;
create policy grow_payments_select_own on public.grow_payments
  for select to authenticated using (tenant_id = public.get_user_tenant_id());

-- Reads only, and not the callback secret.
revoke all on public.grow_accounts from anon, authenticated;
revoke all on public.grow_payments from anon, authenticated;
grant select on public.grow_accounts to authenticated;
grant select (id, tenant_id, status, amount, currency, description, client_id, client_name, appointment_id,
              payer_phone, process_id, transaction_id, asmachta, invoice_url, receipt_id, error,
              paid_at, created_at, updated_at)
  on public.grow_payments to authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) both tables exist and are empty:
--      select (select count(*) from public.grow_accounts) a, (select count(*) from public.grow_payments) p;
-- 2) the browser role can read payments but not the callback secret:
--      select has_column_privilege('authenticated', 'public.grow_payments', 'notify_token', 'select');  -- false
--      select has_table_privilege('authenticated', 'public.grow_payments', 'insert');                   -- false
-- 3) in the app: Settings > Connections shows the Grow card ("not connected yet" until the platform keys exist).
