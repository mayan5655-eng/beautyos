-- add_business_tax_status_set_at.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Only ADDS - drops nothing.
--
-- WHY: settings.business_tax_status is NOT NULL with DEFAULT 'exempt' in the live database (checked 2026-10-23). A business
-- that skipped the choice in onboarding was saved as "עוסק פטור" without a word, so Morning would issue an exempt-dealer
-- receipt for a licensed dealer. The app cannot tell "she chose exempt" from "the default said exempt".
-- This column records WHEN she actually chose (onboarding, or tapping a type in Settings). The till asks her to confirm her
-- type while it is empty (app/beautyos.jsx, cashier-tax-warning). Existing rows stay empty on purpose: each business confirms
-- once. Until this runs, the app behaves exactly as before (the warning only looks at the type itself).

alter table public.settings add column if not exists business_tax_status_set_at timestamptz;

-- VERIFY
-- (a) the column exists, empty for every existing business:
--     select count(*) as businesses, count(business_tax_status_set_at) as confirmed from public.settings;
-- (b) after a business picks her type in Settings and saves, her row has a time:
--     select tenant_id, business_tax_status, business_tax_status_set_at from public.settings order by business_tax_status_set_at desc nulls last limit 5;
