-- add_grow_wallet.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Run it AFTER add_grow_payments.sql. Safe to run more than once.
-- The code works before it runs; what it loses until then is only the word "הוחזר" on a refunded payment.
--
-- WHAT
--   The wallet checkout (card, Bit, Apple Pay, Google Pay on one page /pay/<token>) needs no new table:
--   its payment link is the existing grow_payments row (notify_token), and the refund of a cashier payment is the same row.
--   Two schema changes. (1) a payment can now end as 'refunded'. (2) grow_payments.transaction_token: the token Grow's callback sends with
--   the transaction id, which a refund needs. It is server-only: the browser's column-level SELECT grant (add_grow_payments.sql) does not
--   list it, so nothing new is readable from a browser.
--   grow_payments already has tenant-scoped RLS and the trial gate
--   (add_grow_payments.sql, add_grow_trial_gate.sql); changing a CHECK does not touch either.

alter table public.grow_payments add column if not exists transaction_token text;

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.grow_payments'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%' and pg_get_constraintdef(oid) like '%created%' and pg_get_constraintdef(oid) like '%paid%';
  if c is not null then execute format('alter table public.grow_payments drop constraint %I', c); end if;
  alter table public.grow_payments drop constraint if exists grow_payments_status_check;
  alter table public.grow_payments add constraint grow_payments_status_check check (status in ('created', 'paid', 'failed', 'cancelled', 'refunded'));
end $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1. the new list of statuses (expect created, paid, failed, cancelled, refunded):
--   select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.grow_payments'::regclass and conname = 'grow_payments_status_check';
-- 1b. the new column, and that the browser cannot read it (expect one row, then zero rows):
--   select column_name from information_schema.columns where table_name = 'grow_payments' and column_name = 'transaction_token';
--   select grantee from information_schema.column_privileges where table_name = 'grow_payments' and column_name = 'transaction_token' and grantee in ('anon', 'authenticated');
-- 2. the gate is still there (expect 3 restrictive policies named *_require_active_*):
--   select policyname from pg_policies where tablename = 'grow_payments' and policyname like '%_require_active_%';
