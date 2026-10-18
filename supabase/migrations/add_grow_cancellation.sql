-- add_grow_cancellation.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically). Run it AFTER add_grow_payments.sql,
-- add_grow_signup_requests.sql and add_grow_trial_gate.sql. Safe to run more than once. Nothing is dropped or deleted.
--
-- WHY: cancellation fees and deposits on top of the Grow card payments (docs/GROW_SETUP.md). Each cosmetician sets a policy; the client agrees to it
-- when booking; a late cancel or a no-show becomes a fee the cosmetician confirms with one tap; a deposit is deducted at the cashier, kept, or
-- returned. Card numbers are never stored: only Grow's token references.
--
-- WHAT:
--   1. grow_payments       + kind ('charge' | 'deposit' | 'fee'), refund_ref, refunded_at; status may now be 'refunded'.
--   2. grow_cancel_policies one row per business: the policy as JSON (mode, window, fees, deposit, text).
--   3. appointment_policy_consents what the client agreed to, frozen per appointment: the policy text, mode, amounts and when.
--   4. grow_card_tokens    the saved-card token reference from Grow. token_ref is NOT granted to the browser.
--   5. cancellation_fee_items the pending / charged / waived / retained / refunded items behind the one-tap question.
--   6. client_credits      credit from a deposit kept after a timely cancel, or left over after a visit.
-- Every table: a business may SELECT its own rows; every write goes through the server with the service role (the public booking page has no
-- login). Then the trial gate's write block is applied to the new tables, the same restrictive policies as the other Grow tables.

-- 1 ─────────────────────────────────────────────────────────────────────────
alter table public.grow_payments add column if not exists kind text not null default 'charge';
alter table public.grow_payments add column if not exists refund_ref text;
alter table public.grow_payments add column if not exists refunded_at timestamptz;

do $$
begin
  if to_regclass('public.grow_payments') is not null then
    alter table public.grow_payments drop constraint if exists grow_payments_kind_check;
    alter table public.grow_payments add constraint grow_payments_kind_check check (kind in ('charge', 'deposit', 'fee'));
    alter table public.grow_payments drop constraint if exists grow_payments_status_check;
    alter table public.grow_payments add constraint grow_payments_status_check check (status in ('created', 'paid', 'failed', 'cancelled', 'refunded'));
  end if;
end $$;

create index if not exists grow_payments_appointment_kind_idx on public.grow_payments (tenant_id, appointment_id, kind);
grant select (kind, refunded_at) on public.grow_payments to authenticated;

-- Per-service deposit: in deposit mode only the services marked here ask the client for a deposit when booking on the public page; any other service books
-- as before. Default off. (get_public_services returns the whole service row, so the public page sees the flag with no function change.)
alter table public.service_prices add column if not exists requires_deposit boolean not null default false;

-- 2 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.grow_cancel_policies (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  policy     jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.appointment_policy_consents (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants(id) on delete cascade,
  appointment_id             text not null,
  client_id                  text,
  client_name                text,
  mode                       text not null check (mode in ('saved_card', 'deposit')),
  consented_at               timestamptz not null default now(),
  token_id                   uuid,
  status                     text not null default 'awaiting_card' check (status in ('awaiting_card', 'card_saved', 'awaiting_deposit', 'deposit_paid', 'step_failed', 'hold_expired')),
  hold_expires_at            timestamptz,
  snapshot                   jsonb not null,
  deposit_applied_receipt_id text,
  created_at                 timestamptz not null default now(),
  unique (tenant_id, appointment_id)
);

-- Deposit holds: a deposit-mode booking is held as pending for 30 minutes (hold_expires_at); unpaid by then it is released and the slot frees up.
-- Re-runnable on a database that already has the table from an earlier run of this file.
alter table public.appointment_policy_consents add column if not exists hold_expires_at timestamptz;
alter table public.appointment_policy_consents drop constraint if exists appointment_policy_consents_status_check;
alter table public.appointment_policy_consents add constraint appointment_policy_consents_status_check
  check (status in ('awaiting_card', 'card_saved', 'awaiting_deposit', 'deposit_paid', 'step_failed', 'hold_expired'));
create index if not exists appointment_policy_consents_hold_idx on public.appointment_policy_consents (status, hold_expires_at) where status = 'awaiting_deposit';

-- 4 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.grow_card_tokens (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  client_id      text,
  appointment_id text not null,
  token_ref      text not null,
  card_last4     text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_brand     text,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);
create index if not exists grow_card_tokens_appt_idx on public.grow_card_tokens (tenant_id, appointment_id);

-- 5 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.cancellation_fee_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appointment_id  text not null,
  client_id       text,
  client_name     text,
  service         text,
  kind            text not null check (kind in ('late_cancel', 'no_show', 'deposit_return')),
  amount          numeric(10,2) not null check (amount > 0),
  status          text not null default 'pending' check (status in ('pending', 'charging', 'charged', 'waived', 'retained', 'refunded', 'credited', 'refund_failed', 'voided')),
  grow_payment_id text,
  receipt_id      text,
  error           text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  unique (appointment_id, kind)
);
create index if not exists cancellation_fee_items_tenant_status_idx on public.cancellation_fee_items (tenant_id, status, created_at desc);

-- 6 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.client_credits (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       text not null,
  amount          numeric(10,2) not null check (amount > 0),
  source          text not null,
  appointment_id  text,
  used_at         timestamptz,
  used_receipt_id text,
  created_at      timestamptz not null default now()
);
create index if not exists client_credits_client_idx on public.client_credits (tenant_id, client_id, used_at);

-- row level security: reads of her own rows only; no browser writes; the token reference is never granted ─────────
do $$
declare
  t text;
begin
  foreach t in array array['grow_cancel_policies', 'appointment_policy_consents', 'grow_card_tokens', 'cancellation_fee_items', 'client_credits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    if t <> 'grow_card_tokens' then
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;
grant select (id, tenant_id, client_id, appointment_id, card_last4, card_brand, created_at, revoked_at) on public.grow_card_tokens to authenticated;

-- trial gate: the same restrictive write block as the other Grow tables (public.is_tenant_active()), skipped with a notice if a table is missing ──
do $$
declare
  t text;
begin
  foreach t in array array['grow_cancel_policies', 'appointment_policy_consents', 'grow_card_tokens', 'cancellation_fee_items', 'client_credits'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_active())', t || '_require_active_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active())', t || '_require_active_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_active())', t || '_require_active_delete', t);
    raise notice 'gated %', t;
  end loop;
end $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the five tables exist with row level security on:
--      select relname, relrowsecurity from pg_class where relname in ('grow_cancel_policies', 'appointment_policy_consents', 'grow_card_tokens', 'cancellation_fee_items', 'client_credits');
-- 2) the browser role cannot read the token reference and cannot write:
--      select has_column_privilege('authenticated', 'public.grow_card_tokens', 'token_ref', 'select');   -- false
--      select has_table_privilege('authenticated', 'public.cancellation_fee_items', 'insert');           -- false
-- 3) the trial gate covers them (15 rows):
--      select tablename, policyname from pg_policies where tablename in ('grow_cancel_policies', 'appointment_policy_consents', 'grow_card_tokens', 'cancellation_fee_items', 'client_credits') and policyname like '%_require_active_%';
