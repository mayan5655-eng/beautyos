-- add_ad_spend.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: "Revenue by source" (Marketing > performance by source) can show what each lead and each new client COST
-- only if her advertising spend is somewhere the app can read. Two writers feed this table:
--   * origin 'facebook'  - the daily job /api/facebook/ad-spend reads the account-level spend per day from the
--                          Marketing API. It needs the ads_read permission; until Meta approves it the job
--                          records nothing and the report simply shows no spend (the app degrades, it does not fail).
--   * origin 'manual'    - she types a day's or a month's spend herself (any source: Google, a printed flyer).
-- Both go through the server with the service role; the browser can only READ its own tenant's rows.
--
-- WHAT:
--   public.ad_spend (tenant_id, day, source, amount, currency, origin, campaign_id/name)
--   * source is the same free string as leads.source ("פייסבוק", "גוגל" ...), so the report can join on it.
--   * one row per tenant + day + origin + source + campaign: the daily job upserts, so re-running it is safe.
--   * RLS: members of the tenant may SELECT; nobody but the service role may insert, update or delete.
--
-- Safe to run more than once.

create table if not exists public.ad_spend (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  day           date not null,
  source        text not null default 'פייסבוק' check (btrim(source) <> '' and char_length(source) <= 60),
  amount        numeric(12,2) not null check (amount >= 0),
  currency      text not null default 'ILS',
  origin        text not null default 'manual' check (origin in ('facebook', 'manual')),
  campaign_id   text not null default '',
  campaign_name text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists ad_spend_unique_day
  on public.ad_spend (tenant_id, day, origin, source, campaign_id);

create index if not exists ad_spend_tenant_day_idx
  on public.ad_spend (tenant_id, day desc);

alter table public.ad_spend enable row level security;

drop policy if exists ad_spend_select_own on public.ad_spend;
create policy ad_spend_select_own on public.ad_spend
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id());

-- No insert/update/delete policy on purpose: writes come from the server (service role bypasses RLS).
revoke all on public.ad_spend from anon;
revoke insert, update, delete, truncate, references, trigger on public.ad_spend from authenticated;
grant select on public.ad_spend to authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the table and its policy exist:
--      select count(*) from public.ad_spend;                       -- 0 on a fresh run
--      select policyname, cmd from pg_policies where tablename = 'ad_spend';  -- one SELECT policy
-- 2) the browser role cannot write:
--      select has_table_privilege('authenticated', 'public.ad_spend', 'insert');  -- false
-- 3) in the app: Marketing > performance by source > "הוספת הוצאה" adds a row and the cost columns appear.
