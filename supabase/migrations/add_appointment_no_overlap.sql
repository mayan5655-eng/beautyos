-- add_appointment_no_overlap.sql
--
-- The database-level overlap guarantee that add_appointment_start_minute.sql
-- deliberately left out, now that it is safe to add.
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
-- ── Why it is safe to add NOW ───────────────────────────────────────────────
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
-- Re-run that script before applying if any time has passed. It is read-only.
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
--   a) The constraint exists.
--        select conname, pg_get_constraintdef(oid)
--          from pg_constraint where conname = 'appointments_no_overlap';
--
--   b) It actually bites. Rolled back, so nothing is left behind. Replace the
--      tenant id with your own; the second insert must fail with 23P01.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('b09637c8-a5c8-4b80-bda8-ff603f7ada60', '2020-01-09', 840, 'overlap test a', 'test', 60);
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('b09637c8-a5c8-4b80-bda8-ff603f7ada60', '2020-01-09', 870, 'overlap test b', 'test', 30);
--        rollback;
--
--   c) Back-to-back must still be allowed - 14:00+60 then 15:00+30 is not an
--      overlap. Both inserts must succeed.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('b09637c8-a5c8-4b80-bda8-ff603f7ada60', '2020-01-09', 840, 'adjacent a', 'test', 60);
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('b09637c8-a5c8-4b80-bda8-ff603f7ada60', '2020-01-09', 900, 'adjacent b', 'test', 30);
--        rollback;
--
--   d) A cancelled appointment must still free its slot.
--        begin;
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration, confirmation_status)
--          values ('b09637c8-a5c8-4b80-bda8-ff603f7ada60', '2020-01-09', 840, 'cancelled', 'test', 60, 'cancelled');
--          insert into public.appointments (tenant_id, date, start_minute, name, service, duration)
--          values ('b09637c8-a5c8-4b80-bda8-ff603f7ada60', '2020-01-09', 840, 'replacement', 'test', 60);
--        rollback;
