-- add_billing_addons.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: paid add-on packs (lib/pricing.ts ADDON_PACKS): she buys "+10 רילסים" for this month, charged once to the card she saved for
-- her Kalmea subscription. The charge is a billing_payments row of kind 'addon'; the units it bought are a billing_addons row, which the
-- AI quota reads (lib/addonQuota.ts) and enforces on the server.
--
-- SAFE: adds one value to a CHECK, one table, one index, RLS read-only for her own rows. No data is changed. Safe to run twice.
-- The app degrades honestly before this runs: no purchases are possible, and the quota counts zero packs.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'billing_payments_kind_check') then
    alter table public.billing_payments drop constraint billing_payments_kind_check;
  end if;
  alter table public.billing_payments add constraint billing_payments_kind_check check (kind in ('subscription', 'manual', 'addon'));
end $$;

create table if not exists public.billing_addons (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  pack        text not null check (pack in ('posts', 'reels', 'advisor', 'skinscan')),
  units       integer not null check (units > 0),
  usd_allowance numeric(10,2) not null default 0 check (usd_allowance >= 0),
  price       numeric(10,2) not null check (price > 0),
  -- The first day of the Israel calendar month the pack is for (it does not roll over).
  period_month date not null,
  payment_id  uuid references public.billing_payments(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists billing_addons_tenant_month on public.billing_addons (tenant_id, period_month);
-- One pack row per payment: a retried callback can never credit twice.
create unique index if not exists billing_addons_one_per_payment on public.billing_addons (payment_id) where payment_id is not null;

alter table public.billing_addons enable row level security;
drop policy if exists billing_addons_read_own on public.billing_addons;
create policy billing_addons_read_own on public.billing_addons for select to authenticated
  using (tenant_id = public.get_user_tenant_id());
-- No insert/update/delete policy: only the service role writes (app/api/billing/addon).

-- ── VERIFY ─────────────────────────────────────────────────────────────────
--   select pg_get_constraintdef(oid) like '%addon%' from pg_constraint where conname = 'billing_payments_kind_check';  -- true
--   select count(*) from public.billing_addons;  -- 0
