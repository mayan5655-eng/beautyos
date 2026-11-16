-- add_facebook_groups_2026-11-16.sql
--
-- STATUS: NOT YET APPLIED (written 2026-11-16). Run by hand in the Supabase SQL editor; check with the verify
-- queries at the bottom.
--
-- WHAT IT IS. "הקבוצות שלי": the Facebook groups a cosmetician posts in, saved once (name, link, the group's posting
-- rule if it has one), plus when she last posted there. The save/share panel (app/design/SaveShare.jsx) lists them
-- under a finished post: one tap copies the text and opens that group, then she marks it posted.
-- Nothing here talks to Facebook (Meta closed the Groups API in 2024); it is her own list.
--
-- WHO CAN SEE IT. Nobody but the service role: RLS on, no policy. /api/facebook-groups checks her session and
-- tenant and reads/writes with the service-role client, always filtered by her tenant_id.
--
-- UNTIL IT RUNS. Nothing shows: the API answers { available: false } and the panel and the "איפה לפרסם" card hide
-- the list. The nightly check reports the table missing (lib/referencedTables.js).

begin;

create table if not exists public.facebook_groups (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  url             text not null check (url like 'https://www.facebook.com/%' and char_length(url) <= 300),
  rule            text check (rule is null or char_length(rule) <= 140),
  last_posted_at  timestamptz,
  unique (tenant_id, url)
);

create index if not exists facebook_groups_tenant_idx on public.facebook_groups (tenant_id, name);

alter table public.facebook_groups enable row level security;
revoke all on public.facebook_groups from anon, authenticated;

commit;

-- ── Verify (run after) ──────────────────────────────────────────────────────
-- 1. the table exists with RLS on (expect one row, rowsecurity = true):
--    select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'facebook_groups';
-- 2. no policy, so only the service role reads/writes (expect 0):
--    select count(*) from pg_policies where tablename = 'facebook_groups';
