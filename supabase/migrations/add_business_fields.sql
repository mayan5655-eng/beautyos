-- add_business_fields.sql
--
-- Which kind of business a tenant practices — cosmetics, nails, or (soon)
-- more. Picked at onboarding, multi-select, changeable later in Settings →
-- כללי. See lib/businessFields.ts for the single source of truth on field
-- keys, and lib/tenantTemplate.ts for the per-field seed menu.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run `npm run migrations:status` to verify; where this header and the script
-- disagree, the script is right.
--
-- Two columns:
--
--   settings.business_fields    jsonb array of field keys ('cosmetics',
--                               'nails'), e.g. '["cosmetics","nails"]'.
--                               Drives which seed menu, default images and
--                               marketing templates a tenant is offered.
--                               Defaults to '["cosmetics"]' so every existing
--                               row — every tenant on this product today is a
--                               cosmetician — keeps behaving exactly as it
--                               does now. No backfill needed: the column
--                               default IS the backfill.
--
--   service_prices.field        text, nullable. Which field a service came
--                               from, so default-image lookup and the
--                               marketing suggestion engine can look it up
--                               instead of guessing from the service name.
--                               Left NULL for a service typed by hand rather
--                               than picked from a seed menu — the app
--                               guesses from the name for those, same as it
--                               does today for every service. NULL is a
--                               permanent, legitimate value here, not a
--                               transitional one.
--
-- The backfill below is scoped to cosmetics-only tenants specifically so it
-- stays correct — and safe to re-run — forever, not just at the moment this
-- migration is first applied. It only ever fills in `field` for a service
-- that (a) has none set and (b) belongs to a tenant whose selected fields are
-- cosmetics ONLY, which is always a true classification for that tenant's
-- services, today and on every future run. It never touches a hand-typed
-- service belonging to a nails-only or dual-field tenant — for those, NULL
-- correctly stays NULL and the app's existing name-guess applies.
--
-- No new grants or policies: both tables already carry tenant-scoped RLS, and
-- the public booking page's read path is unchanged by an added column.
--
-- Safe to run more than once.

alter table public.settings
  add column if not exists business_fields jsonb not null default '["cosmetics"]'::jsonb;

alter table public.service_prices
  add column if not exists field text;

update public.service_prices sp
   set field = 'cosmetics'
  from public.settings s
 where sp.tenant_id = s.tenant_id
   and sp.field is null
   and s.business_fields = '["cosmetics"]'::jsonb;
