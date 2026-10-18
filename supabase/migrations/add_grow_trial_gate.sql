-- add_grow_trial_gate.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Run it AFTER trial-gate-policies.sql, add_grow_payments.sql and
-- add_grow_signup_requests.sql.
--
-- WHY: every business table belongs in the trial gate's write block (trial-gate-policies.sql), so an expired trial is read-only
-- everywhere. The three Grow tables are written only by the server today (nothing is granted to the browser roles for writing), so these
-- policies change nothing in practice: they keep the gate correct if a write ever moves to the browser. Same restrictive policies, same
-- names, same loop as the main file; a table that does not exist yet is SKIPPED with a notice (read the notices).
--
-- Safe to run more than once.

do $$
declare
  t text;
  targets text[] := array['grow_accounts', 'grow_payments', 'grow_signup_requests'];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist. Run its migration first.', t;
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
-- select tablename, policyname from pg_policies where tablename in ('grow_accounts', 'grow_payments', 'grow_signup_requests') and policyname like '%_require_active_%' order by 1, 2;   -- 9 rows
