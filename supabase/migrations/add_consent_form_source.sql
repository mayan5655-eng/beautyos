-- add_consent_form_source.sql
--
-- STATUS: NOT APPLIED. Run it by hand in the Supabase SQL editor, AFTER add_marketing_consent.sql (which is already applied).
--
-- Marketing consent can now also be given on the client-facing treatment consent form (an optional, unchecked box
-- "אשמח לקבל עדכונים ומבצעים"). That is a new source value, 'consent_form', so the check constraint on
-- clients.marketing_consent_source is widened to allow it.
--
-- Safe to run more than once. Safe to run BEFORE or AFTER the deploy: until it runs, signing a form still works, only the
-- consent is not recorded (the server logs it and moves on - a signed health declaration is never put at risk by this box).

alter table public.clients drop constraint if exists clients_marketing_consent_source_check;
alter table public.clients add constraint clients_marketing_consent_source_check
  check (marketing_consent_source is null or marketing_consent_source in ('booking_page', 'manual', 'consent_form'));

-- ── Verify ────────────────────────────────────────────────────────────────────
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'clients_marketing_consent_source_check';
--   expect: CHECK (... IN ('booking_page', 'manual', 'consent_form'))
