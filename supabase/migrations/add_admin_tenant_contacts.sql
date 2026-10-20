-- add_admin_tenant_contacts.sql
--
-- STATUS: NOT YET APPLIED (written 2026-10-20). Run by hand in the Supabase SQL
-- editor. The header is not proof of anything - check with the verify queries
-- at the bottom.
--
-- WHAT IT IS. The platform owner's own follow-up notes about each business that
-- signed up to Kalmea: has she already spoken to her, what was said, when to
-- get back to her. One row per business, written only from
-- /dashboard/admin/subscribers through /api/admin/tenant-contact (behind
-- requirePlatformAdmin). It is the owner's CRM about her own customers, never
-- anything about a cosmetician's clients.
--
-- WHO CAN SEE IT. Nobody but the service role. RLS is on, no policy exists, and
-- anon/authenticated hold no privileges, the same as platform_admins and
-- ops_events: a cosmetician cannot read, enumerate or discover what the owner
-- wrote about her.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: the subscribers screen shows
-- every business as "not contacted yet" and says the notes are not available
-- yet; saving a note answers with a Hebrew message that this file has not run.
--
-- NEVER DELETED FROM by the app. on delete cascade only follows a business
-- that is itself removed by hand.

begin;

create table if not exists public.admin_tenant_contacts (
  tenant_id      uuid primary key references public.tenants(id) on delete cascade,
  -- not_contacted | contacted | follow_up | no_answer | not_relevant
  status         text not null default 'not_contacted'
                   check (status in ('not_contacted', 'contacted', 'follow_up', 'no_answer', 'not_relevant')),
  note           text not null default '' check (char_length(note) <= 1000),
  -- when to get back to her (an Israel calendar day), only meaningful with follow_up
  follow_up_on   date,
  -- first time the status left not_contacted, kept across later edits
  contacted_at   timestamptz,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null
);

alter table public.admin_tenant_contacts enable row level security;

revoke all on public.admin_tenant_contacts from public;
revoke all on public.admin_tenant_contacts from anon, authenticated;
grant select, insert, update on public.admin_tenant_contacts to service_role;

create index if not exists admin_tenant_contacts_follow_up_idx
  on public.admin_tenant_contacts (follow_up_on)
  where status = 'follow_up';

commit;

-- ── verify ────────────────────────────────────────────────────────────────
-- 1. the table exists with RLS on and no policies:
--      select relrowsecurity from pg_class where oid = 'public.admin_tenant_contacts'::regclass;   -- true
--      select count(*) from pg_policies where tablename = 'admin_tenant_contacts';                 -- 0
-- 2. the browser roles hold nothing:
--      select grantee, privilege_type from information_schema.role_table_grants
--       where table_name = 'admin_tenant_contacts' and grantee in ('anon', 'authenticated');      -- no rows
