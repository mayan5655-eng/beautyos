-- add_wa_cloud.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Only ADDS - drops nothing.
--
-- WHY: the official WhatsApp Business Platform (Meta Cloud API) route, behind WA_CLOUD_ENABLED (default off).
-- wa_cloud_messages is one row per Cloud decision (accepted by Meta / refused here / failed at Meta). It is
--   * the cost log the admin panel shows (app/dashboard/admin/WaCloudCosts.tsx),
--   * the count the per-business daily cap is enforced from (lib/waCloud/send.ts) - in live mode the route REFUSES to
--     send while this table is missing, so run this before setting WA_CLOUD_MODE=live,
--   * where Meta's delivery status and pricing land (app/api/wa-cloud/webhook).
-- No client phone number is stored: a salted-by-purpose hash (to match an inbound "הסר") and the last 4 digits.
-- Server only: RLS on, nothing granted to the browser roles. Also added to the trial gate (section 2).

-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.wa_cloud_messages (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  message_type       text not null,
  template_name      text not null,
  category           text not null default 'UTILITY',
  mode               text not null check (mode in ('live', 'mock')),
  status             text not null check (status in ('accepted', 'refused', 'failed')),
  reason             text,
  wa_message_id      text,
  recipient_hash     text not null,
  recipient_last4    text,
  cost_estimate_usd  numeric(10, 5),
  delivery_status    text,
  delivery_updated_at timestamptz,
  billable           boolean,
  pricing_category   text,
  pricing_model      text,
  error_detail       text
);

create index if not exists wa_cloud_messages_tenant_day on public.wa_cloud_messages (tenant_id, mode, status, created_at desc);
create index if not exists wa_cloud_messages_wamid on public.wa_cloud_messages (wa_message_id) where wa_message_id is not null;
create index if not exists wa_cloud_messages_recipient on public.wa_cloud_messages (recipient_hash, created_at desc);

alter table public.wa_cloud_messages enable row level security;
revoke all on public.wa_cloud_messages from anon, authenticated;   -- only the server (service role) reads and writes it

-- ── 2. Trial gate (same restrictive policies and names as trial-gate-policies.sql) ──
do $$
declare
  t text;
  targets text[] := array['wa_cloud_messages'];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist.', t;
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

-- ── VERIFY ───────────────────────────────────────────────────────────────────
-- select to_regclass('public.wa_cloud_messages');                                                  -- expect the table name, not null
-- select count(*) from public.wa_cloud_messages;                                                   -- expect 0 (or a number, if mock ran)
-- select policyname from pg_policies where tablename = 'wa_cloud_messages' order by 1;             -- expect 3 rows: *_require_active_delete/insert/update
-- select grantee from information_schema.role_table_grants where table_name = 'wa_cloud_messages' and grantee in ('anon','authenticated');   -- expect no rows
