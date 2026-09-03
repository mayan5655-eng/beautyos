-- add_owner_questions.sql
--
-- "The one question" - a card on the dashboard that asks the cosmetician one
-- actionable yes/no question at a time, and MEASURES the answer.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run `npm run migrations:status` to verify; where this header and the script
-- disagree, the script is right.
--
-- Generic on purpose: kind='gap_fill' is the first question (a cancellation
-- opened a slot - offer it over WhatsApp?), but the table is the yes-rate
-- ledger for every future question the product asks. The payload carries
-- whatever the kind needs to act on a yes; the status row is the measurement.
--
-- Yes-rate query:
--   select kind, count(*) filter (where status='yes')   as yes,
--                count(*) filter (where status='no')    as no,
--                count(*) filter (where status='expired') as expired
--     from owner_questions group by kind;
--
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.owner_questions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','yes','no','expired')),
  -- What the yes did, e.g. {"sent": 4} for gap_fill. Written on answer.
  result      jsonb,
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists owner_questions_tenant_status_idx
  on public.owner_questions (tenant_id, status, created_at desc);

alter table public.owner_questions enable row level security;

-- The cosmetician reads, creates and answers her own questions. All three are
-- tenant-scoped through the same SECURITY DEFINER resolver as everything else.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='owner_questions' and policyname='owner_questions_select_own') then
    create policy owner_questions_select_own on public.owner_questions
      for select to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='owner_questions' and policyname='owner_questions_insert_own') then
    create policy owner_questions_insert_own on public.owner_questions
      for insert to authenticated with check (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='owner_questions' and policyname='owner_questions_update_own') then
    create policy owner_questions_update_own on public.owner_questions
      for update to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

grant select, insert, update on public.owner_questions to authenticated;
