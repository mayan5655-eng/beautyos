-- add_kalmea_billing.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically). Safe to run more than once.
--
-- WHY: Kalmea's OWN subscription billing (a cosmetician paying Kalmea each month). It builds on the existing trial and gate
-- (tenants.plan_status: trial / active / expired / paused, trial-state.sql); it replaces nothing.
--
-- WHAT:
--   1. public.billing_subscriptions  one row per business: the price (set per business: 349 launch or 499 regular), the status, when the next
--                                    charge is due, the provider's TOKEN REFERENCE for her saved card, and the failed-attempt counters.
--                                    No card number is ever stored: only a token reference from the provider, plus the last four digits
--                                    and brand it reports (display only).
--   2. public.billing_payments       the history: one row per charge attempt or manual payment, with the provider ids and the invoice
--                                    number and link. A partial unique index allows ONE successful subscription payment per billing period,
--                                    so the same month can never be charged twice.
-- Both tables: a business may SELECT its own rows (the token reference is not granted to the browser). Every write goes through the server
-- with the service role.
--
-- DELIBERATELY NOT IN THE TRIAL GATE. These tables must never get the "_require_active_*" restrictive policies from trial-gate-policies.sql:
-- a blocked business has to reach billing to pay and unblock herself. There is no browser write access to them at all, so nothing needs gating.

create table if not exists public.billing_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references public.tenants(id) on delete cascade,
  price           numeric(10,2) not null check (price > 0),
  currency        text not null default 'ILS',
  status          text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  next_charge_at  timestamptz,
  token_ref       text,
  card_last4      text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_brand      text,
  failed_attempts integer not null default 0,
  past_due_since  timestamptz,
  last_attempt_at timestamptz,
  canceled_at     timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists billing_subscriptions_due_idx on public.billing_subscriptions (status, next_charge_at);

create table if not exists public.billing_payments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  subscription_id     uuid references public.billing_subscriptions(id) on delete set null,
  kind                text not null default 'subscription' check (kind in ('subscription', 'manual')),
  status              text not null check (status in ('succeeded', 'failed')),
  amount              numeric(10,2) not null check (amount > 0),
  currency            text not null default 'ILS',
  period_start        date,
  period_end          date,
  attempt             integer not null default 1,
  provider            text not null default 'card',
  provider_payment_id text,
  error               text,
  invoice_status      text not null default 'none' check (invoice_status in ('issued', 'pending', 'failed', 'none')),
  invoice_number      text,
  invoice_url         text,
  note                text,
  created_at          timestamptz not null default now()
);

create index if not exists billing_payments_tenant_created_idx on public.billing_payments (tenant_id, created_at desc);
create unique index if not exists billing_payments_one_success_per_period
  on public.billing_payments (subscription_id, period_start)
  where status = 'succeeded' and kind = 'subscription';

alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own on public.billing_subscriptions
  for select to authenticated using (tenant_id = public.get_user_tenant_id());

drop policy if exists billing_payments_select_own on public.billing_payments;
create policy billing_payments_select_own on public.billing_payments
  for select to authenticated using (tenant_id = public.get_user_tenant_id());

-- Reads only, and never the token reference.
revoke all on public.billing_subscriptions from anon, authenticated;
revoke all on public.billing_payments from anon, authenticated;
grant select (id, tenant_id, price, currency, status, next_charge_at, card_last4, card_brand, failed_attempts, past_due_since,
              last_attempt_at, canceled_at, ends_at, created_at, updated_at)
  on public.billing_subscriptions to authenticated;
grant select on public.billing_payments to authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) both tables exist, empty, with row level security on:
--      select relname, relrowsecurity from pg_class where relname in ('billing_subscriptions', 'billing_payments');
-- 2) the browser role reads payments but not the token reference, and cannot write:
--      select has_column_privilege('authenticated', 'public.billing_subscriptions', 'token_ref', 'select');   -- false
--      select has_table_privilege('authenticated', 'public.billing_payments', 'insert');                      -- false
-- 3) NOT gated (expect zero rows):
--      select tablename, policyname from pg_policies where tablename in ('billing_subscriptions', 'billing_payments') and policyname like '%_require_active_%';
