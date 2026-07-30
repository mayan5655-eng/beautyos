-- trial-gate-rollback.sql
-- The fast way back out of trial-gate-policies.sql.
--
-- SECTION 1 is the emergency button: it unblocks every tenant immediately and is
-- the only part you need in a hurry. Run it on its own.
-- SECTION 2 is optional and restores the pre-gate grants on public.tenants.
-- Read its warning before running it: it re-opens a real bypass.
--
-- Nothing here deletes tenant data, and nothing here touches a policy that
-- trial-gate-policies.sql did not create. The functions and columns from
-- trial-state.sql are left in place, so the banner and the admin panel keep
-- working; only enforcement is lifted.

-- ===========================================================================
-- SECTION 1: DROP THE WRITE BLOCK. Safe, and enough on its own.
-- ===========================================================================
-- Driven off pg_policies rather than a hardcoded table list, so it removes every
-- policy the gate created even if the table list there has since changed.
do $$
declare
  r record;
  dropped int := 0;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and policyname like '%\_require\_active\_%'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    dropped := dropped + 1;
    raise notice 'dropped % on %', r.policyname, r.tablename;
  end loop;

  raise notice 'SECTION 1 complete: % policies dropped. Writes are open again.', dropped;
end $$;

-- Confirm. MUST return 0.
select count(*) as must_be_zero_gate_fully_removed
  from pg_policies
 where schemaname = 'public'
   and policyname like '%\_require\_active\_%';


-- ===========================================================================
-- SECTION 2: OPTIONAL. Restore the old grants on public.tenants.
-- ===========================================================================
-- ONLY run this if you specifically need to undo the column-level lockdown.
--
-- WARNING, read it before running: this re-opens the self-activation bypass.
-- `authenticated` regains UPDATE on every column of public.tenants, so any
-- tenant can set her own plan_status to 'active' from the browser console and
-- walk through the gate. Section 1 already unblocks everyone, so you almost
-- never want this as part of an emergency rollback.
--
-- Section 1 does not depend on this, and leaving the lockdown in place is
-- harmless: the only column the app writes from the browser is `name`, which
-- stays granted.
--
-- Uncomment to run.
--
-- grant update on public.tenants to authenticated;
--
-- -- anon never needed UPDATE on tenants and no code path uses it, so it is
-- -- deliberately NOT restored here. Add it back only if you find a real caller.
-- -- grant update on public.tenants to anon;

-- Check the current state either way. After Section 1 alone, expect
-- can_update_name = true and can_update_plan_status = false.
select has_column_privilege('authenticated', 'public.tenants', 'name', 'update')
         as can_update_name,
       has_column_privilege('authenticated', 'public.tenants', 'plan_status', 'update')
         as can_update_plan_status;
