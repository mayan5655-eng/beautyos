-- add_product_feedback_2026-10-30.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. The code works before it runs:
-- until then /api/feedback answers available:false, the banner stays away, and /dashboard/owner/feedback says the table is missing.
--
-- The answers to the in-app feedback banner (app/FeedbackBanner.jsx, lib/feedbackBanner.ts): stars, five emoji-face questions and free text
-- about Kalmea itself. One row per business, so "only once" holds even if two phones send at the same moment.
--   rating     smallint  1 to 5 stars, required
--   answers    jsonb     question id -> 1..5, or "not_yet" for the videos question; a question she skipped is simply absent
--   free_text  text      her own words, optional
--
-- Locked down like support_messages: RLS enabled with ZERO policies, so anon and authenticated can neither read nor write it. Only the
-- service role touches it: the API route, after resolving her tenant from her session, and the owner screen, behind requirePlatformAdmin().

create table if not exists public.product_feedback (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null unique references public.tenants(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  answers     jsonb not null default '{}'::jsonb,
  free_text   text check (free_text is null or char_length(free_text) <= 2000),
  created_at  timestamptz not null default now()
);

alter table public.product_feedback enable row level security;
revoke all on public.product_feedback from anon, authenticated;

-- The owner screen lists newest first.
create index if not exists idx_product_feedback_created on public.product_feedback (created_at desc);

-- PostgREST has to see the new table before the app can use it.
notify pgrst, 'reload schema';

-- ── Verify (run after the above) ──────────────────────────────────────────
-- 1. The table exists with RLS on. Expect one row: rls_on = true.
--      select relname, relrowsecurity as rls_on from pg_class where oid = 'public.product_feedback'::regclass;
-- 2. No policies. Expect 0.
--      select count(*) as policies from pg_policies where schemaname = 'public' and tablename = 'product_feedback';
-- 3. One answer per business: tenant_id is unique. Expect one row.
--      select conname from pg_constraint where conrelid = 'public.product_feedback'::regclass and contype = 'u';
-- 4. The answers so far.
--      select count(*) as answers, round(avg(rating), 1) as avg_stars from public.product_feedback;
