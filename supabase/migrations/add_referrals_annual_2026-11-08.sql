-- add_referrals_annual_2026-11-08.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically). Safe to run more than once.
-- Run it AFTER add_kalmea_billing.sql, add_kalmea_billing_grow.sql and add_billing_addons.sql.
--
-- WHY: two growth features for Kalmea's OWN subscription, both behind flags that are OFF by default:
--   "חברה מביאה חברה" (NEXT_PUBLIC_REFERRALS=1, lib/referral.ts) and the annual plan (NEXT_PUBLIC_ANNUAL_PLAN=1, lib/pricing.ts).
-- The app works the same before and after this runs while the flags are off. With a flag on before this runs, the referral card
-- and the annual choice say the feature is not ready yet; billing is unchanged.
--
-- WHAT:
--   1. billing_subscriptions.billing_period ('monthly' default | 'annual') and pending_period (a switch she asked for, applied by the
--      daily run at her next renewal). billing_payments.period_months (1 default, 12 on a yearly charge). No existing row changes
--      meaning: every row is monthly. One success per period stays the existing unique index billing_payments_one_success_per_period
--      (subscription_id, period_start): a yearly period has one start date, so it can succeed once.
--   2. referral_codes: one unguessable code per business (made by the server).
--   3. referrals: who brought whom. Written ONLY by the trigger below, when the new business's tenant row is inserted at signup, from
--      the code in her signup metadata (kl_ref). One row per new business (unique referred_tenant_id), never herself (check). The same
--      owner, the same email (ignoring +tags and Gmail dots) or the same verified mobile is stored as 'ineligible'.
--   4. referral_rewards: the free months. One per side per referral EVER (unique (referral_id, role)), and at most one month used per
--      subscription and period (partial unique index).
-- RLS: every new table has row level security on. A business may SELECT her own code and her own months; nobody but the service role
-- writes anything, and the browser cannot read referrals at all (it names the other business). Deliberately NOT in the trial gate:
-- there is no browser write to gate.
--
-- The trigger NEVER blocks a signup: any error inside it is caught and becomes a warning in the log, and the signup goes on.

-- 1. annual plan ------------------------------------------------------------------------------------------------------------
alter table public.billing_subscriptions add column if not exists billing_period text not null default 'monthly';
alter table public.billing_subscriptions add column if not exists pending_period text;
alter table public.billing_payments add column if not exists period_months smallint not null default 1;

do $$
begin
  alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_period_check;
  alter table public.billing_subscriptions add constraint billing_subscriptions_period_check
    check (billing_period in ('monthly', 'annual') and (pending_period is null or pending_period in ('monthly', 'annual')));
  alter table public.billing_payments drop constraint if exists billing_payments_period_months_check;
  alter table public.billing_payments add constraint billing_payments_period_months_check check (period_months in (1, 12));
end $$;

create index if not exists billing_payments_annual_idx
  on public.billing_payments (subscription_id, period_start, period_end)
  where status = 'succeeded' and kind = 'subscription' and period_months = 12;

-- She may read her own plan period (the token reference stays unreadable).
grant select (billing_period, pending_period) on public.billing_subscriptions to authenticated;

-- 2. referral codes ---------------------------------------------------------------------------------------------------------
create table if not exists public.referral_codes (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  code       text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  created_at timestamptz not null default now()
);

-- 3. referrals --------------------------------------------------------------------------------------------------------------
create table if not exists public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_tenant_id uuid not null references public.tenants(id) on delete cascade,
  referred_tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  code               text not null,
  status             text not null default 'joined' check (status in ('joined', 'ineligible', 'rewarded', 'voided')),
  ineligible_reason  text,
  rewarded_at        timestamptz,
  voided_at          timestamptz,
  void_reason        text,
  created_at         timestamptz not null default now(),
  constraint referrals_not_self check (referrer_tenant_id <> referred_tenant_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_tenant_id, created_at desc);

-- 4. referral rewards (free months) -----------------------------------------------------------------------------------------
create table if not exists public.referral_rewards (
  id                       uuid primary key default gen_random_uuid(),
  referral_id              uuid not null references public.referrals(id) on delete cascade,
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  role                     text not null check (role in ('referrer', 'referred')),
  months                   smallint not null default 1 check (months = 1),
  trigger_payment_id       uuid references public.billing_payments(id) on delete set null,
  available_at             timestamptz not null,
  consumed_at              timestamptz,
  consumed_subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  consumed_period_start    date,
  consumed_period_end      date,
  voided_at                timestamptz,
  void_reason              text,
  created_at               timestamptz not null default now(),
  constraint referral_rewards_one_per_side unique (referral_id, role),
  constraint referral_rewards_consumed_shape check (consumed_at is null or (consumed_subscription_id is not null and consumed_period_start is not null))
);
create unique index if not exists referral_rewards_one_per_period
  on public.referral_rewards (consumed_subscription_id, consumed_period_start) where consumed_at is not null;
create index if not exists referral_rewards_open_idx
  on public.referral_rewards (tenant_id, available_at) where consumed_at is null and voided_at is null;

