-- STATUS: UNKNOWN - verification query in README.md.
-- The folder name is not a status. See README.md in this directory.

-- support-messages.sql
--
-- The table behind the persistent "תקועה?" button.
--
-- WHY IT EXISTS. Until now a cosmetician who got stuck had exactly one route to
-- a human: notice the WhatsApp link on the trial banner, which only appears when
-- her plan needs attention. Someone stuck on day three with a working plan had
-- nowhere to go. The button is on every screen; this is where it lands.
--
-- ── What it may hold ───────────────────────────────────────────────────────
-- Her own words, plus enough context to answer her without a back-and-forth:
-- which business, which screen, which build, and the id of the last error her
-- browser reported. NOTHING ELSE.
--
-- Deliberately NOT here: any client's name, phone, appointment, photo or
-- treatment note. The app never attaches them, and there is no column that
-- could hold them. Her free-text message is the one field she controls, so it
-- is the one place a client name could appear at all - and only because she
-- typed it herself, knowingly, to explain her problem.
--
-- ── Locked down the same way platform_admins is ────────────────────────────
-- RLS ENABLED with ZERO POLICIES: a deny-all for both anon and authenticated.
-- Only the service-role key can read or write it. A tenant cannot read her own
-- messages back, cannot read anyone else's, and cannot discover the table
-- exists. The API route writes on the service role after resolving her tenant
-- from her SESSION - never from anything the caller sends.
--
-- Safe to run more than once.

create table if not exists public.support_messages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  message          text not null,
  tab              text,
  app_version      text,
  sentry_event_id  text,
  created_at       timestamptz not null default now(),
  -- For the admin panel: mark one as dealt with without deleting it.
  handled_at       timestamptz,
  handled_note     text
);

alter table public.support_messages enable row level security;

-- The admin panel lists newest-first, and filters to unhandled.
create index if not exists idx_support_messages_created
  on public.support_messages (created_at desc);
create index if not exists idx_support_messages_open
  on public.support_messages (handled_at, created_at desc);

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The table exists and is locked down.
--      EXPECT rls_enabled = true AND policy_count = 0.
--        select c.relrowsecurity as rls_enabled,
--               (select count(*) from pg_policies
--                 where schemaname='public' and tablename='support_messages') as policy_count
--          from pg_class c where c.oid = 'public.support_messages'::regclass;
--
--   b) Nothing can read it except service_role. MUST RETURN ZERO ROWS.
--        select grantee, privilege_type
--          from information_schema.role_table_grants
--         where table_schema='public' and table_name='support_messages'
--           and grantee in ('anon','authenticated');
--      NOTE: if this returns rows, the Supabase default grants applied to this
--      new table too. That is exactly the decay revoke-anon-grants.sql warns
--      about in its section 3, and it is the reason to consider the
--      ALTER DEFAULT PRIVILEGES block there.
