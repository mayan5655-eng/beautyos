-- add_publish_jobs.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-21). Run by hand AFTER add_content_plan.sql. Spec: docs/specs/content-publishing.md
-- stage 2 (sections 4.4, 4.5).
--
-- WHAT. Automatic publishing of an APPROVED post from her content plan to her Facebook Page and her linked Instagram
-- professional account, at the time she set:
--   publish_jobs      one row per post per platform: when to run, its state, Meta's container / post ids, the error if any.
--                     States: queued -> claimed -> container_created (Instagram) -> published ; or failed / cancelled / paused.
--                     idempotency_key is unique: one job per post per platform per approval, so a retry never posts twice.
--   publish_events    append-only log of what happened to each job (never updated, never deleted).
--   content_items.media_path   the picture that is published (rendered from her card when she approved, in her private folder).
--   facebook_pages.publish_enabled / ig_account_type   whether this Page may be published to (she turns it on), and what
--                     kind of Instagram account is linked.
-- Nothing existing is removed or changed in meaning.
--
-- WHO CAN SEE IT. She reads her own jobs (to see "scheduled / published / failed"); only the server (service role) writes
-- them. The publisher cron runs as the service role and checks that her plan is active before publishing anything.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: approving a post works as before (reminder only) and the board says
-- automatic publishing is not switched on yet.

begin;

alter table public.content_items add column if not exists media_path text;

alter table public.facebook_pages add column if not exists publish_enabled boolean not null default false;
alter table public.facebook_pages add column if not exists ig_account_type text;

create table if not exists public.publish_jobs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  item_id          uuid not null references public.content_items(id) on delete cascade,
  item_platform_id uuid references public.content_item_platforms(id) on delete set null,
  platform         text not null check (platform in ('instagram', 'facebook')),
  page_id          text not null,
  run_at           timestamptz not null,
  state            text not null default 'queued'
                     check (state in ('queued', 'claimed', 'container_created', 'published', 'failed', 'cancelled', 'paused')),
  attempts         int not null default 0,
  container_id     text,
  external_id      text,
  external_url     text,
  error_class      text,
  error_text       text check (error_text is null or char_length(error_text) <= 500),
  locked_until     timestamptz,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists publish_jobs_due_idx on public.publish_jobs (state, run_at);
create index if not exists publish_jobs_item_idx on public.publish_jobs (item_id);

create table if not exists public.publish_events (
  id         bigint generated always as identity primary key,
  job_id     uuid not null references public.publish_jobs(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  at         timestamptz not null default now(),
  event      text not null,
  detail     jsonb
);
create index if not exists publish_events_job_idx on public.publish_events (job_id, at);

alter table public.publish_jobs enable row level security;
alter table public.publish_events enable row level security;

drop policy if exists publish_jobs_select_own on public.publish_jobs;
create policy publish_jobs_select_own on public.publish_jobs for select to authenticated using (tenant_id = public.get_user_tenant_id());
drop policy if exists publish_events_select_own on public.publish_events;
create policy publish_events_select_own on public.publish_events for select to authenticated using (tenant_id = public.get_user_tenant_id());

revoke all on public.publish_jobs from anon, public;
revoke all on public.publish_events from anon, public;
revoke all on public.publish_jobs from authenticated;
revoke all on public.publish_events from authenticated;
grant select on public.publish_jobs to authenticated;
grant select on public.publish_events to authenticated;
grant all on public.publish_jobs to service_role;
grant all on public.publish_events to service_role;

commit;

-- ── verify ────────────────────────────────────────────────────────────────
--   select tablename, rowsecurity from pg_tables where tablename in ('publish_jobs', 'publish_events');            -- both true
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('publish_jobs', 'publish_events') and grantee in ('anon', 'authenticated');              -- SELECT for authenticated only
--   select column_name from information_schema.columns where table_name = 'facebook_pages' and column_name in ('publish_enabled', 'ig_account_type');   -- 2 rows
--   select column_name from information_schema.columns where table_name = 'content_items' and column_name = 'media_path';                             -- 1 row
