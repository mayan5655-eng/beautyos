-- add_appointment_no_overlap.sql
--
-- The database-level overlap guarantee that add_appointment_start_minute.sql
-- deliberately left out.
--
-- ── STATUS: APPLIED to production on 2026-08-22 ─────────────────────────────
-- Run by hand in the Supabase SQL Editor. This file previously said it had NOT
-- been applied, and commit 3e54196's message still does; both were true when
-- written and are now stale. The constraint is live.
--
-- Verified afterwards by behaviour, not by assuming the DDL took:
-- verify-appointment-no-overlap.js (repo root) inserts through PostgREST, so
-- lib/apptTime and every application guard are bypassed and cannot be what
-- refuses a row. Against tenant b09637c8 on sentinel date 2020-01-09, all rows
-- cleaned up afterwards and the day re-confirmed empty. (b09637c8 was described
-- here as the owner's tenant; it is not - see "Whose tenant" below. It was a
-- fine target for a rolled-back test either way, and the result stands: the
-- constraint is table-wide and partitions on tenant_id WITHIN itself, so
-- proving it fires in one tenant proves the mechanism.):
--
--     14:00+60 accepted
--     14:30+30 REJECTED - SQLSTATE 23P01,
--       'conflicting key value violates exclusion constraint
--        "appointments_no_overlap"'
--       (a different start_minute, so uniq_appt_slot_active cannot be what
--        caught it - only this constraint can)
--     15:00+30 accepted   - back-to-back is still allowed, not over-blocking
--     cancelled 16:00+60, then active 16:00+60 accepted - cancelled rows still
--                           free their slot, so the coalesce predicate works
--
-- btree_gist is therefore enabled too: a GiST exclusion constraint using
-- `tenant_id WITH =` on uuid cannot exist without it.
--
-- Re-running this file is safe and is now a no-op - it notices the constraint
-- and raises 'appointments_no_overlap already exists, skipping'.
--
-- ── Why it is needed ────────────────────────────────────────────────────────
-- `uniq_appt_slot_active` enforces "at most one active appointment per
-- (tenant_id, date, start_minute)". At whole-hour granularity that WAS a
-- no-overlap rule: two appointments either started on the same hour or did not
-- collide at all. Since half-hour starts it is not. A 14:00+60 and a 14:30+30
-- have different start minutes, so the unique index accepts both, and the
-- database will happily double-book a cosmetician.
--
-- Overlap is currently enforced only in application code (lib/apptTime
-- clashesWith, called by the public booking route, the in-app modal and the
-- importer). That means it is enforced only on the paths that remembered to
-- call it, and never against a concurrent writer: two requests can both read
-- "free", both pass the check, and both insert.
--
-- ── Why it was safe to add ──────────────────────────────────────────────────
-- PostgreSQL validates an exclusion constraint against every existing row when
-- it is created. If one pre-existing pair overlaps, this ALTER TABLE fails and
-- the only ways forward are to weaken the constraint or to change real
-- appointment data - and changing a cosmetician's booked appointments so that a
-- constraint fits is not an acceptable trade.
--
-- So it was checked first, not assumed. check-appointment-overlaps.js, run
-- read-only across every tenant on 2026-08-19:
--
--     rows scanned: 22
--     448e9e45-2251-4572-b665-886c5bc7a4c8   19 rows   0 overlapping pairs
--     b09637c8-a5c8-4b80-bda8-ff603f7ada60    2 rows   0 overlapping pairs
--     439120af-987b-4471-8b9d-afc89bc6c480    1 row    0 overlapping pairs
--     TENANTS WITH OVERLAPS: 0
--
-- It held: the ALTER TABLE below succeeded on 2026-08-22 without touching a
-- single existing row. If this ever has to be recreated on another database,
-- re-run that script first - it is read-only, and one pre-existing overlapping
-- pair is enough to make the ALTER TABLE fail outright.
--
-- Safe to run more than once.

-- btree_gist is what lets a GiST index handle plain equality on uuid and text,
-- which the tenant_id and date parts of the constraint need. Supabase keeps
-- extensions in the `extensions` schema; the fallback covers a database where
-- that schema does not exist.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    begin
      execute 'create extension btree_gist with schema extensions';
    exception when others then
      execute 'create extension btree_gist';
    end;
  end if;
end $$;

