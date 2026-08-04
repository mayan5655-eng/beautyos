-- checks.sql
-- Verification for gate.sql. Run AFTER gate.sql has committed.
--
-- IMPORTANT: the Supabase SQL editor shows only the LAST statement's result set,
-- so running this whole file at once would show you 6g alone. Run each check
-- SEPARATELY, one block at a time, and read its expected value.
--
-- If 6e returns can_update_plan_status = true, do not investigate: the gate is
-- live AND self-bypassable at the same time. Run trial-gate-rollback.sql
-- Section 1 first, then look into it.


-- ── 6a. Inventory ──────────────────────────────────────────────────────────
-- EXPECT 60 rows. Every row must read:
--   permissive = RESTRICTIVE
--   roles      = {authenticated}
--   cmd        in (INSERT, UPDATE, DELETE)      <-- never SELECT, never ALL
select tablename, policyname, permissive, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
 order by tablename, cmd;


-- ── 6b. Counts ─────────────────────────────────────────────────────────────
-- EXPECT policy_count = 60 and tables_gated = 20 (three policies each on twenty
-- tables). A lower number means a table was skipped: 6g names which one.
select count(*) as policy_count, count(distinct tablename) as tables_gated
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%';


-- ── 6c. The read-only guarantee, checked mechanically ─────────────────────
-- MUST return 0. Any non-zero result means something blocks reads, which is the
-- one thing this gate must never do.
select count(*) as must_be_zero_no_read_blocking
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
   and cmd in ('SELECT', 'ALL');


-- ── 6d. anon is never restricted ──────────────────────────────────────────
-- MUST return 0. Proves her clients' public flows cannot be touched by the gate.
select count(*) as must_be_zero_anon_never_restricted
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%'
   and 'anon' = any(roles);


-- ── 6e. The self-activation bypass is closed ─────────────────────────────
-- THE MOST IMPORTANT CHECK. EXPECT:
--   can_update_name          = true    (onboarding still renames her business)
--   can_update_plan_status   = false   (she cannot un-expire herself)
--   can_update_trial_ends_at = false   (she cannot extend her own trial)
select has_column_privilege('authenticated', 'public.tenants', 'name', 'update')
         as can_update_name,
       has_column_privilege('authenticated', 'public.tenants', 'plan_status', 'update')
         as can_update_plan_status,
       has_column_privilege('authenticated', 'public.tenants', 'trial_ends_at', 'update')
         as can_update_trial_ends_at;


-- ── 6f. settings is deliberately NOT gated ───────────────────────────────
-- MUST return 0, so she can always fix the name, phone and opening hours that
-- her public booking site shows her clients.
select count(*) as must_be_zero_settings_not_gated
  from pg_policies
 where schemaname = 'public'
   and tablename = 'settings'
   and policyname like '%\_require\_active\_%';


-- ── 6g. Which tables failed to gate ──────────────────────────────────────
-- MUST return ZERO ROWS. More reliable than reading gate.sql's NOTICE output,
-- which the dashboard may hide. Any row here is a table a blocked tenant can
-- still write to. Keep this list identical to gate.sql's `targets` array.
select t as table_not_gated
  from unnest(array[
    'appointments','clients','service_prices','receipts','leads',
    'expenses','packages','waitlist','forms',
    'client_photos','treatment_protocols','skin_scans',
    'advisor_messages','campaigns','campaign_posts','community_posts',
    'slot_offers','whatsapp_messages','auto_reminders_log','facebook_pages'
  ]) t
 where not exists (
   select 1 from pg_policies
    where schemaname = 'public'
      and tablename = t
      and policyname like '%\_require\_active\_%'
 );
