-- add_content_gate.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-21). Run by hand AFTER add_content_plan.sql (and after trial-gate-policies.sql,
-- which defines public.is_tenant_active()).
--
-- WHY: every business table belongs in the trial gate's write block, so an expired trial is read-only everywhere: she can
-- still see her plan, but cannot generate, edit or approve until she renews. Same restrictive policies, same names, same
-- loop as trial-gate-policies.sql / add_grow_trial_gate.sql; a table that does not exist yet is SKIPPED with a notice.
--
-- Safe to run more than once.

do $$
declare
  t text;
  targets text[] := array['content_plans', 'content_items', 'content_item_platforms', 'content_preferences'];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist. Run add_content_plan.sql first. GAP IN THE GATE.', t;
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
-- select tablename, count(*) from pg_policies where tablename like 'content_%' and policyname like '%_require_active_%'
--  group by 1 order by 1;                                                                                           -- 3 each, 4 tables