-- So the gist operator classes resolve wherever btree_gist landed.
set search_path = public, extensions;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'appointments_no_overlap'
  ) then
    raise notice 'appointments_no_overlap already exists, skipping';
    return;
  end if;

  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      tenant_id with =,
      date with =,
      (
        -- The half-open interval [start, start + duration), as int4range.
        --
        -- The CASE is the important part and is not defensive padding. A range
        -- constructor treats a NULL bound as INFINITE, not as unknown:
        -- int4range(null, 90) is (,90], which overlaps everything. A single row
        -- with a null start_minute or a null duration would therefore collide
        -- with every appointment in its tenant and day, and block all further
        -- inserts. 'empty' is the opposite - it overlaps nothing - which is the
        -- correct reading of "this row has no usable time": exempt it rather
        -- than let it veto the table.
        --
        -- duration <= 0 is folded in for the same reason, and it matches
        -- lib/apptTime: a zero-length appointment cannot clash with anything.
        case
          when start_minute is null or duration is null or duration <= 0
            then 'empty'::int4range
          else int4range(start_minute, start_minute + duration)
        end
      ) with &&
    )
    -- Cancelled appointments free their slot. Exactly the rule the application
    -- already applies everywhere (handleSave, the importer, the public booking
    -- guard), so the constraint agrees with the app rather than adding a second
    -- opinion.
    --
    -- coalesce, not a bare <>: `confirmation_status <> 'cancelled'` is NULL for
    -- a NULL status, which would silently leave such rows OUTSIDE the
    -- constraint. The column defaults to 'pending' and no NULL rows exist
    -- today, but a hole that only opens later is the worst kind.
    where (coalesce(confirmation_status, '') <> 'cancelled');

  raise notice 'added appointments_no_overlap';
end $$;

-- ── What this does and does not change ──────────────────────────────────────
--
-- `uniq_appt_slot_active` is deliberately KEPT. The exclusion constraint covers
-- almost everything it covers, but not rows with a null or zero duration, which
-- are exempt above - two of those at the same minute are still caught by the
-- unique index. It is also the index the claim flow's optimistic insert relies
-- on. Two overlapping guarantees cost one small index.
--
-- `appointments.hour` is untouched, still written, still kept in sync by
-- appointments_sync_start_minute_trg.
--
-- The constraint is NOT deferrable, on purpose. Deferring would let a
-- transaction sit in an overlapping state until commit, which only helps if
-- something swaps two appointments' times in one transaction - nothing does.
-- Immediate checking gives the clearer error, at the statement that caused it.
--
-- ── The new error code ──────────────────────────────────────────────────────
--
-- A violation raises SQLSTATE 23P01 (exclusion_violation), NOT the 23505 that
-- the unique index raises. Every path that inserts an appointment and already
-- translated 23505 into "that time was just taken" now handles 23P01 the same
-- way:
--   app/api/book-appointment/route.js  - the public /book route
--   lib/booking.ts  bookAppointmentSlot -> { taken: true }, which is the single
--     insert path behind the WhatsApp slot-claim flow (app/api/claim)
--   app/beautyos.jsx  handleDbError -> a Hebrew toast for every in-app write
--
-- app/api/claim/route.ts needs no change of its own: the 23505 it catches is on
-- slot_offers (uniq_slot_offer_claimed), a different table and a different
-- race, and its appointment insert goes through bookAppointmentSlot above.
--
-- Those changes ship with this file, so the constraint can be applied to a
-- running deployment without a code change behind it - and they are harmless
-- before it is applied, since 23P01 simply never occurs.
--
-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- b, c and d below were run as verify-appointment-no-overlap.js on 2026-08-22
-- and all passed - see STATUS at the top. They are kept because they are the
-- SQL-Editor form, and (a) in particular reads the catalog directly, which the
-- script cannot do over PostgREST. Each block is wrapped begin/rollback: run
-- each one whole, including the rollback, or it leaves test rows behind.
--
-- ── Whose tenant ────────────────────────────────────────────────────────────
--
-- Every <your-tenant-id> below is a real decision, not a formality. These
-- blocks run in the Supabase SQL editor, where RLS does not apply: the literal
-- in the INSERT is the ONLY thing deciding whose table is written to.
--
-- The owner's tenant is 448e9e45-2251-4572-b665-886c5bc7a4c8. This file used to
-- spell b09637c8-a5c8-4b80-bda8-ff603f7ada60 into every example, because
-- STAGE_SUMMARY.md had annotated that id "(yours)" and six files copied the
-- annotation. It is a different, nearly empty tenant - 2 appointments against
-- 448e9e45's 29 - and for weeks every check described as running against the
-- owner's data ran against it instead. Placeholders now, so the id has to be
-- typed deliberately rather than inherited.
--
--   a) The constraint exists.
--        select conname, pg_get_constraintdef(oid)
--          from pg_constraint where conname = 'appointments_no_overlap';
--
--   b) It actually bites. Rolled back, so nothing is left behind. Replace the
--      tenant id with your own; the second insert must fail with 23P01.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 840, 'overlap test a', 'test', 60);
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 870, 'overlap test b', 'test', 30);
--        rollback;
--
--   c) Back-to-back must still be allowed - 14:00+60 then 15:00+30 is not an
--      overlap. Both inserts must succeed.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 840, 'adjacent a', 'test', 60);
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 900, 'adjacent b', 'test', 30);
--        rollback;
--
--   d) A cancelled appointment must still free its slot.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration, confirmation_status)
--          values ('<your-tenant-id>', '2020-01-09', 840, 'cancelled', 'test', 60, 'cancelled');
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('<your-tenant-id>', '2020-01-09', 840, 'replacement', 'test', 60);
--        rollback;