-- RLS: read own, write only by the service role ------------------------------------------------------------------------------
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated using (tenant_id = public.get_user_tenant_id());
drop policy if exists referral_rewards_select_own on public.referral_rewards;
create policy referral_rewards_select_own on public.referral_rewards
  for select to authenticated using (tenant_id = public.get_user_tenant_id());

revoke all on public.referral_codes from anon, authenticated;
revoke all on public.referrals from anon, authenticated;
revoke all on public.referral_rewards from anon, authenticated;
grant select on public.referral_codes to authenticated;
grant select (id, tenant_id, role, months, available_at, consumed_at, consumed_period_start, consumed_period_end, voided_at, created_at)
  on public.referral_rewards to authenticated;

-- An email reduced to the person behind it: lower case, no +tag, and no dots for Gmail.
create or replace function public.referral_email_key(e text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when e is null or position('@' in e) = 0 then null
    when lower(split_part(e, '@', 2)) in ('gmail.com', 'googlemail.com')
      then replace(regexp_replace(lower(split_part(e, '@', 1)), '\+.*$', ''), '.', '') || '@gmail.com'
    else regexp_replace(lower(split_part(e, '@', 1)), '\+.*$', '') || '@' || lower(split_part(e, '@', 2))
  end;
$$;

-- 5. the signup attribution trigger -----------------------------------------------------------------------------------------
-- Runs once, AFTER INSERT on public.tenants (the signup trigger handle_new_user inserts her tenant in the same transaction as her
-- auth.users row, with owner_id = her user id). Reads the code she signed up with from her auth metadata at that moment. Nothing the
-- browser does later (editing her metadata) can add or change a referral: this never runs again for her tenant.
create or replace function public.tenants_attribute_referral()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code      text;
  v_new_email text;
  v_new_phone text;
  v_ref       uuid;
  v_ref_owner uuid;
  v_ref_email text;
  v_ref_phone text;
  v_reason    text;
begin
  begin
    if new.owner_id is null then
      return new;
    end if;
    select upper(btrim(u.raw_user_meta_data ->> 'kl_ref')), lower(u.email), u.raw_user_meta_data ->> 'phone_e164'
      into v_code, v_new_email, v_new_phone
      from auth.users u where u.id = new.owner_id;
    if v_code is null or v_code !~ '^[A-HJ-NP-Z2-9]{10}$' then
      return new;
    end if;
    select c.tenant_id, t.owner_id into v_ref, v_ref_owner
      from public.referral_codes c join public.tenants t on t.id = c.tenant_id
     where c.code = v_code;
    if v_ref is null or v_ref = new.id then
      return new;
    end if;
    select lower(u.email) into v_ref_email from auth.users u where u.id = v_ref_owner;
    select p.phone_e164 into v_ref_phone from public.owner_phones p where p.user_id = v_ref_owner or p.tenant_id = v_ref limit 1;

    if v_ref_owner is not distinct from new.owner_id then
      v_reason := 'same_owner';
    elsif public.referral_email_key(v_new_email) = public.referral_email_key(v_ref_email) then
      v_reason := 'same_email';
    elsif v_new_phone is not null and v_new_phone = v_ref_phone then
      v_reason := 'same_phone';
    end if;

    insert into public.referrals (referrer_tenant_id, referred_tenant_id, code, status, ineligible_reason)
    values (v_ref, new.id, v_code, case when v_reason is null then 'joined' else 'ineligible' end, v_reason)
    on conflict (referred_tenant_id) do nothing;
  exception when others then
    raise warning 'tenants_attribute_referral skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.tenants_attribute_referral() from public, anon, authenticated;

drop trigger if exists tenants_attribute_referral on public.tenants;
create trigger tenants_attribute_referral
  after insert on public.tenants
  for each row execute function public.tenants_attribute_referral();

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the plan columns (expect 3 rows):
--      select table_name, column_name from information_schema.columns
--       where (table_name = 'billing_subscriptions' and column_name in ('billing_period', 'pending_period'))
--          or (table_name = 'billing_payments' and column_name = 'period_months');
-- 2) every existing subscription is monthly (expect one row: monthly, with the count of all subscriptions):
--      select billing_period, count(*) from public.billing_subscriptions group by 1;
-- 3) the three referral tables with row level security on (expect 3 rows, all true):
--      select relname, relrowsecurity from pg_class where relname in ('referral_codes', 'referrals', 'referral_rewards');
-- 4) the browser cannot write them or read referrals (expect false, false, false):
--      select has_table_privilege('authenticated', 'public.referrals', 'select'),
--             has_table_privilege('authenticated', 'public.referral_rewards', 'insert'),
--             has_table_privilege('authenticated', 'public.referral_codes', 'insert');
-- 5) the unique rules the money code relies on (expect 3 rows):
--      select conname from pg_constraint where conname = 'referral_rewards_one_per_side'
--      union all select indexname from pg_indexes where indexname in ('referral_rewards_one_per_period', 'billing_payments_one_success_per_period');
-- 6) the trigger is there (expect 1 row):
--      select tgname from pg_trigger where tgname = 'tenants_attribute_referral';
--
-- UNDO (nothing is deleted from billing; the referral tables are new):
--   drop trigger if exists tenants_attribute_referral on public.tenants;
--   drop function if exists public.tenants_attribute_referral();
