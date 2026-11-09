-- add_visit_feedback_2026-11-09.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once.
-- The code works before it runs: /review keeps the stars-only page (the two-step question needs this table), the request
-- message still goes out, and /dashboard/feedback says this update is missing.
--
-- The answer to "איך היה?" after a visit (lib/reviewRequests.ts), one row per visit:
--   mood              'happy' | 'unhappy', what she tapped
--   body              the private note an unhappy client wrote. Reaches ONLY the business owner, never published.
--   google_clicked_at when she tapped through to the Google review link (/api/reviews/go): a tap, not a proof of a review
--   read_at           when the owner marked the note as read
--
-- Locked down like product_feedback: RLS enabled with ZERO policies, so anon and authenticated can neither read nor write it.
-- Only the service role touches it: the client routes after verifying the signed review link, and the owner's routes after
-- resolving her tenant from her session (every query filtered by that tenant).

create table if not exists public.visit_feedback (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  appointment_id     uuid not null unique,
  client_id          uuid,
  client_name        text not null default '',
  mood               text not null check (mood in ('happy', 'unhappy')),
  body               text check (body is null or char_length(body) <= 1000),
  google_clicked_at  timestamptz,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.visit_feedback enable row level security;
revoke all on public.visit_feedback from anon, authenticated;

create index if not exists idx_visit_feedback_tenant_created on public.visit_feedback (tenant_id, created_at desc);

-- One private-note notification per visit: two submissions of the same link at the same moment must not reach her twice
-- (/api/reviews/feedback + lib/ownerNotify onceForAppointment). Duplicates from before this index are removed first, keeping
-- the earliest, so the index can be created.
delete from public.owner_notifications a
  using public.owner_notifications b
  where a.kind = 'visit_feedback' and b.kind = 'visit_feedback'
    and a.appointment_id is not null and a.appointment_id = b.appointment_id
    and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists uq_owner_notifications_visit_feedback_once
  on public.owner_notifications (appointment_id, kind)
  where kind = 'visit_feedback' and appointment_id is not null;

notify pgrst, 'reload schema';

-- Verify (run after the above)
-- 1. The table exists with RLS on. Expect one row: rls_on = true.
--      select relname, relrowsecurity as rls_on from pg_class where oid = 'public.visit_feedback'::regclass;
-- 2. No policies. Expect 0.
--      select count(*) as policies from pg_policies where schemaname = 'public' and tablename = 'visit_feedback';
-- 3. One answer per visit: appointment_id is unique. Expect one row.
--      select conname from pg_constraint where conrelid = 'public.visit_feedback'::regclass and contype = 'u';
-- 4. One private-note notification per visit. Expect one row.
--      select indexname from pg_indexes where schemaname = 'public' and indexname = 'uq_owner_notifications_visit_feedback_once';
