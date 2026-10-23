-- cleanup_ai_usage_test_rows_2026-10-23.sql
--
-- NOT RUN. Written 2026-10-23 for the owner to run by hand in the Supabase SQL editor, one step at a time.
--
-- What: the AI models audit (2026-10-21) found test rows in the production ai_usage table: 54 rows with
-- call_site = 'test' and 140 'leads/map-headers' rows with 0 input and 0 output tokens. The test suite
-- (test-demo-blocked.ts, test-leads-csv-import.ts and friends) calls trackedCreate / recordUsage with a fake
-- model client; when the test process has the real Supabase env loaded, recordUsage writes to the real table.
--
-- Why it matters: a 0-token row is stored with cost_usd = NULL ("unpriced"), and the per-tenant dollar ceiling
-- charges every unpriced row an assumed price (lib/ai/callCaps.ts UNPRICED_ROW_USD). So these rows are not only
-- noise in the stats: they can eat into a tenant's monthly AI budget.
--
-- Safety:
--   * The owner's real tenant 448e9e45-2251-4572-b665-886c5bc7a4c8 is EXCLUDED from every delete below.
--     If step 1 shows test rows on that tenant, deleting them is her decision (step 4, commented out).
--   * Rows are copied to ai_usage_test_rows_backup_20261023 before the delete, so nothing is lost.
--   * Only 'leads/map-headers' rows with 0 tokens on BOTH sides are touched. A real header-mapping call always
--     reads a prompt, so it has input tokens; 0/0 means the model was never reached (a test double).
--
-- Root cause is not fixed here: the tests should never get a real db client. Separate follow-up.

-- ── 1. Look first (read-only) ──────────────────────────────────────────────────────────────────────────────
select call_site, tenant_id, count(*) as rows, min(created_at) as first, max(created_at) as last,
       sum(coalesce(cost_usd, 0)) as priced_usd, count(*) filter (where cost_usd is null) as unpriced_rows
from public.ai_usage
where call_site = 'test'
   or (call_site = 'leads/map-headers' and coalesce(input_tokens, 0) = 0 and coalesce(output_tokens, 0) = 0)
group by call_site, tenant_id
order by call_site, rows desc;

-- ── 2. Back up and delete (one transaction) ────────────────────────────────────────────────────────────────
begin;

create table if not exists public.ai_usage_test_rows_backup_20261023 as
  select * from public.ai_usage where false;
revoke all on public.ai_usage_test_rows_backup_20261023 from anon, authenticated;

insert into public.ai_usage_test_rows_backup_20261023
select * from public.ai_usage
where (call_site = 'test'
       or (call_site = 'leads/map-headers' and coalesce(input_tokens, 0) = 0 and coalesce(output_tokens, 0) = 0))
  and tenant_id is distinct from '448e9e45-2251-4572-b665-886c5bc7a4c8'::uuid;

delete from public.ai_usage
where (call_site = 'test'
       or (call_site = 'leads/map-headers' and coalesce(input_tokens, 0) = 0 and coalesce(output_tokens, 0) = 0))
  and tenant_id is distinct from '448e9e45-2251-4572-b665-886c5bc7a4c8'::uuid;

commit;

-- ── 3. Verify ──────────────────────────────────────────────────────────────────────────────────────────────
-- 3a. Backed-up rows (should equal the step 1 total minus any rows on the owner's tenant):
select count(*) as backed_up from public.ai_usage_test_rows_backup_20261023;
-- 3b. What is left of the test pattern (expect 0 rows, or only rows on the owner's tenant):
select call_site, tenant_id, count(*)
from public.ai_usage
where call_site = 'test'
   or (call_site = 'leads/map-headers' and coalesce(input_tokens, 0) = 0 and coalesce(output_tokens, 0) = 0)
group by call_site, tenant_id;
-- 3c. Real usage is untouched (compare with the same query run before step 2):
select call_site, count(*) from public.ai_usage where call_site <> 'test' group by call_site order by 2 desc;

-- ── 4. ONLY IF the owner decides: the same cleanup on her own tenant ───────────────────────────────────────
-- begin;
-- insert into public.ai_usage_test_rows_backup_20261023
-- select * from public.ai_usage
-- where (call_site = 'test'
--        or (call_site = 'leads/map-headers' and coalesce(input_tokens, 0) = 0 and coalesce(output_tokens, 0) = 0))
--   and tenant_id = '448e9e45-2251-4572-b665-886c5bc7a4c8'::uuid;
-- delete from public.ai_usage
-- where (call_site = 'test'
--        or (call_site = 'leads/map-headers' and coalesce(input_tokens, 0) = 0 and coalesce(output_tokens, 0) = 0))
--   and tenant_id = '448e9e45-2251-4572-b665-886c5bc7a4c8'::uuid;
-- commit;

-- ── Undo (puts every backed-up row back) ───────────────────────────────────────────────────────────────────
-- insert into public.ai_usage select * from public.ai_usage_test_rows_backup_20261023
--   on conflict (id) do nothing;
-- Once satisfied (a week later, say): drop table public.ai_usage_test_rows_backup_20261023;
