-- trial-state.sql
-- PHASE 1 of the trial / subscription STATE mechanism.
-- Tracking only: no cards, no charging. Money is collected manually.
--
-- Run this ONCE, top to bottom, in the PRODUCTION Supabase SQL editor.
-- Steps 1 and 2 are wrapped in a single transaction on purpose (see step 2).
--
-- WHY public.tenants AND NOT public.settings:
--   * tenants is already the account-level table: it holds `plan` (read by the
--     dashboard) and `name` (written at the end of onboarding).
--   * tenants.id is what every tenant_id column points at, so exactly ONE row
--     exists per tenant, and it exists BEFORE settings does (settings is only
--     created when onboarding finishes; the app redirects to /onboarding while
--     it is missing).
--   * settings has ambiguous row identity. The dashboard contains real fallback
--     logic for choosing between MULTIPLE settings rows for one tenant. Billing
--     state must never live in a table where "the row" is a guess.
--   * settings is the table exposed publicly through get_public_branding.
--     Plan state has no business sitting on that surface.
--
-- NOTHING IS EVER DELETED BY THIS MECHANISM. 'expired' and 'paused' mean
-- blocked, not removed. Every statement below is additive or an UPDATE.

begin;

-- ── 1. Plan-state columns ──────────────────────────────────────────────────
-- The DEFAULTs are what give every NEW signup a 30-day trial automatically.
-- No application code creates the tenants row (signup only calls auth.signUp;
-- a trigger on auth.users creates tenant + tenant_members), so column defaults
-- are the only trigger-agnostic way to do this. As long as that trigger does
-- not name these columns explicitly, new tenants get the trial for free.
--
-- trial_started_at / trial_ends_at are deliberately NULLABLE: a tenant on
-- 'active' never had a tracked trial, and NULL states that honestly instead of
-- backfilling invented dates.
alter table public.tenants
  add column if not exists plan_status      text not null default 'trial',
  add column if not exists trial_started_at timestamptz default now(),
  add column if not exists trial_ends_at    timestamptz default (now() + interval '30 days'),
  add column if not exists plan_price       numeric(10,2),
  add column if not exists signup_source    text;

comment on column public.tenants.plan_status is
  'Lifecycle state: trial | active | expired | paused. Separate from `plan`, which is the FEATURE TIER (none/basic/pro/premium).';
comment on column public.tenants.plan_price is
  'The locked-in monthly price agreed with this tenant, in shekels. Informational: nothing charges it.';
comment on column public.tenants.signup_source is
  'Free text provenance, e.g. which college cohort she came from.';

alter table public.tenants drop constraint if exists tenants_plan_status_check;
alter table public.tenants add constraint tenants_plan_status_check
  check (plan_status in ('trial', 'active', 'expired', 'paused'));

create index if not exists idx_tenants_plan_status
  on public.tenants (plan_status, trial_ends_at);

-- ── 2. Grandfather every tenant that ALREADY EXISTS ────────────────────────
-- Step 1's defaults put every existing row on a trial starting today. Without
-- this step, a tenant who has been paying for months would silently lock
-- herself out 30 days from now. Existing tenants become 'active' immediately.
--
-- The cutoff makes this statement IDEMPOTENT and safe to re-run: every row that
-- existed when step 1 ran shares the same trial_started_at (the transaction
-- timestamp), and every later signup is strictly after it. Rows already
-- grandfathered have trial_started_at = NULL, which the comparison excludes.
--
-- >>> If you run this file on a LATER date than 2026-07-30, change the cutoff
-- >>> below to the day you run it, otherwise real trials will be grandfathered.
update public.tenants
   set plan_status      = 'active',
       trial_started_at = null,
       trial_ends_at    = null
 where plan_status = 'trial'
   and trial_started_at < '2026-07-31T00:00:00Z';

commit;

