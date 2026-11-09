-- add_prospects_2026-11-09.sql
--
-- STATUS: NOT YET APPLIED (written 2026-11-09). Run by hand in the Supabase SQL
-- editor. The header is not proof of anything - check with the verify queries
-- at the bottom.
--
-- WHAT IT IS. The platform owner's outreach list: cosmeticians she may offer
-- Kalmea to, one message each from her own WhatsApp. Written only from
-- /dashboard/admin/outreach through /api/admin/prospects (behind
-- requirePlatformAdmin). Never anything about a cosmetician's clients.
--
-- WHO CAN SEE IT. Nobody but the service role. RLS is on, no policy exists, and
-- anon/authenticated hold no privileges, the same as admin_tenant_contacts.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: the outreach screen says a small
-- update has to run first, and saving answers with the same message.
--
-- NEVER DELETED FROM by the app. "Not interested" and "asked to stop" are
-- statuses, and they are kept so she is never offered a message again.

begin;

create table if not exists public.prospects (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 80),
  -- 9725XXXXXXXX (lib/phone.ts normalizeIsraeliMobile); one row per phone
  phone_e164         text check (phone_e164 ~ '^9725[0-9]{8}$'),
  instagram          text check (instagram ~ '^[a-z0-9._]{1,30}$'),
  city               text check (char_length(city) <= 60),
  treatment          text not null default 'other'
                       check (treatment in ('brows', 'lashes', 'face', 'nails', 'hair_removal', 'other')),
  source             text not null default 'whatsapp'
                       check (source in ('whatsapp', 'instagram', 'facebook', 'referral')),
  notes              text not null default '' check (char_length(notes) <= 1000),
  status             text not null default 'new'
                       check (status in ('new', 'messaged', 'replied', 'trial', 'paying', 'not_interested', 'opted_out')),
  last_contacted_at  timestamptz,
  contact_count      integer not null default 0 check (contact_count >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  constraint prospects_reachable check (phone_e164 is not null or instagram is not null)
);

create unique index if not exists prospects_phone_key on public.prospects (phone_e164) where phone_e164 is not null;
create index if not exists prospects_status_idx on public.prospects (status);

alter table public.prospects enable row level security;

revoke all on public.prospects from public;
revoke all on public.prospects from anon, authenticated;
grant select, insert, update on public.prospects to service_role;

commit;

-- ── verify ────────────────────────────────────────────────────────────────
-- 1. the table exists with RLS on and no policies:
--      select relrowsecurity from pg_class where oid = 'public.prospects'::regclass;   -- true
--      select count(*) from pg_policies where tablename = 'prospects';                 -- 0
-- 2. the browser roles hold nothing:
--      select grantee, privilege_type from information_schema.role_table_grants
--       where table_name = 'prospects' and grantee in ('anon', 'authenticated');      -- no rows
