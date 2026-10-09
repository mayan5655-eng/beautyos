-- add_marketing_consent.sql
--
-- STATUS: NOT APPLIED. Run it by hand in the Supabase SQL editor. The verify queries are at the bottom.
--
-- Marketing consent and opt-out per client (Israeli communications law, section 30A).
--
-- Safe to run more than once. Safe to run BEFORE or AFTER the deploy that uses it: every column is nullable or defaulted, and the code
-- FAILS CLOSED without it - a client row that has no consent field is treated as "no consent", so until this runs nobody is on a
-- marketing list, and the client card says the migration is needed when she tries to record consent or an opt-out.
--
-- Existing clients all start as "no consent" (false). That is deliberate: nobody has said yes to promotions yet. She can mark a client
-- who did agree (in person, in writing) from the client card ("סימון הסכמה לדיוור"), which records source 'manual'.
--
--   marketing_consent         true only after an explicit yes
--   marketing_consent_at      when that yes was given
--   marketing_consent_source  'booking_page' (the unchecked-by-default checkbox) or 'manual' (she marked it)
--   marketing_opted_out_at    when she was asked to stop ("הסר"); blocks marketing until a new explicit yes
--
-- Reminders, booking confirmations and payment confirmations are not marketing and are not affected.

alter table public.clients add column if not exists marketing_consent        boolean not null default false;
alter table public.clients add column if not exists marketing_consent_at     timestamptz;
alter table public.clients add column if not exists marketing_consent_source text;
alter table public.clients add column if not exists marketing_opted_out_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_marketing_consent_source_check') then
    alter table public.clients add constraint clients_marketing_consent_source_check
      check (marketing_consent_source is null or marketing_consent_source in ('booking_page', 'manual'));  -- 'consent_form' is added by add_consent_form_source.sql
  end if;
end $$;

-- ── Verify (run these after; each should return rows) ─────────────────────────
-- 1. The four columns exist:
--    select column_name, data_type, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'clients' and column_name like 'marketing_%' order by column_name;
-- 2. Every existing client is "no consent" (expect consent_count = 0 right after the migration):
--    select count(*) filter (where marketing_consent) as consent_count, count(*) as clients from public.clients;
