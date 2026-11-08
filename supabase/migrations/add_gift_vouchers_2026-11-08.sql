-- add_gift_vouchers_2026-11-08.sql
--
-- STATUS: pending. Run by hand in the Supabase SQL editor. Safe to run more than once. Not run by anyone yet: do not trust this line,
-- check with the VERIFY queries at the bottom.
--
-- WHAT. Gift vouchers (שוברי מתנה, lib/giftVouchers.ts):
--   gift_vouchers        one row per voucher: its two secrets (code for the till, token for the public page), what it is for, its
--                        balance, expiry and status. Never deleted: a void is a status with who, when and why.
--   gift_voucher_ledger  append only: issue, redeem, reverse, void. Every balance change has a row, with an idempotency key.
--   grow_payments.gift_voucher  the purchase intent of an online sale ({token, amount, names, message, validity}). The voucher is
--                        issued from it by the server only after Grow's verified callback marked the payment paid.
--
-- THE BALANCE IS CHANGED ONLY HERE, by gift_voucher_redeem / gift_voucher_reverse: one conditional UPDATE each (status, expiry and
-- balance tested in the same statement that changes it), and a unique ledger key, so a double tap, two tills at once or a retried
-- request can never spend a voucher twice. Both are SECURITY DEFINER and executable by the service role only: the app calls them from
-- signed-in, tenant-scoped server routes (app/api/vouchers), never from the browser.
--
-- ACCESS. authenticated: SELECT on her own rows (tenant_id = get_user_tenant_id()), nothing else; every write is a server route with
-- the service role. anon: nothing. The public voucher page reads one row by its token through a server route and shows display
-- fields only (lib/giftVouchers.ts publicVoucherView).
--
-- BEFORE THIS RUNS the app hides online sale, and the vouchers screen says this file is missing. Nothing else changes.
--
-- Run order: after trial-gate-policies.sql (it uses public.is_tenant_active()), after add_grow_payments.sql (it adds a column to
-- grow_payments) and after receipts_client_same_tenant_2026-11-02.sql. Independent of add_loyalty_2026-11-05.sql.

begin;

create table if not exists public.gift_vouchers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.get_user_tenant_id(),
  code             text not null check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  token            text not null check (token ~ '^[0-9a-f]{48}$'),
  kind             text not null default 'amount' check (kind in ('amount', 'service')),
  service_name     text check (service_name is null or length(service_name) <= 80),
  initial_amount   numeric(10,2) not null check (initial_amount > 0 and initial_amount <= 5000),
  balance          numeric(10,2) not null check (balance >= 0),
  status           text not null default 'active' check (status in ('active', 'void')),
  expires_at       timestamptz not null,
  buyer_name       text check (buyer_name is null or length(buyer_name) <= 60),
  buyer_phone      text check (buyer_phone is null or length(buyer_phone) <= 20),
  recipient_name   text check (recipient_name is null or length(recipient_name) <= 60),
  message          text check (message is null or length(message) <= 300),
  sold_via         text not null check (sold_via in ('online', 'till')),
  grow_payment_id  uuid references public.grow_payments(id),
  receipt_id       uuid references public.receipts(id),
  sale_key         text check (sale_key is null or length(sale_key) <= 64),
  voided_at        timestamptz,
  voided_by        uuid,
  void_reason      text check (void_reason is null or length(void_reason) <= 200),
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  constraint gift_vouchers_balance_le_initial check (balance <= initial_amount)
);
create unique index if not exists gift_vouchers_token_uniq on public.gift_vouchers (token);
create unique index if not exists gift_vouchers_code_uniq on public.gift_vouchers (tenant_id, code);
-- One voucher per Grow payment: a second (or late, or replayed) callback cannot issue a second one.
create unique index if not exists gift_vouchers_payment_uniq on public.gift_vouchers (grow_payment_id) where grow_payment_id is not null;
-- One voucher per till sale: a double tap on "sell" is the same sale.
create unique index if not exists gift_vouchers_sale_key_uniq on public.gift_vouchers (tenant_id, sale_key) where sale_key is not null;
create index if not exists gift_vouchers_tenant_created_idx on public.gift_vouchers (tenant_id, created_at desc);

