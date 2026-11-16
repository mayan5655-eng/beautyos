-- add_facebook_groups_2026-11-16.sql
--
-- STATUS: NOT YET APPLIED (written 2026-11-16). Run by hand in the Supabase SQL editor; check with the verify
-- queries at the bottom. Safe to run more than once. Deletes NOTHING.
--
-- WHAT IT IS. "הקבוצות שלי": the Facebook groups a cosmetician posts in, saved once (name, link, the group's posting
-- rule if it has one), plus when she last posted there. The save/share panel (app/design/SaveShare.jsx) lists them
-- under a finished post: one tap copies the text and opens that group, then she marks it posted.
-- Nothing here talks to Facebook (Meta closed the Groups API in 2024); it is her own list.
--
-- AN OLDER TABLE EXISTS. Production already has an empty public.facebook_groups from an early version (category,
-- region, member_count, notes, is_active, total_posts, total_leads_from_group, updated_at) that no code reads. This
-- file keeps it and its columns, adds what the list needs (rule, last_posted_at), relaxes NOT NULL on the old
-- columns the new code does not fill, and adds the checks and the one-link-per-business rule.
--
-- WHO CAN SEE IT. Nobody but the service role: RLS on, no policy. /api/facebook-groups checks her session and
-- tenant and reads/writes with the service-role client, always filtered by her tenant_id.
--
-- UNTIL IT RUNS. Nothing shows: the list API fails its select and the panel and the "איפה לפרסם" card hide it.

begin;

create table if not exists public.facebook_groups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  url         text not null
);

alter table public.facebook_groups add column if not exists rule text;
alter table public.facebook_groups add column if not exists last_posted_at timestamptz;

-- The old columns: the new code never writes them, so none may block an insert.
do $$
declare c record;
begin
  for c in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'facebook_groups' and is_nullable = 'NO'
       and column_name not in ('id', 'created_at', 'tenant_id', 'name', 'url')
  loop
    execute format('alter table public.facebook_groups alter column %I drop not null', c.column_name);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facebook_groups_name_len') then
    alter table public.facebook_groups add constraint facebook_groups_name_len check (char_length(name) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'facebook_groups_url_fb') then
    alter table public.facebook_groups add constraint facebook_groups_url_fb check (url like 'https://www.facebook.com/%' and char_length(url) <= 300) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'facebook_groups_rule_len') then
    alter table public.facebook_groups add constraint facebook_groups_rule_len check (rule is null or char_length(rule) <= 140);
  end if;
end $$;

create unique index if not exists facebook_groups_tenant_url_key on public.facebook_groups (tenant_id, url);
create index if not exists facebook_groups_tenant_idx on public.facebook_groups (tenant_id, name);

alter table public.facebook_groups enable row level security;
revoke all on public.facebook_groups from anon, authenticated;

commit;

-- ── Verify (run after) ──────────────────────────────────────────────────────
-- 1. the new columns are there (expect 2 rows):
--    select column_name from information_schema.columns where table_name = 'facebook_groups' and column_name in ('rule', 'last_posted_at');
-- 2. RLS on and no policy (expect rowsecurity = true, then 0):
--    select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'facebook_groups';
--    select count(*) from pg_policies where tablename = 'facebook_groups';
