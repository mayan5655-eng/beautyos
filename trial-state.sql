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
-- The cutoff is now(), NOT a hardcoded date, and that matters:
--   * now() is the TRANSACTION timestamp in Postgres, identical for every
--     statement between this BEGIN and COMMIT. ADD COLUMN ... DEFAULT now()
--     stamps every pre-existing row with that same value, so `<= now()` matches
--     all of them exactly, on whatever date you happen to run this.
--   * It also correctly EXCLUDES a signup that commits while this transaction is
--     open: that row carries its own, later now().
--   * A hardcoded date would fail SILENTLY if this ran on a later day. The
--     UPDATE would match nothing, every existing tenant would stay on 'trial'
--     with a 30-day clock, and your paying users would lock themselves out a
--     month later. Verification 5c would NOT catch it, because 'trial' is not a
--     blocking state. Check 5g below exists to catch exactly that.
--
-- This file is a ONE-TIME migration. Do not re-run it once real trials exist:
-- a later run would grandfather them into 'active'. That failure direction is
-- the safe one (someone gets free access rather than being locked out), but it
-- is still not something to do by accident.
update public.tenants
   set plan_status      = 'active',
       trial_started_at = null,
       trial_ends_at    = null
 where plan_status = 'trial'
   and trial_started_at <= now();

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

-- Grants, deliberately asymmetric.
--
-- is_tenant_active() MUST be executable by `authenticated`: the Phase 3
-- RESTRICTIVE policies are evaluated as the querying role, so without this grant
-- the policy raises a permission error instead of returning a boolean. It is
-- also granted to anon purely as a robustness measure: the Phase 3 policies are
-- scoped TO authenticated and so will never call it as anon, but if one were
-- ever mis-scoped, a missing grant would hard-error rather than evaluate. Called
-- as anon it just returns true (no tenant, so nothing to block).
--
-- tenant_effective_status() stays INTERNAL, granted to nobody. is_tenant_active
-- is SECURITY DEFINER, so its inner call runs with the function OWNER's rights
-- and needs no grant on the caller's side. Withholding it matters: the function
-- accepts an ARBITRARY tenant id, and tenant UUIDs are public (they appear in
-- /book?t=<tenantId> links), so granting it to `authenticated` would let any
-- logged-in user probe whether another business is expired or paused.
--
-- service_role is granted explicitly because `revoke ... from public` strips the
-- default PUBLIC execute grant, and service_role is bypassrls, NOT superuser: it
-- does not get execute back implicitly. Without this the Phase 4 admin panel
-- would fail on permissions.
revoke execute on function public.tenant_effective_status(uuid) from public;
revoke execute on function public.is_tenant_active() from public;
grant  execute on function public.is_tenant_active() to authenticated, anon, service_role;
grant  execute on function public.tenant_effective_status(uuid) to service_role;

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

-- 5g. MUST return 0, and this is the check that matters MOST.
--     Immediately after the migration, before any new signup, EVERY tenant must
--     read 'active'. If this returns a non-zero count, step 2's grandfathering
--     did not apply, and those tenants are sitting on a 30-day clock that will
--     lock them out. 5c will NOT warn you about this, because 'trial' is not yet
--     a blocking state. Fix by re-running step 2's UPDATE before going further.
select count(*) as must_be_zero_every_tenant_active
  from public.tenants
 where plan_status <> 'active';

-- 5h. Sanity-check the grants: the leak-probe must be closed. Expected output is
--     is_tenant_active = true for authenticated, and tenant_effective_status
--     NOT executable by authenticated.
select p.proname,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('service_role',  p.oid, 'execute') as service_role_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_tenant_active', 'tenant_effective_status')
 order by p.proname;

-- 5f. Confirm the trigger that creates tenant rows does not set plan_status
--     itself (if it does, the defaults in step 1 are bypassed and new signups
--     will not get a trial). Paste the output back if it looks suspicious.
select p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where pg_get_functiondef(p.oid) ilike '%insert into%tenants%'
   and n.nspname in ('public', 'auth');
