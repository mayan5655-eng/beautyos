-- add_content_plan.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-21). Run by hand in the Supabase SQL editor, then add_content_gate.sql.
-- Spec: docs/specs/content-publishing.md, stage 1 (section 3.6) plus the "approved" step from decision 6.
--
-- WHAT. Her weekly content plan inside Kalmea (Content tab, behind the content_plan feature flag):
--   content_plans           one plan per business per week (week_start = the Sunday, Israel calendar)
--   content_items           the posts in it: the template and values to draw, the day and time, the state
--   content_item_platforms  one caption per platform (Instagram, Facebook now; TikTok / YouTube later) - she edits each
--   content_preferences     which days, what hour, how many posts a week, reminders on/off
-- An item's state: planned -> approved (she pressed "מאשרת") -> posted (published, or she marked it) ; or skipped.
-- Stage 2 (publishing to Meta) adds its own publish_jobs table and reads approved items; nothing here changes then.
--
-- WHO CAN SEE IT. Each business sees and writes only its own rows (tenant_id = get_user_tenant_id()), like designs.
-- The morning reminder cron reads all of them with the service role.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: the plan card says the plan is not switched on yet; the rest of the
-- Content tab is unchanged.

begin;

create table if not exists public.content_plans (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  week_start    date not null,
  status        text not null default 'active' check (status in ('draft', 'active', 'archived')),
  generated_by  text not null default 'ai' check (generated_by in ('ai', 'manual')),
  source        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (tenant_id, week_start)
);

create table if not exists public.content_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  plan_id          uuid not null references public.content_plans(id) on delete cascade,
  design_id        uuid references public.designs(id) on delete set null,
  kind             text not null default 'post' check (kind in ('post', 'reel', 'story')),
  topic            text not null default '' check (char_length(topic) <= 200),
  reason           text not null default '' check (char_length(reason) <= 300),
  template_key     text,
  "values"         jsonb not null default '{}'::jsonb,
  occasion_key     text,
  planned_for      timestamptz not null,
  status           text not null default 'planned' check (status in ('planned', 'approved', 'posted', 'skipped')),
  approved_at      timestamptz,
  posted_at        timestamptz,
  reminder_sent_at timestamptz,
  ai_label         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists content_items_tenant_planned_idx on public.content_items (tenant_id, planned_for);
create index if not exists content_items_plan_idx on public.content_items (plan_id);

create table if not exists public.content_item_platforms (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.content_items(id) on delete cascade,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  platform         text not null check (platform in ('instagram', 'facebook', 'tiktok', 'youtube_shorts')),
  caption          text not null default '' check (char_length(caption) <= 5000),
  hashtags         text[] not null default '{}',
  title            text,
  edited           boolean not null default false,
  copied_at        timestamptz,
  posted_marked_at timestamptz,
  external_url     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (item_id, platform)
);
create index if not exists content_item_platforms_tenant_idx on public.content_item_platforms (tenant_id);

create table if not exists public.content_preferences (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  platforms       text[] not null default '{instagram,facebook}',
  posting_days    int[] not null default '{0,2,4}',   -- 0 = Sunday
  post_hour       int not null default 19 check (post_hour between 6 and 23),
  items_per_week  int not null default 3 check (items_per_week between 1 and 7),
  reminders       boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- ── row level security: her own rows only ────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['content_plans', 'content_items', 'content_item_platforms', 'content_preferences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = public.get_user_tenant_id())', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id = public.get_user_tenant_id()) with check (tenant_id = public.get_user_tenant_id())', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_delete_own', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

commit;

-- ── verify ────────────────────────────────────────────────────────────────
--   select tablename, rowsecurity from pg_tables where schemaname = 'public'
--    and tablename in ('content_plans', 'content_items', 'content_item_platforms', 'content_preferences');      -- 4 rows, all true
--   select tablename, count(*) from pg_policies where tablename like 'content_%' and policyname like '%_own'
--    group by 1 order by 1;                                                                                       -- 4 each
--   select grantee, table_name from information_schema.role_table_grants
--    where table_name like 'content_%' and grantee = 'anon';                                                      -- no rows
