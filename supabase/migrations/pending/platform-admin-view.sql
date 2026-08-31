-- STATUS: UNKNOWN - verification query in README.md.
-- The folder name is not a status. See README.md in this directory.

-- platform-admin-view.sql
--
-- The query surface for the metadata-only admin panel, plus the audit log for
-- its three write actions.
--
-- ── The point: metadata-only BY CONSTRUCTION, not by convention ────────────
-- The parked branch feat/admin-panel reads public.tenants directly on the
-- service-role key. It happens never to select a client column - but it holds a
-- key that can read everything, so "no client data" is a property of what the
-- code currently asks for. One added line would change that and nothing would
-- stop it.
--
-- This view makes it structural instead. The panel selects from
-- platform_tenant_metrics and NEVER from clients or appointments. The counts
-- are computed inside the database and only integers come out, so there is no
-- client column in the panel's query surface to select by accident.
--
-- Deliberately absent from the view: every client-identifying column. No name,
-- phone, email, note, photo, service or price of any individual. Counts, dates
-- and plan state only.
--
-- SECURITY DEFINER via a function: a plain view would run with the CALLER's
-- privileges, and after revoke-anon-grants.sql nothing but service_role can
-- read the underlying tables anyway. Wrapping it keeps the panel working
-- without handing the panel's role any table access of its own.

begin;

create or replace function public.platform_tenant_metrics()
returns table (
  id                 uuid,
  name               text,
  created_at         timestamptz,
  plan_status        text,
  effective_status   text,
  trial_ends_at      timestamptz,
  trial_days_left    integer,
  plan_price         numeric,
  signup_source      text,
  client_count       bigint,
  appointment_count  bigint,
  last_activity_at   timestamptz,
  setup_score        integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    t.created_at,
    t.plan_status,
    public.tenant_effective_status(t.id) as effective_status,
    t.trial_ends_at,
    case
      when t.plan_status = 'trial' and t.trial_ends_at is not null
        then greatest(0, ceil(extract(epoch from (t.trial_ends_at - now())) / 86400))::integer
      else null
    end as trial_days_left,
    t.plan_price,
    t.signup_source,
    (select count(*) from public.clients c      where c.tenant_id = t.id) as client_count,
    (select count(*) from public.appointments a where a.tenant_id = t.id) as appointment_count,
    -- "Is she still using it": the most recent thing she created, whichever
    -- table it landed in. A booking made FOR her counts too, which is the
    -- honest reading of an active business.
    -- The three created_at columns below are `timestamp WITHOUT time zone`,
    -- while this function returns `timestamptz`. A LANGUAGE sql body is
    -- validated at CREATE time, so without an explicit conversion the whole
    -- function fails to create with "structure of query does not match function
    -- result type" - and, because this file is not wrapped in a transaction,
    -- admin_audit_log below would still be created, leaving a half-applied
    -- migration that looks like it worked. `at time zone 'UTC'` is the correct
    -- conversion: those columns are written by the app as UTC.
    (greatest(
      (select max(a.created_at) from public.appointments a where a.tenant_id = t.id),
      (select max(c.created_at) from public.clients c      where c.tenant_id = t.id),
      (select max(r.created_at) from public.receipts r     where r.tenant_id = t.id)
    ) at time zone 'UTC') as last_activity_at,
    -- Setup progress, mirroring the seven-step checklist in app/beautyos.jsx so
    -- the panel can show who is stuck BEFORE she gives up. Counted here rather
    -- than shipped as raw settings, so no settings column leaves the database.
    (
      select
        (case when coalesce(nullif(btrim(s.business_name), ''), '') <> ''
               and coalesce(nullif(btrim(s.business_name), ''), '') <> 'העסק שלי'
               and coalesce(nullif(btrim(s.business_phone), ''), '') <> '' then 1 else 0 end)
      + (case when exists (select 1 from public.service_prices sp where sp.tenant_id = t.id) then 1 else 0 end)
      + (case when s.working_hours_start is not null and s.working_hours_end is not null then 1 else 0 end)
      + (case when coalesce(nullif(btrim(s.primary_color), ''), '') <> '' then 1 else 0 end)
      -- green_api_token_encrypted, NOT green_api_token: the plaintext column is
      -- removed by drop-green-api-token-plaintext.sql, and this function would
      -- fail to create against a column that no longer exists. Presence is all
      -- the score needs - it never reads the value, and could not decrypt it
      -- anyway, since the key lives in the app environment.
      + (case when coalesce(nullif(btrim(s.green_api_instance), ''), '') <> ''
               and coalesce(nullif(btrim(s.green_api_token_encrypted), ''), '') <> '' then 1 else 0 end)
      from public.settings s
     where s.tenant_id = t.id
     limit 1
    ) as setup_score
  from public.tenants t
  order by t.created_at desc;
$$;

revoke execute on function public.platform_tenant_metrics() from public;
revoke execute on function public.platform_tenant_metrics() from anon, authenticated;


-- ── The audit log for the three write actions ──────────────────────────────
-- change plan, extend trial, pause/reactivate. Each recorded with WHO, WHAT,
-- BEFORE, AFTER and WHEN.
--
-- The parked branch logged its actions with console.log, which lands in Vercel
-- logs and rolls off. For a tool that changes another business's billing state
-- that is not a record. This is.
--
-- Never deleted from, only appended to. RLS deny-all with zero policies, like
-- platform_admins and support_messages: service-role only.

create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  tenant_id    uuid references public.tenants(id) on delete set null,
  action       text not null,
  before_state jsonb,
  after_state  jsonb,
  created_at   timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create index if not exists idx_admin_audit_created
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_tenant
  on public.admin_audit_log (tenant_id, created_at desc);

commit;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The view returns one row per tenant, numbers only.
--        select * from public.platform_tenant_metrics();
--
--   b) NO client-identifying column can come out of it. Read the column list
--      and confirm it is counts, dates and plan state only.
--        select column_name, data_type
--          from information_schema.columns
--         where table_name = 'platform_tenant_metrics';
--
--   c) Neither anon nor authenticated may execute it. BOTH must be false.
--        select has_function_privilege('anon',          'public.platform_tenant_metrics()', 'execute') as anon_can,
--               has_function_privilege('authenticated', 'public.platform_tenant_metrics()', 'execute') as auth_can;
--
--   d) The audit table is locked down. EXPECT rls_enabled=true, policy_count=0.
--        select c.relrowsecurity as rls_enabled,
--               (select count(*) from pg_policies
--                 where schemaname='public' and tablename='admin_audit_log') as policy_count
--          from pg_class c where c.oid = 'public.admin_audit_log'::regclass;
