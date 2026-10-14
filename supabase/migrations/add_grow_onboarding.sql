-- add_grow_onboarding.sql
--
-- Grow merchant-onboarding updates (POST /api/grow/webhook). RUN BY HAND in the Supabase SQL editor. Safe to run twice.
-- Nothing in the app depends on it yet: the webhook answers 503 (so Grow retries) for an onboarding update until this
-- has run, and the admin panel says the list is not available.
--
--   1. grow_onboarding_updates  every onboarding update Grow sent: what it reported and whether it was attached to a
--                               tenant. The api_key and phone are never stored; user_id is server-side only.
--   2. grow_onboarding_pending  a tenant's own pending Grow onboarding, keyed by the tracking code Grow gave it. An
--                               update is attached to a tenant ONLY when its tracking_code equals a row here. Nothing
--                               writes to this table until the embedded sign-up exists, so until then every update is
--                               stored as "unmatched" and shown to the admin.
--
-- Both tables are for the server only: RLS on, no policy, nothing granted to anon or authenticated. The service role
-- (the webhook, the admin panel) bypasses RLS. A cosmetician's browser can never read user_id from here.

create table if not exists public.grow_onboarding_updates (
  id                       uuid primary key default gen_random_uuid(),
  received_at              timestamptz not null default now(),
  user_id                  text check (user_id is null or user_id ~ '^[A-Za-z0-9_-]{4,64}$'),
  tracking_code            text,
  business_title           text,
  name                     text,
  package_id               text,
  package_name             text,
  tracking_status_id       text,
  tracking_status_message  text,
  grow_status              text,
  grow_error               text,
  had_api_key              boolean not null default false,
  match_state              text not null default 'unmatched' check (match_state in ('unmatched', 'matched', 'conflict')),
  matched_tenant_id        uuid references public.tenants(id) on delete set null,
  created_at               timestamptz not null default now()
);

create index if not exists grow_onboarding_updates_received_idx on public.grow_onboarding_updates (received_at desc);
create index if not exists grow_onboarding_updates_tracking_idx on public.grow_onboarding_updates (tracking_code);

create table if not exists public.grow_onboarding_pending (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  tracking_code text not null unique,
  created_at    timestamptz not null default now(),
  consumed_at   timestamptz
);

alter table public.grow_onboarding_updates enable row level security;
alter table public.grow_onboarding_pending enable row level security;

revoke all on public.grow_onboarding_updates from anon, authenticated;
revoke all on public.grow_onboarding_pending from anon, authenticated;

-- VERIFY (expect: two rows with rowsecurity = true, and zero privileges for anon/authenticated)
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename in ('grow_onboarding_updates', 'grow_onboarding_pending');
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name in ('grow_onboarding_updates', 'grow_onboarding_pending')
--      and grantee in ('anon', 'authenticated');
