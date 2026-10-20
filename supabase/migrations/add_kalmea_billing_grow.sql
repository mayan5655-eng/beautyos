-- add_kalmea_billing_grow.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Run it AFTER add_kalmea_billing.sql. Safe to run more than once.
-- The code works before it runs: no identifier is stored (charges still go through the same one-success-per-month rule) and the consent
-- tick is still required, just not stored.
--
-- WHAT (Kalmea's own subscription on Kalmea's own Grow account, lib/billing/growBilling.ts):
--   1. billing_payments.unique_identifier  Grow's transactionUniqueIdentifier for each subscription charge. Drawn on the server and SAVED
--      here BEFORE Grow is called, never reused, unique across every row (the same rules as the client token ledger, add_grow_tokens.sql).
--   2. billing_payments.status may also be 'pending' (saved, Grow not answered yet) and 'unknown' (Grow's answer never settled: it is looked
--      up by its identifier before any new charge of that month, so a lost reply can never become a second charge).
--   3. billing_card_consents  the exact words she agreed to (with her price), the version and the time, when she saved a card.
--      She can read her own rows; only the server writes. Like the other billing tables it is deliberately NOT in the trial gate:
--      a blocked business must still be able to add a card and pay (docs/BILLING_SETUP.md).

alter table public.billing_payments add column if not exists unique_identifier bigint;

do $$
begin
  alter table public.billing_payments drop constraint if exists billing_payments_status_check;
  alter table public.billing_payments add constraint billing_payments_status_check check (status in ('succeeded', 'failed', 'pending', 'unknown'));
  alter table public.billing_payments drop constraint if exists billing_payments_unique_identifier_range;
  alter table public.billing_payments add constraint billing_payments_unique_identifier_range
    check (unique_identifier is null or (unique_identifier >= 100000000 and unique_identifier < 4294967295));
end $$;

create unique index if not exists billing_payments_unique_identifier_key
  on public.billing_payments (unique_identifier) where unique_identifier is not null;

create index if not exists billing_payments_open_idx
  on public.billing_payments (subscription_id, period_start) where status in ('pending', 'unknown');

create table if not exists public.billing_card_consents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  user_id         uuid,
  consent_text    text not null,
  consent_version text not null,
  price           numeric(10,2),
  accepted_at     timestamptz not null default now()
);
create index if not exists billing_card_consents_tenant_idx on public.billing_card_consents (tenant_id, accepted_at desc);

alter table public.billing_card_consents enable row level security;
drop policy if exists billing_card_consents_select_own on public.billing_card_consents;
create policy billing_card_consents_select_own on public.billing_card_consents
  for select to authenticated using (tenant_id = public.get_user_tenant_id());
revoke all on public.billing_card_consents from anon, authenticated;
grant select on public.billing_card_consents to authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1. the new column, its range check and its unique index:
--   select column_name, data_type from information_schema.columns where table_name = 'billing_payments' and column_name = 'unique_identifier';
--   select indexname from pg_indexes where tablename = 'billing_payments' and indexname in ('billing_payments_unique_identifier_key', 'billing_payments_open_idx');
-- 2. the statuses (expect the four in the check):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'billing_payments_status_check';
-- 3. consents: RLS on, browser roles may only read (expect rowsecurity = true and one SELECT grant for authenticated):
--   select tablename, rowsecurity from pg_tables where tablename = 'billing_card_consents';
--   select grantee, privilege_type from information_schema.role_table_grants where table_name = 'billing_card_consents' and grantee in ('anon', 'authenticated');
