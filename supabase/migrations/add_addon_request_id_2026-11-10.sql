-- add_addon_request_id_2026-11-10.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: the upgrades store (app/UpgradesStore.jsx) sends one request id per purchase intent. Saving it on the add-on's billing_payments
-- row makes a purchase idempotent on the server: the same id twice (a double tap, a retry after a lost answer, the sheet reopened) gets
-- the first charge's outcome and is never charged again, and the store can ask "what happened to this purchase?" by that id
-- (GET /api/billing/upgrades?request=<id>) instead of guessing.
--
-- SAFE: one nullable column and one partial unique index. No data is changed; every existing row keeps request_id null. Safe to run twice.
-- The app works before this runs: lib/billing/repo.ts sees the missing column and falls back (the purchase still works, a retry is
-- matched to a charge of the same pack in the last 15 minutes, and the store never says "not charged" when it cannot tell).
--
-- RUN ORDER: after add_kalmea_billing.sql and add_billing_addons.sql (both already required for packs).

alter table public.billing_payments add column if not exists request_id text;

-- One charge per purchase intent per business. Partial: every row without an id (subscriptions, manual payments, older add-ons) is untouched.
create unique index if not exists billing_payments_tenant_request
  on public.billing_payments (tenant_id, request_id)
  where request_id is not null;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'billing_payments' and column_name = 'request_id';
--   -- expect one row: request_id | text | YES
--   select indexname, indexdef from pg_indexes where indexname = 'billing_payments_tenant_request';
--   -- expect one row, ending in: WHERE (request_id IS NOT NULL)
