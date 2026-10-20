-- add_audit_fixes_2026-10-20.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. The code works before it runs.
-- From the full code audit of 2026-10-20.
--
-- 1. Gap-fill offers: "one claim per slot" was keyed on the HOUR (slot_hour). A claim of 14:00 refused every later claim of 14:30,
--    and an old claim held its slot forever. Re-keyed on the exact start minute. (The app now also releases stale claims of a slot
--    before offering it again: app/api/slots/offer.)
-- 2. Waitlist: one waiting entry per phone and treatment, enforced by the database (two taps at once made two entries). Created only
--    when no duplicates exist yet; otherwise a NOTICE names them and nothing changes.
-- 3. Two SECURITY DEFINER functions get a fixed search_path (public, pg_temp), like every other one: get_user_tenant_id() (every RLS
--    policy calls it) and get_public_services(uuid). Only the setting changes, never the body.

-- 1 ──────────────────────────────────────────────────────────────────────────
drop index if exists public.uniq_slot_offer_claimed;
create unique index if not exists uniq_slot_offer_claimed_minute
  on public.slot_offers (tenant_id, slot_date, (coalesce(slot_start_minute, slot_hour * 60)))
  where status = 'claimed';

-- 2 ──────────────────────────────────────────────────────────────────────────
do $$
declare dups integer;
begin
  select count(*) into dups from (
    select tenant_id, service, phone from public.waitlist
     where status = 'waiting' and phone is not null
     group by tenant_id, service, phone having count(*) > 1
  ) d;
  if dups > 0 then
    raise notice 'SKIPPED waitlist unique index: % duplicate waiting entries exist. See them with: select tenant_id, service, phone, count(*) from public.waitlist where status = ''waiting'' group by 1,2,3 having count(*) > 1;', dups;
  else
    create unique index if not exists waitlist_one_waiting_per_phone
      on public.waitlist (tenant_id, service, phone) where status = 'waiting' and phone is not null;
    raise notice 'created waitlist_one_waiting_per_phone';
  end if;
end $$;

-- 3 ──────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.get_user_tenant_id()') is not null then
    alter function public.get_user_tenant_id() set search_path = public, pg_temp;
  end if;
  if to_regprocedure('public.get_public_services(uuid)') is not null then
    alter function public.get_public_services(uuid) set search_path = public, pg_temp;
  end if;
end $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
--   select indexname from pg_indexes where indexname in ('uniq_slot_offer_claimed_minute', 'waitlist_one_waiting_per_phone');
--   select proname, proconfig from pg_proc where proname in ('get_user_tenant_id', 'get_public_services');   -- search_path=public, pg_temp
