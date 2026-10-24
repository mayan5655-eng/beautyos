-- add_share_events.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-24). Run by hand in the Supabase SQL editor. The header is not proof of
-- anything - check with the verify queries at the bottom.
--
-- WHAT IT IS. One row each time a cosmetician gets a finished post or reel out of the studio (app/design/SaveShare.jsx):
-- the panel opened, she tapped share and it worked / she closed it / the phone refused, or she downloaded the file.
-- Found 2026-10-24: a paying customer could not get her post onto her phone for who knows how long, and nothing told
-- us - she had to complain. With this table the admin panel shows, per day and per phone type, how many shares
-- succeed and how many fail, so the next one is visible before a customer writes in.
--
-- WHAT IS IN A ROW. Her tenant id, the kind (image/video), what happened, and the phone family (ios / android /
-- desktop) and in-app browser name (instagram / facebook / ...) derived from the user agent. No picture, no caption,
-- no file name, no client data, no full user agent.
--
-- WHO CAN SEE IT. Nobody but the service role: RLS on, no policy. /api/designs/share-event writes with the
-- service-role client after checking her session; /dashboard/admin reads it the same way.
--
-- UNTIL IT RUNS. Nothing breaks: the endpoint answers { recorded: false } and the panel ignores it; the admin panel
-- says the table is missing; the nightly invariants check reports it (lib/referencedTables.js).

begin;

create table if not exists public.share_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null check (kind in ('image', 'video')),
  -- opened: the panel appeared | shared: the share sheet finished | cancelled: she closed it |
  -- gesture: the phone wanted a fresh tap | failed: share threw | download: the download button |
  -- posted: she marked the content-plan post as published from the panel
  outcome     text not null check (outcome in ('opened', 'shared', 'cancelled', 'gesture', 'failed', 'download', 'posted')),
  -- the panel's own view of the browser: could it share files at all?
  can_share   boolean,
  device      text check (device in ('ios', 'android', 'desktop')),
  in_app      text check (in_app in ('instagram', 'facebook', 'whatsapp', 'tiktok', 'line')),
  -- where the export started: editor | advanced | reel | plan | mine
  source      text check (source in ('editor', 'advanced', 'reel', 'plan', 'mine'))
);

create index if not exists share_events_created_idx on public.share_events (created_at desc);
create index if not exists share_events_tenant_idx on public.share_events (tenant_id, created_at desc);

alter table public.share_events enable row level security;
revoke all on public.share_events from anon, authenticated;

commit;

-- ── Verify (run after) ──────────────────────────────────────────────────────
-- 1. the table exists with RLS on (expect one row, rowsecurity = true):
--    select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'share_events';
-- 2. no policy, so only the service role reads/writes (expect 0):
--    select count(*) from pg_policies where tablename = 'share_events';
-- 3. after someone exports a post on the live site (expect rows):
--    select outcome, device, in_app, count(*) from public.share_events group by 1, 2, 3 order by 4 desc;
