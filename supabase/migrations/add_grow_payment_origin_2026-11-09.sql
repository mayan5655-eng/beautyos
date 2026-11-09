-- add_grow_payment_origin_2026-11-09.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Run it AFTER add_grow_payments.sql. Safe to run more than once.
-- The code works before it runs: the payment is created without the column (lib/grow/repo.ts drops only that column on a
-- missing-column error), and the Grow lists infer the origin from kind and description (lib/grow/paymentOrigin.ts).
--
-- WHAT
--   grow_payments.origin: which page opened the payment. One of
--     booking_deposit, owner_deposit, booking_visit, gift_voucher, till, client_link, cancel_fee
--   Written once, by the server, when the payment is created. Deliberately NO check constraint: a new origin added to the code
--   before a new constraint is run must never make a payment fail to open. The code only ever writes the values above.
--   The browser may read it, like kind (the column-level SELECT grant of add_grow_payments.sql / add_grow_cancellation.sql).
--   Tenant-scoped RLS and the trial gate on grow_payments are untouched.

alter table public.grow_payments add column if not exists origin text;

comment on column public.grow_payments.origin is 'Which page opened this Grow payment: booking_deposit, owner_deposit, booking_visit, gift_voucher, till, client_link, cancel_fee. Null for payments made before 2026-11-09.';

grant select (origin) on public.grow_payments to authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1. the column exists (expect one row: origin, text):
--   select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'grow_payments' and column_name = 'origin';
-- 2. new payments carry it (after the next Grow payment is opened; expect a value, not null):
--   select origin, kind, created_at from public.grow_payments order by created_at desc limit 5;
-- 3. the gate is still there (expect 3 restrictive policies named *_require_active_*):
--   select policyname from pg_policies where tablename = 'grow_payments' and policyname like '%_require_active_%';
