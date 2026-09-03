-- add_facebook_webhook_events.sql
--
-- The audit trail for Facebook lead webhooks - the answer to "a lead came in
-- and I never saw it, where did it go?".
--
-- ── STATUS: APPLIED to production on 2026-09-03 ─────────────────────────────
-- Run by hand in the Supabase SQL Editor. An older facebook_webhook_events
-- with a different shape (no tenant_id; raw_payload/processing_error/...)
-- pre-existed, so the first run's `create if not exists` skipped it; that
-- table had no reader or writer left in the codebase and was dropped, then
-- this migration was re-run and created the table as written. tenant_id
-- verified present. Where this header and `npm run migrations:status`
-- disagree, the script is right.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
--
-- app/api/facebook/webhook/route.ts has inserted into facebook_webhook_events
-- since it was written, but no migration in this repo ever created the table.
-- If it does not exist in production, every event insert fails - quietly,
-- because the lead insert happens first and the route deliberately returns 200
-- so Meta does not retry-storm. That is the exact silent drop this table is
-- supposed to catch.
--
-- This migration is safe whether or not the table exists: create if missing,
-- then add the columns the route now needs.
--
-- ── One row per webhook change, success OR failure ──────────────────────────
--
-- Before this, an event row was only written after the lead had been fetched
-- from the Graph API - so the failure modes most likely in practice (page not
-- registered, token expired, Graph fetch failed) left NO row at all. The route
-- now writes a row for every leadgen change it sees, with processed=false and
-- error_message set when anything went wrong.
--
-- tenant_id is NULLABLE on purpose: when a webhook arrives for a page no
-- tenant registered, there is no tenant to attribute it to, and that event is
-- precisely the one worth keeping. RLS below means only the service role sees
-- those rows; a tenant sees her own.
--
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.facebook_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  event_type       text not null default 'leadgen',
  facebook_page_id text,
  leadgen_id       text,
  payload          jsonb,
  processed        boolean not null default false,
  created_at       timestamptz not null default now()
);

-- If the table already existed (created by hand at some point), make sure the
-- column the route now writes is there. add column if not exists is a no-op on
-- a fresh create above.
alter table public.facebook_webhook_events
  add column if not exists error_message text;

-- The dashboard reads "my recent events, newest first".
create index if not exists facebook_webhook_events_tenant_created_idx
  on public.facebook_webhook_events (tenant_id, created_at desc);

alter table public.facebook_webhook_events enable row level security;

-- SELECT only, own tenant only. There is deliberately no insert/update/delete
-- policy for authenticated: rows are written exclusively by the webhook route,
-- which holds the service-role key, and an audit trail a tenant can edit is
-- not an audit trail.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'facebook_webhook_events' and policyname = 'facebook_webhook_events_select_own') then
    create policy facebook_webhook_events_select_own on public.facebook_webhook_events
      for select to authenticated
      using (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

grant select on public.facebook_webhook_events to authenticated;

-- Verification:
--   select count(*) from public.facebook_webhook_events;               -- exists
--   select column_name from information_schema.columns
--    where table_name = 'facebook_webhook_events';                     -- error_message present
--   select policyname from pg_policies
--    where tablename = 'facebook_webhook_events';                      -- select_own present
