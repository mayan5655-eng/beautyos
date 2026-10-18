-- add_grow_signup_requests.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically). Run it AFTER add_grow_payments.sql.
--
-- WHY: a cosmetician with no Grow account yet can leave her details in Settings > Connections ("I don't have Grow yet"). The platform
-- owner reads them here and forwards them to Grow. Nothing is sent to Grow automatically.
--
-- WHAT: public.grow_signup_requests, one row per business (a second submit updates the same row). It holds her phone and business id,
-- so it is SERVER ONLY: row level security on, no policy, nothing granted to anon or authenticated. The service role (the signed-in
-- /api/grow/request route and the admin panel) bypasses RLS. A browser can never read it.
--
-- Safe to run more than once.

create table if not exists public.grow_signup_requests (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  name          text not null,
  phone         text not null,
  business_name text not null,
  business_id   text not null check (business_id ~ '^[0-9]{8,9}$'),
  status        text not null default 'new' check (status in ('new', 'forwarded', 'done')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.grow_signup_requests enable row level security;
revoke all on public.grow_signup_requests from anon, authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the table exists and is empty:
--      select count(*) from public.grow_signup_requests;
-- 2) a browser role can read nothing from it:
--      select has_table_privilege('authenticated', 'public.grow_signup_requests', 'select');   -- false
