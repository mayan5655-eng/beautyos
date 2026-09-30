-- STATUS: NOT YET APPLIED.
-- The folder name is not a status. See README.md in this directory.

-- demo-tenants.sql
--
-- One column: which tenants are the two public demo accounts
-- (lib/demoTenants.ts), so the platform admin panel can exclude them and
-- nothing else has to guess from a fixed UUID list on its own.
--
-- Run this BEFORE scripts/provision-demo-tenants.ts - that script's first
-- write is `tenants.upsert({ id: <fixed demo uuid>, is_demo: true, ... })`,
-- which fails outright if this column does not exist yet.
--
-- Safe to run more than once.

alter table public.tenants
  add column if not exists is_demo boolean not null default false;

create index if not exists idx_tenants_is_demo
  on public.tenants (is_demo)
  where is_demo;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The column exists, not null, default false.
--        select column_name, is_nullable, column_default
--          from information_schema.columns
--         where table_schema = 'public' and table_name = 'tenants' and column_name = 'is_demo';
--
--   b) After scripts/provision-demo-tenants.ts has run: exactly two demo tenants.
--        select id, name, is_demo from public.tenants where is_demo;
