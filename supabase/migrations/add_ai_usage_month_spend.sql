-- add_ai_usage_month_spend.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- One SUM instead of a paged read of up to 50,000 ai_usage rows on every AI call.
--
-- lib/ai/callCaps.ts checks the tenant's monthly dollar ceiling before every AI call. It used to read the
-- whole month's rows (ai_usage.id, cost_usd) a page at a time and add them up in the server. With this
-- function the sum happens in the database and the code asks once. The application falls back to the paged
-- read when this function does not exist, so running this is an optimisation, never a requirement.
--
-- The pricing rule is the one the application already applies: a row with no price (cost_usd null) or a price
-- of exactly zero (a response with no usage block) is assumed to have cost p_unpriced, so the calls the meter
-- cannot price are not a way around the ceiling.
--
-- Only the service role may call it (callCaps uses the service-role client); it is not exposed to signed-in
-- users, who could otherwise read another tenant's spend by passing its id.

create or replace function public.ai_usage_month_spend(
  p_tenant   uuid,
  p_since    timestamptz,
  p_unpriced numeric default 0.05
)
returns numeric
language sql
stable
security invoker
as $$
  select coalesce(
    sum(case when cost_usd is null or cost_usd <= 0 then p_unpriced else cost_usd end),
    0
  )
  from public.ai_usage
  where tenant_id = p_tenant
    and created_at >= p_since;
$$;

revoke all on function public.ai_usage_month_spend(uuid, timestamptz, numeric) from public;
revoke all on function public.ai_usage_month_spend(uuid, timestamptz, numeric) from anon, authenticated;
grant execute on function public.ai_usage_month_spend(uuid, timestamptz, numeric) to service_role;

-- VERIFY (run after the statements above):
--   select public.ai_usage_month_spend(
--     (select id from public.tenants limit 1),
--     date_trunc('month', now()),
--     0.05
--   );
--   -- expect one number (0 for a tenant with no AI use this month)
--
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_name = 'ai_usage_month_spend';
--   -- expect service_role only (plus the owner)
