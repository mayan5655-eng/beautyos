-- add_prospects_enrich_2026-11-11.sql
--
-- STATUS: NOT YET APPLIED (written 2026-11-11). Run by hand in the Supabase SQL
-- editor, AFTER add_prospects_2026-11-09.sql. The header is not proof of
-- anything - check with the verify queries at the bottom.
--
-- WHAT IT IS. Three optional fields on the owner's outreach list, so the screen
-- can tell her who to contact first and tailor each message:
--   followers       her Instagram follower count (0 to 10,000,000)
--   current_system  what she manages her diary with today
--   next_followup   the day to get back to her
-- The Instagram handle already exists (prospects.instagram). The priority is
-- computed in code (lib/prospects.ts prospectPriority) and never stored.
--
-- WHAT HAPPENS UNTIL IT RUNS. Nothing breaks: the list works as before, the
-- screen shows a small admin-only note, and the route writes none of the three.
--
-- Additive only: add column if not exists, nullable, no data changed, nothing
-- dropped. Grants and RLS are untouched (service role only, no policy).

begin;

alter table public.prospects add column if not exists followers integer;
alter table public.prospects add column if not exists current_system text;
alter table public.prospects add column if not exists next_followup date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prospects_followers_range') then
    alter table public.prospects add constraint prospects_followers_range
      check (followers is null or followers between 0 and 10000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prospects_current_system_check') then
    alter table public.prospects add constraint prospects_current_system_check
      check (current_system is null or current_system in
        ('whatsapp_manual', 'calmark', 'pink', 'tor4you', 'excel_or_notebook', 'other_system', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prospects_next_followup_range') then
    alter table public.prospects add constraint prospects_next_followup_range
      check (next_followup is null or next_followup between date '2020-01-01' and date '2100-12-31');
  end if;
end $$;

create index if not exists prospects_next_followup_idx on public.prospects (next_followup) where next_followup is not null;

commit;

-- ── verify ────────────────────────────────────────────────────────────────
-- 1. the three columns exist and are nullable:
--      select column_name, data_type, is_nullable from information_schema.columns
--       where table_schema = 'public' and table_name = 'prospects'
--         and column_name in ('followers', 'current_system', 'next_followup');   -- 3 rows, is_nullable = YES
-- 2. the checks are in place:
--      select conname from pg_constraint where conrelid = 'public.prospects'::regclass
--       and conname like 'prospects_%' order by 1;
-- 3. still no policy and no browser grants:
--      select count(*) from pg_policies where tablename = 'prospects';                 -- 0