create table if not exists public.gift_voucher_ledger (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  voucher_id     uuid not null references public.gift_vouchers(id),
  kind           text not null check (kind in ('issue', 'redeem', 'reverse', 'void')),
  -- Signed: issue +, redeem -, reverse +, void 0.
  amount         numeric(10,2) not null,
  balance_after  numeric(10,2) not null check (balance_after >= 0),
  receipt_id     uuid references public.receipts(id),
  reverses_id    uuid references public.gift_voucher_ledger(id),
  idem_key       text check (idem_key is null or length(idem_key) <= 80),
  note           text check (note is null or length(note) <= 200),
  created_at     timestamptz not null default now(),
  created_by     uuid
);
create index if not exists gift_voucher_ledger_voucher_idx on public.gift_voucher_ledger (voucher_id, created_at);
create index if not exists gift_voucher_ledger_tenant_idx on public.gift_voucher_ledger (tenant_id, created_at);
-- The same request twice is one ledger row (and one balance change).
create unique index if not exists gift_voucher_ledger_idem_uniq on public.gift_voucher_ledger (voucher_id, idem_key) where idem_key is not null;
-- A redemption is reversed at most once.
create unique index if not exists gift_voucher_ledger_reverse_uniq on public.gift_voucher_ledger (reverses_id) where reverses_id is not null;

-- The online purchase intent, written by the public purchase route (service role) and consumed by the paid callback.
alter table public.grow_payments add column if not exists gift_voucher jsonb;
comment on column public.grow_payments.gift_voucher is 'Gift voucher bought online: {token, kind, service_name, amount, buyer_name, recipient_name, message, validity_months}. The voucher is issued server-side when Grow confirms the payment.';
create unique index if not exists grow_payments_gift_voucher_token_uniq on public.grow_payments ((gift_voucher->>'token')) where gift_voucher is not null;

-- ── Same business: a voucher's receipt and payment, and a ledger row's voucher and receipt, belong to the row's tenant ──────────
create or replace function public.gift_vouchers_same_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.receipt_id is not null
     and not exists (select 1 from public.receipts r where r.id = new.receipt_id and r.tenant_id = new.tenant_id) then
    raise exception 'gift_vouchers.receipt_id must belong to the same business' using errcode = '23514';
  end if;
  if new.grow_payment_id is not null
     and not exists (select 1 from public.grow_payments p where p.id = new.grow_payment_id and p.tenant_id = new.tenant_id) then
    raise exception 'gift_vouchers.grow_payment_id must belong to the same business' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.gift_voucher_ledger_same_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.gift_vouchers v where v.id = new.voucher_id and v.tenant_id = new.tenant_id) then
    raise exception 'gift_voucher_ledger.voucher_id must belong to the same business' using errcode = '23514';
  end if;
  if new.receipt_id is not null
     and not exists (select 1 from public.receipts r where r.id = new.receipt_id and r.tenant_id = new.tenant_id) then
    raise exception 'gift_voucher_ledger.receipt_id must belong to the same business' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists gift_vouchers_same_tenant on public.gift_vouchers;
create trigger gift_vouchers_same_tenant before insert or update on public.gift_vouchers
  for each row execute function public.gift_vouchers_same_tenant();
drop trigger if exists gift_voucher_ledger_same_tenant on public.gift_voucher_ledger;
create trigger gift_voucher_ledger_same_tenant before insert or update on public.gift_voucher_ledger
  for each row execute function public.gift_voucher_ledger_same_tenant();

