-- add_waitlist_windows_2026-10-25.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. The code works before it runs.
-- Smart waitlist (lib/waitlistOffers.js, lib/waitlistMatch.js).
--
-- 1. The days and hours a client can do, chosen on the booking page's waiting-list form. Until these columns exist the join form still
--    puts her on the list (by treatment, as it always did) and tells her that her days and hours were not saved; offers go by treatment.
--      pref_days         smallint[]  weekdays she can do, 0 = Sunday .. 6 = Saturday; null/empty = any day
--      pref_from_minute  int         earliest start, minutes from midnight; null = any
--      pref_to_minute    int         start must be before this; null = any
-- 2. The database guard behind "the first to accept gets the slot": at most ONE claimed offer per slot (tenant, date, start minute).
--    It was created by add_audit_fixes_2026-10-20.sql; repeated here with "if not exists" in case that one never ran. Two people tapping
--    in the same second cannot both win: the second one's UPDATE fails and she is told it was taken. (A second net already exists:
--    appointments_no_overlap refuses two active appointments in one slot.)

alter table public.waitlist add column if not exists pref_days smallint[];
alter table public.waitlist add column if not exists pref_from_minute integer;
alter table public.waitlist add column if not exists pref_to_minute integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_pref_minutes_ok') then
    alter table public.waitlist add constraint waitlist_pref_minutes_ok
      check ((pref_from_minute is null or (pref_from_minute >= 0 and pref_from_minute < 1440))
         and (pref_to_minute   is null or (pref_to_minute   >  0 and pref_to_minute   <= 1440)));
  end if;
end $$;

create unique index if not exists uniq_slot_offer_claimed_minute
  on public.slot_offers (tenant_id, slot_date, (coalesce(slot_start_minute, slot_hour * 60)))
  where status = 'claimed';

-- Verify (each should return rows / true):
--   select column_name from information_schema.columns where table_name = 'waitlist' and column_name like 'pref_%';
--   select indexname from pg_indexes where indexname = 'uniq_slot_offer_claimed_minute';
