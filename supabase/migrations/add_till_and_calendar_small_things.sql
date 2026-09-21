-- add_till_and_calendar_small_things.sql
--
-- STATUS: NOT APPLIED. Run `npm run migrations:status` to verify; where this
-- header and the script disagree, the script is right.
--
-- Safe to run more than once. Safe to run BEFORE or AFTER the deploy that
-- uses it: every new column is nullable or defaulted, and the code degrades
-- when a column or table is missing (a receipt is still written without its
-- split or tip and she is told; a void reports that the migration has not
-- run; a no-show reports the same).
--
-- ── 1. The till ────────────────────────────────────────────────────────────
--
-- payments      a split payment: [{"method":"ביט","amount":120},
--               {"method":"מזומן","amount":80}] summing to amount. Null for a
--               receipt paid one way; payment_method then says how, as always.
--               For a split, payment_method is the literal 'מפוצל'.
-- tip           a gratuity, never part of amount. Revenue, the tax tab and the
--               per-service figures keep reading amount alone.
-- discount_pct  the percentage she typed, when the discount was a percentage.
--               `discount` still holds the shekel figure either way, so every
--               existing reader is unchanged.
alter table public.receipts add column if not exists payments     jsonb;
alter table public.receipts add column if not exists tip          numeric not null default 0 check (tip >= 0);
alter table public.receipts add column if not exists discount_pct numeric check (discount_pct is null or (discount_pct >= 0 and discount_pct <= 100));

-- ── 2. Voiding a receipt ───────────────────────────────────────────────────
--
-- A cancelling RECORD, not an edit and not a delete. The receipt row is never
-- altered: this table names it, says why, and says when. Every total in the
-- product reads receipts through lib/till.ts liveReceipts(), which drops any
-- receipt named here; the list still shows the original with a "מבוטלת" badge.
--
-- APPEND ONLY. No update policy, no delete policy, and both privileges revoked
-- - a void is as permanent as the receipt it voids. A void made in error is a
-- new receipt, which is what the accountant will most likely say anyway; until
-- the accountant has said, this shape loses nothing.
create table if not exists public.receipt_voids (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  receipt_id  uuid not null unique references public.receipts(id) on delete restrict,
  reason      text not null check (length(btrim(reason)) > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index if not exists receipt_voids_tenant_idx on public.receipt_voids (tenant_id, created_at desc);
alter table public.receipt_voids enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='receipt_voids' and policyname='receipt_voids_select_own') then
    create policy receipt_voids_select_own on public.receipt_voids
      for select to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='receipt_voids' and policyname='receipt_voids_insert_own') then
    create policy receipt_voids_insert_own on public.receipt_voids
      for insert to authenticated with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;
revoke all on public.receipt_voids from anon, authenticated;
grant select, insert on public.receipt_voids to authenticated;

-- ── 3. The calendar ────────────────────────────────────────────────────────
--
-- cancelled_at / cancelled_by: the audit pair from pending/appointment-cancel-
-- audit.sql, added here idempotently because a LATE cancellation can only be
-- told from an on-time one by when it happened. The app already writes them
-- when they exist and retries without them when they do not.
alter table public.appointments add column if not exists cancelled_at timestamptz;
alter table public.appointments add column if not exists cancelled_by text;

-- no_show joins confirmation_status. If a CHECK constraint on that column
-- exists it lists the old three values and would refuse the fourth; it is
-- found by its definition rather than by a name nobody wrote down, dropped,
-- and replaced with one that allows all four (and null, which the column has
-- always accepted). If no such constraint exists, only the new one is added.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.appointments'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%confirmation_status%'
  loop
    execute format('alter table public.appointments drop constraint %I', c.conname);
    raise notice 'dropped %', c.conname;
  end loop;
  alter table public.appointments
    add constraint appointments_confirmation_status_check
    check (confirmation_status is null or confirmation_status in ('pending','confirmed','cancelled','no_show'));
end $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- (a) The three receipt columns:
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema='public' and table_name='receipts'
--      and column_name in ('payments','tip','discount_pct');
--   -> three rows
--
-- (b) The voids table, append-only:
--   select privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='receipt_voids' and grantee='authenticated';
--   -> exactly INSERT and SELECT
--
-- (c) The status constraint accepts no_show and refuses junk. In a
--     transaction you roll back:
--   begin;
--   update public.appointments set confirmation_status='no_show' where id=(select id from public.appointments limit 1);
--   update public.appointments set confirmation_status='junk'    where id=(select id from public.appointments limit 1);
--   -- expect the second to fail with 23514
--   rollback;
--
-- (d) A void is permanent:
--   begin;
--   insert into public.receipt_voids (tenant_id, receipt_id, reason)
--     select tenant_id, id, 'בדיקה' from public.receipts limit 1;
--   delete from public.receipt_voids;   -- expect 42501 as authenticated; runs as the editor's superuser, so use (b) as the proof
--   rollback;
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   drop table if exists public.receipt_voids;
--   alter table public.receipts drop column if exists payments, drop column if exists tip, drop column if exists discount_pct;
--   alter table public.appointments drop constraint if exists appointments_confirmation_status_check;
--   (cancelled_at / cancelled_by are shared with the cancel-audit migration; leave them.)
