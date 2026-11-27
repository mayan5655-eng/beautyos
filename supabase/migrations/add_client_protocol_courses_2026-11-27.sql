-- add_client_protocol_courses_2026-11-27.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Only ADDS - drops nothing.
--
-- WHY: "ספר הפרוטוקולים" (lib/protocolBook). When she picks a protocol for a client ("סדרת אקנה, 6 טיפולים"), the course
-- belongs on the client card: which protocol, how many sessions were planned, which were done and when. One row per course.
-- sessions is a small jsonb array [{ "date": "2026-11-27", "appointment_id": "...", "note": "..." }], capped at 40 by the
-- app (lib/protocolBook/course.ts).
--
-- Server only: RLS on, nothing granted to the browser roles. app/api/protocol-book/course reads and writes it with the
-- service role, every query filtered by the tenant from HER session. Also added to the trial gate (section 2).
--
-- Until this runs, the app says so plainly where the course would show ("צריך להריץ עדכון במסד הנתונים") and the rest of
-- the book works as before.

-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.client_protocol_courses (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  protocol_key      text not null check (char_length(protocol_key) between 1 and 60),
  sessions_planned  integer not null default 6 check (sessions_planned between 1 and 30),
  sessions          jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array'),
  status            text not null default 'active' check (status in ('active', 'done', 'stopped'))
);

create index if not exists client_protocol_courses_client on public.client_protocol_courses (tenant_id, client_id, created_at desc);
-- One active course of the same protocol per client: a second "start" continues the first instead of splitting it.
create unique index if not exists client_protocol_courses_one_active
  on public.client_protocol_courses (tenant_id, client_id, protocol_key) where status = 'active';

alter table public.client_protocol_courses enable row level security;
revoke all on public.client_protocol_courses from anon, authenticated;   -- only the server (service role) reads and writes it

-- ── 2. Trial gate (same restrictive policies and names as trial-gate-policies.sql) ──
do $$
declare
  t text;
  targets text[] := array['client_protocol_courses'];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_active())', t || '_require_active_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active())', t || '_require_active_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_active())', t || '_require_active_delete', t);
  end loop;
end $$;

-- ── VERIFY (run after; each should return what the comment says) ─────────────
-- (a) the table exists: one row, 'client_protocol_courses'
--   select to_regclass('public.client_protocol_courses');
-- (b) RLS is on: true
--   select relrowsecurity from pg_class where oid = 'public.client_protocol_courses'::regclass;
-- (c) the browser roles have no access: zero rows
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'client_protocol_courses' and grantee in ('anon', 'authenticated');
