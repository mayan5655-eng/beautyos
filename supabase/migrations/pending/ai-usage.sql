-- STATUS: APPLIED (verified 2026-09-01).
-- The folder name is not a status. See README.md in this directory.

-- ai-usage.sql
--
-- Per-tenant metering for every Anthropic call the product makes.
--
-- WHY IT EXISTS. Ten AI calls across eight files, and until now not one of them
-- recorded anything. That means: cost cannot be attributed to a tenant, one
-- business burning fifty times the average is invisible, no plan can enforce a
-- volume limit, and pricing tiers would be guesswork. The plan gates control
-- FEATURE ACCESS, not spend.
--
-- ── What it holds, and what it must never hold ─────────────────────────────
-- Numbers only: which business, which feature, which model, how many tokens,
-- what it cost. There is no column for a prompt, a completion, a client name,
-- a phone number or a photo. That is deliberate - this table will be read by
-- an admin panel that must never become a window onto a cosmetician's clients.
--
-- ── Locked down the same way support_messages and platform_admins are ──────
-- RLS ENABLED with ZERO POLICIES: deny-all for anon and authenticated. Only
-- the service-role key can read or write it. A tenant cannot read her own
-- usage back, cannot read anyone else's, and cannot discover the table exists.
--
-- The explicit REVOKE below is NOT redundant with RLS. Supabase grants anon and
-- authenticated broad table privileges BY DEFAULT on every newly created table,
-- and support-messages.sql already carries a verify block warning that exactly
-- this happened to it. RLS with no policies denies row access, but the GRANT is
-- what decides whether the table is reachable at all - and TRUNCATE is a table
-- privilege that RLS does not cover. Revoke, then verify.
--
-- Safe to run more than once.

create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),

  -- NULLABLE, and deliberately NOT a foreign key.
  --
  -- Nullable because NULL is a real and useful value here: "we could not
  -- attribute this call". A synthetic platform-tenant UUID would blend genuine
  -- platform spend with attribution bugs and hide both. NULL is queryable, and
  -- a rising count of it is the alarm that something stopped attributing.
  --
  -- No FK because a usage row is a record of money actually spent - an audit
  -- fact. ON DELETE CASCADE would erase a tenant's entire billing history the
  -- moment the tenant row went away; ON DELETE SET NULL would silently turn it
  -- into an attribution failure, which is a different thing and would corrupt
  -- the alarm above. The cost of this choice is no referential integrity, which
  -- for an append-only metering table is the right trade.
  tenant_id      uuid,

  -- Which feature spent the money. NOT NULL even when tenant_id is null, so an
  -- unattributed row still says what it was.
  call_site      text not null,

  -- How much to trust tenant_id.
  --   'verified' - resolved server-side from the session or from an
  --                unforgeable server-side lookup (a GreenAPI instance id, a
  --                Facebook page row).
  --   'claimed'  - taken from the request body and NOT verifiable.
  -- Today only api/skin-scan is 'claimed': it is a PUBLIC route with no session
  -- that reads tenantId straight from the caller's JSON. Its usage is recorded
  -- because pretending it did not happen would be worse, but it must not be
  -- billed to a tenant without being reconciled first.
  attribution    text not null default 'verified'
                 check (attribution in ('verified', 'claimed')),

  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,

  -- Computed AT WRITE TIME from the model's rate, so historical rows stay
  -- correct when prices change. NULL means the model was not in the rate table:
  -- recording 0 would read as "this was free" and hide real spend forever,
  -- whereas NULL reads as "we do not know", which is the truth.
  cost_usd       numeric(12,6),

  created_at     timestamptz not null default now()
);

-- The query this table exists to answer: what did this business spend, lately.
create index if not exists idx_ai_usage_tenant_created
  on public.ai_usage (tenant_id, created_at desc);

-- Secondary: "which feature is burning the money", across all tenants.
create index if not exists idx_ai_usage_call_site_created
  on public.ai_usage (call_site, created_at desc);

alter table public.ai_usage enable row level security;
-- No policies are created on purpose. RLS with zero policies = deny all for
-- every role except service_role, which bypasses RLS entirely.

-- ── REVOKE, immediately, in the same migration ─────────────────────────────
-- Not optional and not belt-and-braces. Supabase's default grants would
-- otherwise leave this table readable by anon the moment it is created.
revoke all on public.ai_usage from anon;
revoke all on public.ai_usage from authenticated;
revoke all on public.ai_usage from public;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The table exists and is locked down.
--      EXPECT rls_enabled = true AND policy_count = 0.
--        select c.relrowsecurity as rls_enabled,
--               (select count(*) from pg_policies
--                 where schemaname='public' and tablename='ai_usage') as policy_count
--          from pg_class c where c.oid = 'public.ai_usage'::regclass;
--
--   b) THE ONE THAT MATTERS. Nothing but service_role may touch it.
--      MUST RETURN ZERO ROWS.
--        select grantee, privilege_type
--          from information_schema.role_table_grants
--         where table_schema='public' and table_name='ai_usage'
--           and grantee in ('anon','authenticated','PUBLIC');
--      If this returns rows, the REVOKE above did not take - re-run it. See
--      revoke-anon-grants.sql section 3 for the ALTER DEFAULT PRIVILEGES block
--      that stops this recurring on the next table.
--
--   c) Both indexes landed. EXPECT two rows besides the primary key.
--        select indexname, indexdef from pg_indexes
--         where schemaname='public' and tablename='ai_usage';
--
--   d) After the app has run for a day - is anything failing to attribute?
--      A non-zero count here is not necessarily wrong (skin-scan can arrive
--      with no tenantId at all), but a RISING one means something broke.
--        select call_site, attribution, count(*), round(sum(cost_usd)::numeric, 4) as usd
--          from public.ai_usage
--         where created_at > now() - interval '1 day'
--         group by 1, 2 order by 4 desc nulls last;
--
--   e) Any model spending money without a known rate? MUST RETURN ZERO ROWS.
--        select distinct model from public.ai_usage where cost_usd is null;