-- ── Redeem: atomic, idempotent ────────────────────────────────────────────
-- Returns one row: result ('ok' | 'already' | 'not_found' | 'void' | 'expired' | 'used' | 'insufficient' | 'bad_amount'),
-- the ledger row id and the balance after. 'already' = this idem_key was redeemed before: the first answer, again.
create or replace function public.gift_voucher_redeem(p_tenant uuid, p_voucher uuid, p_amount numeric, p_key text, p_by uuid default null)
returns table (result text, ledger_id uuid, balance numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_balance numeric;
  v_row     public.gift_vouchers%rowtype;
  v_led     uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 5000 or p_key is null or length(p_key) < 8 then
    return query select 'bad_amount'::text, null::uuid, null::numeric; return;
  end if;
  select l.id, l.balance_after into v_led, v_balance from public.gift_voucher_ledger l
   where l.voucher_id = p_voucher and l.idem_key = p_key and l.tenant_id = p_tenant;
  if found then return query select 'already'::text, v_led, v_balance; return; end if;
  begin
    update public.gift_vouchers g
       set balance = g.balance - round(p_amount, 2), updated_at = now()
     where g.id = p_voucher and g.tenant_id = p_tenant and g.status = 'active' and g.expires_at > now() and g.balance >= round(p_amount, 2)
     returning g.balance into v_balance;
    if not found then
      -- The same key may have been committed by a request this one waited behind: that is the same redemption, not a refusal.
      select l.id, l.balance_after into v_led, v_balance from public.gift_voucher_ledger l
       where l.voucher_id = p_voucher and l.idem_key = p_key and l.tenant_id = p_tenant;
      if found then return query select 'already'::text, v_led, v_balance; return; end if;
      select * into v_row from public.gift_vouchers g where g.id = p_voucher and g.tenant_id = p_tenant;
      if not found then return query select 'not_found'::text, null::uuid, null::numeric; return; end if;
      if v_row.status = 'void' then return query select 'void'::text, null::uuid, v_row.balance; return; end if;
      if v_row.balance <= 0 then return query select 'used'::text, null::uuid, v_row.balance; return; end if;
      if v_row.expires_at <= now() then return query select 'expired'::text, null::uuid, v_row.balance; return; end if;
      return query select 'insufficient'::text, null::uuid, v_row.balance; return;
    end if;
    insert into public.gift_voucher_ledger (tenant_id, voucher_id, kind, amount, balance_after, idem_key, created_by)
    values (p_tenant, p_voucher, 'redeem', -round(p_amount, 2), v_balance, p_key, p_by)
    returning id into v_led;
  exception when unique_violation then
    -- The same key raced in from a second request: this block (and its UPDATE) is rolled back; answer with the first one.
    select l.id, l.balance_after into v_led, v_balance from public.gift_voucher_ledger l
     where l.voucher_id = p_voucher and l.idem_key = p_key and l.tenant_id = p_tenant;
    return query select 'already'::text, v_led, v_balance; return;
  end;
  return query select 'ok'::text, v_led, v_balance;
end $$;

-- ── Reverse a redemption (the sale it was for was not completed): the amount goes back, once ──────────────────────────────
create or replace function public.gift_voucher_reverse(p_tenant uuid, p_ledger uuid, p_by uuid default null, p_note text default null)
returns table (result text, ledger_id uuid, balance numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_red     public.gift_voucher_ledger%rowtype;
  v_balance numeric;
  v_led     uuid;
begin
  select * into v_red from public.gift_voucher_ledger l where l.id = p_ledger and l.tenant_id = p_tenant and l.kind = 'redeem';
  if not found then return query select 'not_found'::text, null::uuid, null::numeric; return; end if;
  -- A redemption that paid a receipt stays spent while that receipt stands. Void the receipt first, then give the amount back.
  if v_red.receipt_id is not null and not exists (select 1 from public.receipt_voids rv where rv.receipt_id = v_red.receipt_id) then
    return query select 'has_receipt'::text, null::uuid, null::numeric; return;
  end if;
  begin
    update public.gift_vouchers g
       set balance = least(g.initial_amount, g.balance - v_red.amount), updated_at = now()
     where g.id = v_red.voucher_id and g.tenant_id = p_tenant
     returning g.balance into v_balance;
    insert into public.gift_voucher_ledger (tenant_id, voucher_id, kind, amount, balance_after, reverses_id, note, created_by)
    values (p_tenant, v_red.voucher_id, 'reverse', -v_red.amount, v_balance, v_red.id, left(p_note, 200), p_by)
    returning id into v_led;
  exception when unique_violation then
    return query select 'already_reversed'::text, null::uuid, null::numeric; return;
  end;
  return query select 'ok'::text, v_led, v_balance;
end $$;

revoke all on function public.gift_voucher_redeem(uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.gift_voucher_reverse(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.gift_voucher_redeem(uuid, uuid, numeric, text, uuid) to service_role;
grant execute on function public.gift_voucher_reverse(uuid, uuid, uuid, text) to service_role;

-- ── Row level security: tenant scoped, read only for her session ──────────────────────────────────────────────────────────
alter table public.gift_vouchers enable row level security;
alter table public.gift_voucher_ledger enable row level security;

do $$
declare t text;
begin
  foreach t in array array['gift_vouchers', 'gift_voucher_ledger'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_select_own') then
      execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    end if;
  end loop;
end $$;

-- No insert/update/delete grant for authenticated: a browser that could insert here could write itself a balance. Every write is
-- a server route (service role) that checked her session, her tenant and her plan first.
revoke all on public.gift_vouchers from anon, authenticated;
revoke all on public.gift_voucher_ledger from anon, authenticated;
grant select on public.gift_vouchers to authenticated;
grant select on public.gift_voucher_ledger to authenticated;

-- ── The trial gate (trial-gate-policies.sql): same restrictive policies, same names, same loop ────────────────────────────
-- (No write grant exists for authenticated today; the gate is here so a future grant cannot open writes to a closed business.)
do $$
declare
  t text;
  targets text[] := array['gift_vouchers', 'gift_voucher_ledger'];
begin
  if to_regprocedure('public.is_tenant_active()') is null then
    raise notice 'SKIPPED the trial gate: public.is_tenant_active() does not exist. Run trial-state.sql and trial-gate-policies.sql first, then this file again.';
    return;
  end if;
  foreach t in array targets loop
    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_active())', t || '_require_active_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active())', t || '_require_active_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_active())', t || '_require_active_delete', t);
    -- The closed-business read block (add_closed_read_block_2026-10-25.sql): the same predicate, the demo businesses exempt.
    execute format('drop policy if exists %I on public.%I', t || '_require_active_select', t);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ('
      '(select public.is_tenant_active()) '
      'or (select public.get_user_tenant_id()) in (''00000000-0000-0000-0000-000000000001''::uuid, ''00000000-0000-0000-0000-000000000002''::uuid))',
      t || '_require_active_select', t);
    raise notice 'gated %', t;
  end loop;
end $$;

commit;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- (a) Both tables exist with RLS on:
--   select relname, relrowsecurity from pg_class where relname in ('gift_vouchers', 'gift_voucher_ledger');   -- 2 rows, both true
-- (b) Policies: 1 own select + 4 gate policies per table, nothing for anon:
--   select tablename, policyname, cmd, roles from pg_policies where tablename in ('gift_vouchers', 'gift_voucher_ledger') order by 1, 2;   -- 10 rows
-- (c) Grants: SELECT only for authenticated, nothing for anon:
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('gift_vouchers', 'gift_voucher_ledger') and grantee in ('anon', 'authenticated') order by 1, 2, 3;   -- 2 rows, SELECT
-- (d) The two functions run for the service role only:
--   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_can, has_function_privilege('anon', p.oid, 'execute') as anon_can
--     from pg_proc p where p.proname in ('gift_voucher_redeem', 'gift_voucher_reverse');   -- 2 rows, both false / false
-- (e) The intent column on grow_payments:
--   select column_name, data_type from information_schema.columns where table_name = 'grow_payments' and column_name = 'gift_voucher';   -- 1 row, jsonb
-- (f) Double redemption is refused. In a transaction you roll back (any tenant of yours with a client-free receipt is fine):
--   begin;
--   insert into public.gift_vouchers (tenant_id, code, token, initial_amount, balance, expires_at, sold_via)
--     select t.id, 'TEST2345', repeat('a', 48), 100, 100, now() + interval '1 day', 'till' from public.tenants t limit 1;
--   select * from public.gift_voucher_redeem((select tenant_id from public.gift_vouchers where code = 'TEST2345'), (select id from public.gift_vouchers where code = 'TEST2345'), 60, 'test-key-1');   -- ok, balance 40
--   select * from public.gift_voucher_redeem((select tenant_id from public.gift_vouchers where code = 'TEST2345'), (select id from public.gift_vouchers where code = 'TEST2345'), 60, 'test-key-1');   -- already, balance 40
--   select * from public.gift_voucher_redeem((select tenant_id from public.gift_vouchers where code = 'TEST2345'), (select id from public.gift_vouchers where code = 'TEST2345'), 60, 'test-key-2');   -- insufficient, 40
--   select * from public.gift_voucher_reverse((select tenant_id from public.gift_vouchers where code = 'TEST2345'), (select id from public.gift_voucher_ledger where idem_key = 'test-key-1'));   -- ok, balance 100
--   select * from public.gift_voucher_reverse((select tenant_id from public.gift_vouchers where code = 'TEST2345'), (select id from public.gift_voucher_ledger where idem_key = 'test-key-1'));   -- already_reversed
--   rollback;
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   drop function if exists public.gift_voucher_redeem(uuid, uuid, numeric, text, uuid);
--   drop function if exists public.gift_voucher_reverse(uuid, uuid, uuid, text);
--   drop index if exists public.grow_payments_gift_voucher_token_uniq;
--   alter table public.grow_payments drop column if exists gift_voucher;
--   drop table if exists public.gift_voucher_ledger;
--   drop table if exists public.gift_vouchers;
--   drop function if exists public.gift_vouchers_same_tenant();
--   drop function if exists public.gift_voucher_ledger_same_tenant();
