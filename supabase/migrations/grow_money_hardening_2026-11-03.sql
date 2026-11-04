-- grow_money_hardening_2026-11-03.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. The code works before and after it runs.
--
-- WHAT (architecture review, 2026-11-03):
--   1. grow_payments.process_id gets an index. Every platform-webhook payment looks a payment up by process_id
--      (lib/grow/repo.ts findByProcessId); without an index that is a full scan that grows with payment history.
--   2. client_credits.grow_payment_id: a credit created from a paid deposit request names the payment it came from, and a
--      payment can create at most one credit. So a failed credit insert can be retried safely, and a check can find a paid
--      deposit request that never became a credit (app/api/grow/_cancel.ts writes it; until this runs it writes without it).
-- No data changes, no grants changed, RLS untouched.

create index if not exists grow_payments_process_id_idx on public.grow_payments (process_id) where process_id is not null;

alter table public.client_credits add column if not exists grow_payment_id uuid;
create unique index if not exists client_credits_grow_payment_uniq on public.client_credits (grow_payment_id) where grow_payment_id is not null;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- select indexname from pg_indexes where indexname in ('grow_payments_process_id_idx', 'client_credits_grow_payment_uniq');  -- expect 2 rows
-- select column_name from information_schema.columns where table_name = 'client_credits' and column_name = 'grow_payment_id'; -- expect 1 row
