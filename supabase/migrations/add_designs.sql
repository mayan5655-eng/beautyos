-- add_designs.sql
--
-- The design studio's one table. A DESIGN is the cosmetician's own thing:
-- an instance of one of OUR templates (lib/design/templates, versioned,
-- immutable) with the values she filled, the pictures she chose and her
-- overrides, so it reopens exactly as she left it. A template is never
-- stored here; the row points at it by key + version.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run `npm run migrations:status` to verify; where this header and the script
-- disagree, the script is right. Run by hand in the Supabase SQL Editor.
--
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.designs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  template_key      text not null,
  template_version  integer not null check (template_version >= 1),
  category          text not null check (category in ('offer','before_after','tip','review','new_treatment','seasonal')),
  format            text not null default 'feed45' check (format in ('feed45','story','square')),
  name              text not null default '',
  values            jsonb not null default '{}'::jsonb,   -- variable key -> text she filled
  images            jsonb not null default '{}'::jsonb,   -- slot key -> url she chose
  overrides         jsonb not null default '{}'::jsonb,   -- her edits beyond filling (lib/design/design.ts)
  preview_path      text,                                  -- storage object path of the last preview
  export_path       text,                                  -- storage object path of the last export
  is_default        boolean not null default false,        -- her default for the category
  parent_id         uuid references public.designs(id) on delete set null,  -- duplicated from
  status            text not null default 'draft' check (status in ('draft','final','archived')),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists designs_tenant_updated_idx
  on public.designs (tenant_id, updated_at desc);
create index if not exists designs_tenant_category_idx
  on public.designs (tenant_id, category, status);
-- One default per category per tenant.
create unique index if not exists designs_one_default_per_category
  on public.designs (tenant_id, category)
  where is_default;

alter table public.designs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='designs' and policyname='designs_select_own') then
    create policy designs_select_own on public.designs
      for select to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='designs' and policyname='designs_insert_own') then
    create policy designs_insert_own on public.designs
      for insert to authenticated with check (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='designs' and policyname='designs_update_own') then
    create policy designs_update_own on public.designs
      for update to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='designs' and policyname='designs_delete_own') then
    create policy designs_delete_own on public.designs
      for delete to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- revoke-anon-grants.sql section 3 is still off: a new table inherits the
-- default anon grants unless revoked here.
revoke all on public.designs from anon;
revoke all on public.designs from authenticated;
grant select, insert, delete on public.designs to authenticated;
grant update (name, values, images, overrides, preview_path, export_path, is_default, status, updated_at)
  on public.designs to authenticated;

-- Trial gate: 'designs' is added to the targets array in trial-gate-policies.sql
-- (three restrictive policies, like every other table she writes). Re-run
-- that file after this one; its expected counts are 63 policies / 21 tables.

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- select policyname from pg_policies where tablename='designs' order by 1;
--   -> designs_delete_own, designs_insert_own, designs_select_own, designs_update_own
--      (+ designs_require_active_* after the gate)
-- select indexname from pg_indexes where tablename='designs';
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='designs' and grantee in ('anon','authenticated');
--   -> authenticated: SELECT, INSERT, DELETE, UPDATE; no anon rows

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.designs;
-- (and remove 'designs' from the targets array in trial-gate-policies.sql)
