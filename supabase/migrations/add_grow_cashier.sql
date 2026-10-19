-- add_grow_cashier.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Run it AFTER add_grow_onboarding.sql, add_grow_cancellation.sql and
-- add_grow_trial_gate.sql. Safe to run more than once. The code works before it runs (it only loses the registration status).
--
-- WHAT
--   1. grow_onboarding_pending gains the registration's state, so her Grow card can say where her new Grow account stands:
--        status          waiting | approved | rejected   (lib/grow/registration.ts)
--        status_message  Grow's own words when it gave any (a refusal reason)
--        encrypted_lead  the lead id Grow returns with the registration link ("encrypted_lead"); opaque, never shown
--        link_url        the registration form link, so she can go back and finish it while it is waiting
--        updated_at
--      The table stays SERVER-ONLY: nothing is granted to anon or authenticated (add_grow_onboarding.sql revoked all).
--   2. The trial gate's write block (restrictive policies, the same as every business table) on the two onboarding tables, so they
--      follow the rule "an expired trial is read-only" if a write ever moves to the browser. Today only the service role writes them.
--
-- Payment requests (deposit / full amount) and the Bit / Apple Pay / Google Pay page codes need NO schema change: they use
-- grow_payments.kind ('charge' / 'deposit', add_grow_cancellation.sql) and client_credits.

alter table public.grow_onboarding_pending add column if not exists status text not null default 'waiting';
alter table public.grow_onboarding_pending add column if not exists status_message text;
alter table public.grow_onboarding_pending add column if not exists encrypted_lead text;
alter table public.grow_onboarding_pending add column if not exists link_url text;
alter table public.grow_onboarding_pending add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.grow_onboarding_pending drop constraint if exists grow_onboarding_pending_status_check;
  alter table public.grow_onboarding_pending add constraint grow_onboarding_pending_status_check check (status in ('waiting', 'approved', 'rejected'));
  alter table public.grow_onboarding_pending drop constraint if exists grow_onboarding_pending_link_https;
  alter table public.grow_onboarding_pending add constraint grow_onboarding_pending_link_https check (link_url is null or link_url like 'https://%' or link_url like 'http://localhost%');
end $$;

-- still server-only
revoke all on public.grow_onboarding_pending from anon, authenticated;

do $$
declare
  t text;
  targets text[] := array['grow_onboarding_pending', 'grow_onboarding_updates'];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist. Run add_grow_onboarding.sql first.', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
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
-- 1. five new columns:
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'grow_onboarding_pending' order by ordinal_position;
-- 2. still nothing granted to the browser roles (expect zero rows):
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'grow_onboarding_pending' and grantee in ('anon', 'authenticated');
-- 3. the gate (expect 6 rows):
--   select tablename, policyname from pg_policies
--    where tablename in ('grow_onboarding_pending', 'grow_onboarding_updates') and policyname like '%_require_active_%' order by 1, 2;
