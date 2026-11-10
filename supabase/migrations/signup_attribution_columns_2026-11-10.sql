-- signup_attribution_columns_2026-11-10.sql
--
-- Where did each signup come from, as separate columns next to the existing tenants.signup_source label
-- ("instagram / bio / reel-3"): the UTM source, medium and campaign of her first touch, and the host of the
-- outside page that sent her (l.instagram.com, m.facebook.com, open.spotify.com...).
--
-- STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor.
-- OPTIONAL for the code: app/api/attribution/route.ts writes these columns and, while they do not exist,
-- falls back to writing signup_source alone (isMissingColumnError), exactly as before.
-- Safe to run more than once. Adds nullable text columns only; no data is changed and nothing is dropped.
-- The values are written by the service role only (the route), already cleaned and length-capped in
-- lib/attribution.js; the check constraints below are a second cap at the database.

alter table public.tenants add column if not exists signup_utm_source   text;
alter table public.tenants add column if not exists signup_utm_medium   text;
alter table public.tenants add column if not exists signup_utm_campaign text;
alter table public.tenants add column if not exists signup_referrer     text;

alter table public.tenants drop constraint if exists tenants_signup_attr_len;
alter table public.tenants add constraint tenants_signup_attr_len check (
  coalesce(length(signup_utm_source), 0)   <= 60 and
  coalesce(length(signup_utm_medium), 0)   <= 60 and
  coalesce(length(signup_utm_campaign), 0) <= 60 and
  coalesce(length(signup_referrer), 0)     <= 80
);

comment on column public.tenants.signup_utm_source   is 'First-touch utm_source before signup (lib/attribution.js). Service role writes it once.';
comment on column public.tenants.signup_utm_medium   is 'First-touch utm_medium before signup.';
comment on column public.tenants.signup_utm_campaign is 'First-touch utm_campaign before signup.';
comment on column public.tenants.signup_referrer     is 'Host of the outside page that referred her first visit (no path, no query).';

-- Verify (expect 4 rows):
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'tenants'
   and column_name in ('signup_utm_source', 'signup_utm_medium', 'signup_utm_campaign', 'signup_referrer')
 order by column_name;

-- Verify the count by source once signups start arriving:
select coalesce(nullif(split_part(signup_source, ' / ', 1), ''), 'unknown') as source, count(*)
  from public.tenants
 group by 1
 order by 2 desc;