-- ── 3. Effective status: a trial whose end date has passed IS expired ──────
-- Single source of truth for "has this tenant's access lapsed", so the stored
-- plan_status never has to be swept by a cron job to stay correct.
create or replace function public.tenant_effective_status(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when t.plan_status = 'trial'
                and t.trial_ends_at is not null
                and t.trial_ends_at < now()
             then 'expired'
           else t.plan_status
         end
    from public.tenants t
   where t.id = p_tenant_id;
$$;

-- ── 4. The gate predicate (used by the Phase 3 RESTRICTIVE policies) ──────
--
-- THIS FUNCTION FAILS OPEN, ON PURPOSE. coalesce(..., true) means it returns
-- false ONLY when a row is found AND its effective status is definitively
-- 'expired' or 'paused'. A null tenant_id, a missing tenants row, or a null
-- plan_status all resolve to "do not block".
--
-- Why that is the correct direction, and why it is not a security hole:
--   * This is a BILLING gate, not a tenant-isolation boundary. Isolation is
--     enforced by the pre-existing PERMISSIVE policies (tenant_id =
--     get_user_tenant_id()), which are ANDed with the restrictive policy that
--     calls this. A `true` here grants NOTHING on its own: the tenant-scoping
--     check still has to pass independently. So failing open can never leak
--     one tenant's data to another.
--   * The predicate will be ANDed across ~13 tables. Failing closed would turn
--     any transient read failure into every paying customer losing write access
--     to her own calendar mid-workday. A few extra free days costs almost
--     nothing; locking out paying users costs trust that does not come back.
create or replace function public.is_tenant_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           public.tenant_effective_status(public.get_user_tenant_id())
             in ('trial', 'active'),
           true);
$$;

revoke execute on function public.tenant_effective_status(uuid) from public;
revoke execute on function public.is_tenant_active() from public;
grant  execute on function public.tenant_effective_status(uuid) to authenticated;
grant  execute on function public.is_tenant_active() to authenticated;

-- ── 5. Admin allowlist (infrastructure for the Phase 4 panel) ─────────────
-- RLS is enabled with ZERO policies, which is a deny-all for both anon and
-- authenticated. Only the service-role key (which bypasses RLS entirely) can
-- read this table, so a tenant can never read it, enumerate it, discover that
-- it exists, or add herself to it.
create table if not exists public.platform_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

insert into public.platform_admins (user_id)
select id from auth.users where email = 'mayan5655@gmail.com'
on conflict (user_id) do nothing;


-- ===========================================================================
-- VERIFICATION. Run each of these after the script and check the result.
-- ===========================================================================

-- 5a. Every tenant should read 'active'. Nothing should be trial/expired/paused
--     yet, because no new signup has happened since the migration.
--     select: id, name, plan_status, trial dates, price, source
select t.id,
       t.name,
       t.plan_status,
       public.tenant_effective_status(t.id) as effective_status,
       t.trial_started_at,
       t.trial_ends_at,
       t.plan_price,
       t.signup_source
  from public.tenants t
 order by t.plan_status, t.name;

-- 5b. YOUR OWN tenant, specifically. plan_status MUST be 'active'.
select t.id, t.name, t.plan_status, public.tenant_effective_status(t.id) as effective_status
  from public.tenants t
  join public.tenant_members m on m.tenant_id = t.id
  join auth.users u           on u.id = m.user_id
 where u.email = 'mayan5655@gmail.com';

-- 5c. MUST return 0. If it returns anything above zero, do NOT proceed to
--     Phase 3: that many tenants would be blocked the moment the gate goes on.
select count(*) as must_be_zero
  from public.tenants t
 where public.tenant_effective_status(t.id) in ('expired', 'paused');

-- 5d. MUST return true. This is the exact predicate Phase 3 will enforce,
--     evaluated as YOUR logged-in user.
select public.is_tenant_active() as must_be_true;

-- 5e. MUST return 1: you are registered as the platform admin.
select count(*) as must_be_one from public.platform_admins;

-- 5f. Confirm the trigger that creates tenant rows does not set plan_status
--     itself (if it does, the defaults in step 1 are bypassed and new signups
--     will not get a trial). Paste the output back if it looks suspicious.
select p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where pg_get_functiondef(p.oid) ilike '%insert into%tenants%'
   and n.nspname in ('public', 'auth');
