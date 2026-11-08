-- add_products_inventory_2026-11-08.sql
--
-- STATUS: pending. Run by hand in the Supabase SQL editor. Safe to run more than once. Not run by anyone yet: do not trust this line,
-- check with the VERIFY queries at the bottom.
--
-- WHAT. Products and inventory at the till (lib/products.ts):
--   products              her catalog: name, brand, category, selling price, optional cost price, optional SKU or barcode, stock,
--                         low-stock threshold, the home-routine step types it fits. Never deleted: archived_at hides it.
--   product_stock_ledger  append only: every stock move (a till sale, a void putting it back, a delivery, damage, a count) with
--                         its reason and an idempotency key. The stock column is the running result of these rows.
--
-- STOCK IS CHANGED ONLY HERE, by product_stock_move and the three functions built on it. Each move locks the product row, re-checks
-- its key under that lock, changes the stock in one UPDATE and writes its ledger row under a unique key, all in one transaction.
-- A double tap, a retried request, two tills at once or the safety-net sync replaying a receipt can never move stock twice:
--   sale          key 'sale:<receipt id>:<line number>'  (product_stock_apply_receipt reads the receipt's OWN items, not the browser's)
--   void restore  key 'restore:<sale ledger id>', and reverses_id is unique: a void puts each line back once
--   manual        key chosen by the form when it opens, so a retried "save" is the same adjustment
-- Stock MAY go below zero: a real sale is never refused because the count on record is behind (lib/products.ts explains why).
-- All of them are SECURITY DEFINER and executable by the service role only: the app calls them from signed-in, tenant-scoped,
-- plan-checked server routes (app/api/products), never from the browser.
--
-- ACCESS. authenticated: SELECT on her own rows (tenant_id = get_user_tenant_id()), nothing else; every write is a server route with
-- the service role. anon: nothing. The public skin-scan page reads display fields of active products through a rate-limited server
-- route that selects name, brand, price and routine types only (never cost, stock, threshold or SKU).
--
-- BEFORE THIS RUNS the products screen says this file is missing, the till offers no products, the scan page shows none.
-- Nothing else changes.
--
-- Run order: after trial-gate-policies.sql (it uses public.is_tenant_active()) and after add_till_and_calendar_small_things.sql
-- (it reads public.receipt_voids). Independent of add_gift_vouchers_2026-11-08.sql and add_loyalty_2026-11-05.sql.

begin;

create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null default public.get_user_tenant_id(),
  name                 text not null check (length(btrim(name)) between 1 and 80),
  brand                text check (brand is null or length(brand) <= 60),
  category             text check (category is null or length(category) <= 40),
  price                numeric(10,2) not null check (price >= 0 and price <= 100000),
  cost_price           numeric(10,2) check (cost_price is null or (cost_price >= 0 and cost_price <= 100000)),
  sku                  text check (sku is null or length(sku) between 1 and 40),
  stock                integer not null default 0 check (stock between -100000 and 1000000),
  low_stock_threshold  integer not null default 0 check (low_stock_threshold between 0 and 100000),
  routine_types        text[] not null default '{}' check (cardinality(routine_types) <= 12),
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_at           timestamptz not null default now()
);
create index if not exists products_tenant_idx on public.products (tenant_id, archived_at, name);
-- One SKU or barcode per business (case does not matter); empty is allowed for any number of products.
create unique index if not exists products_sku_uniq on public.products (tenant_id, lower(sku)) where sku is not null;

create table if not exists public.product_stock_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  product_id    uuid not null references public.products(id),
  kind          text not null check (kind in ('sale', 'void_restore', 'received', 'damaged', 'count')),
  -- Signed: sale -, void_restore +, received +, damaged -, count = the difference the count made.
  delta         integer not null,
  stock_after   integer not null,
  receipt_id    uuid references public.receipts(id),
  line_no       integer,
  reverses_id   uuid references public.product_stock_ledger(id),
  idem_key      text not null check (length(idem_key) between 8 and 120),
  reason        text check (reason is null or length(reason) <= 200),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  -- A manual move always says why.
  constraint product_stock_ledger_manual_reason check (kind in ('sale', 'void_restore') or length(btrim(coalesce(reason, ''))) > 0)
);
create index if not exists product_stock_ledger_product_idx on public.product_stock_ledger (tenant_id, product_id, created_at desc);
create index if not exists product_stock_ledger_receipt_idx on public.product_stock_ledger (receipt_id) where receipt_id is not null;
-- The same move twice is one row (and one stock change).
create unique index if not exists product_stock_ledger_idem_uniq on public.product_stock_ledger (tenant_id, idem_key);
-- A sale line is put back at most once.
create unique index if not exists product_stock_ledger_reverse_uniq on public.product_stock_ledger (reverses_id) where reverses_id is not null;

-- ── Same business: a ledger row's product and receipt belong to the row's tenant ──────────────────────────────────────────
create or replace function public.product_stock_ledger_same_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.tenant_id = new.tenant_id) then
    raise exception 'product_stock_ledger.product_id must belong to the same business' using errcode = '23514';
  end if;
  if new.receipt_id is not null
     and not exists (select 1 from public.receipts r where r.id = new.receipt_id and r.tenant_id = new.tenant_id) then
    raise exception 'product_stock_ledger.receipt_id must belong to the same business' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists product_stock_ledger_same_tenant on public.product_stock_ledger;
create trigger product_stock_ledger_same_tenant before insert or update on public.product_stock_ledger
  for each row execute function public.product_stock_ledger_same_tenant();

-- A product never moves to another business.
create or replace function public.products_keep_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'products.tenant_id cannot change' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists products_keep_tenant on public.products;
create trigger products_keep_tenant before update on public.products
  for each row execute function public.products_keep_tenant();

-- ── The items of a receipt, whatever shape the column holds (text, json, jsonb, or a jsonb string of JSON) ────────────────
create or replace function public.product_receipt_items(p_receipt uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select to_jsonb(r.items) into v from public.receipts r where r.id = p_receipt;
  if v is null then return '[]'::jsonb; end if;
  if jsonb_typeof(v) = 'string' then
    begin
      v := (v #>> '{}')::jsonb;
    exception when others then
      return '[]'::jsonb;
    end;
  end if;
  if v is null or jsonb_typeof(v) <> 'array' then return '[]'::jsonb; end if;
  return v;
end $$;

-- ── One stock move: atomic, idempotent ────────────────────────────────────
-- p_delta for sale / void_restore / received / damaged; p_set for a count (the number she counted). Returns one row:
-- result ('ok' | 'already' | 'not_found' | 'bad_move'), the ledger row id, the stock after, the delta applied, and whether this
-- move took the product from above her threshold to at or below it (for the one low-stock notification).
-- 'already' = this key was applied before: the first answer, again, never a second move.
create or replace function public.product_stock_move(
  p_tenant uuid, p_product uuid, p_kind text, p_delta integer, p_set integer, p_key text,
  p_reason text default null, p_receipt uuid default null, p_line integer default null, p_reverses uuid default null, p_by uuid default null)
returns table (result text, ledger_id uuid, stock_after integer, delta integer, crossed_low boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_led    uuid;
  v_after  integer;
  v_before integer;
  v_thr    integer;
  v_delta  integer;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 120
     or p_kind is null or p_kind not in ('sale', 'void_restore', 'received', 'damaged', 'count')
     or (p_kind = 'count' and (p_set is null or p_set < 0))
     or (p_kind <> 'count' and (p_delta is null or p_delta = 0 or abs(p_delta) > 100000)) then
    return query select 'bad_move'::text, null::uuid, null::integer, null::integer, false; return;
  end if;
  select l.id, l.stock_after, l.delta into v_led, v_after, v_delta from public.product_stock_ledger l
   where l.tenant_id = p_tenant and l.idem_key = p_key;
  if found then return query select 'already'::text, v_led, v_after, v_delta, false; return; end if;
  begin
    -- The row lock: a second move of the same product waits here until the first one commits.
    select p.stock, p.low_stock_threshold into v_before, v_thr from public.products p
     where p.id = p_product and p.tenant_id = p_tenant for update;
    if not found then return query select 'not_found'::text, null::uuid, null::integer, null::integer, false; return; end if;
    -- Under the lock, the key again: a twin request that committed while this one waited is the same move.
    select l.id, l.stock_after, l.delta into v_led, v_after, v_delta from public.product_stock_ledger l
     where l.tenant_id = p_tenant and l.idem_key = p_key;
    if found then return query select 'already'::text, v_led, v_after, v_delta, false; return; end if;
    v_delta := case when p_kind = 'count' then p_set - v_before else p_delta end;
    update public.products p set stock = p.stock + v_delta, updated_at = now()
     where p.id = p_product and p.tenant_id = p_tenant
     returning p.stock into v_after;
    insert into public.product_stock_ledger (tenant_id, product_id, kind, delta, stock_after, receipt_id, line_no, reverses_id, idem_key, reason, created_by)
    values (p_tenant, p_product, p_kind, v_delta, v_after, p_receipt, p_line, p_reverses, p_key, left(p_reason, 200), p_by)
    returning id into v_led;
  exception when unique_violation then
    -- The same key (or the same reversal) raced in from a second request: this block and its UPDATE are rolled back.
    select l.id, l.stock_after, l.delta into v_led, v_after, v_delta from public.product_stock_ledger l
     where l.tenant_id = p_tenant and (l.idem_key = p_key or (p_reverses is not null and l.reverses_id = p_reverses));
    return query select 'already'::text, v_led, v_after, v_delta, false; return;
  end;
  return query select 'ok'::text, v_led, v_after, v_delta, (v_before > v_thr and v_after <= v_thr);
end $$;

-- ── A till receipt: each product line moves stock once ─────────────────────
-- Reads the receipt's own items (never a list from the browser), locks the receipt row so a void cannot slip between the check
-- and the moves, and skips a receipt that is already voided. One row per product line: its line number, product, result, units,
-- stock after and the low-stock crossing. 'bad_line' = a product line whose id or quantity is not valid (nothing moved for it).
create or replace function public.product_stock_apply_receipt(p_tenant uuid, p_receipt uuid, p_by uuid default null)
returns table (line_no integer, product_id uuid, result text, qty integer, stock_after integer, crossed_low boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_el  jsonb;
  v_i   integer;
  v_pid uuid;
  v_qty integer;
  m     record;
begin
  perform 1 from public.receipts r where r.id = p_receipt and r.tenant_id = p_tenant for update;
  if not found then return query select null::integer, null::uuid, 'not_found'::text, null::integer, null::integer, false; return; end if;
  if exists (select 1 from public.receipt_voids v where v.receipt_id = p_receipt) then
    return query select null::integer, null::uuid, 'voided'::text, null::integer, null::integer, false; return;
  end if;
  for v_el, v_i in select x.e, x.o::integer from jsonb_array_elements(public.product_receipt_items(p_receipt)) with ordinality as x(e, o) loop
    if jsonb_typeof(v_el) <> 'object' or coalesce(v_el->>'kind', '') <> 'product' then continue; end if;
    if coalesce(v_el->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return query select v_i, null::uuid, 'bad_line'::text, null::integer, null::integer, false; continue;
    end if;
    v_pid := (v_el->>'product_id')::uuid;
    v_qty := case when coalesce(v_el->>'qty', '1') ~ '^[0-9]{1,4}$' then coalesce(v_el->>'qty', '1')::integer else 0 end;
    if v_qty < 1 or v_qty > 999 then
      return query select v_i, v_pid, 'bad_line'::text, null::integer, null::integer, false; continue;
    end if;
    select * into m from public.product_stock_move(p_tenant, v_pid, 'sale', -v_qty, null, 'sale:' || p_receipt::text || ':' || v_i::text, null, p_receipt, v_i, null, p_by);
    return query select v_i, v_pid, m.result, v_qty, m.stock_after, m.crossed_low;
  end loop;
end $$;

-- ── A voided receipt: every sale line it moved goes back, once ─────────────
create or replace function public.product_stock_restore_receipt(p_tenant uuid, p_receipt uuid, p_by uuid default null)
returns table (line_no integer, product_id uuid, result text, qty integer, stock_after integer, crossed_low boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  s record;
  m record;
begin
  perform 1 from public.receipts r where r.id = p_receipt and r.tenant_id = p_tenant for update;
  if not found then return query select null::integer, null::uuid, 'not_found'::text, null::integer, null::integer, false; return; end if;
  if not exists (select 1 from public.receipt_voids v where v.receipt_id = p_receipt) then
    return query select null::integer, null::uuid, 'not_voided'::text, null::integer, null::integer, false; return;
  end if;
  for s in select l.id, l.product_id, l.delta, l.line_no from public.product_stock_ledger l
            where l.tenant_id = p_tenant and l.receipt_id = p_receipt and l.kind = 'sale' order by l.line_no loop
    select * into m from public.product_stock_move(p_tenant, s.product_id, 'void_restore', -s.delta, null, 'restore:' || s.id::text, 'התשלום בוטל', p_receipt, s.line_no, s.id, p_by);
    return query select s.line_no, s.product_id, m.result, -s.delta, m.stock_after, false;
  end loop;
end $$;

-- ── The safety net: a receipt whose follow-up call never arrived (a dropped connection) is applied, a voided one restored ──
-- Idempotent through the same keys, so running it any number of times moves nothing twice. Bounded: the last p_days (1 to 60)
-- days, at most 200 receipts each way per call.
create or replace function public.product_stock_sync(p_tenant uuid, p_days integer default 14)
returns table (applied integer, restored integer)
language plpgsql security definer set search_path = public as $$
declare
  r   record;
  v_a integer := 0;
  v_r integer := 0;
  n   integer;
begin
  for r in select x.id from public.receipts x
            where x.tenant_id = p_tenant
              and x.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60))
              and to_jsonb(x.items)::text like '%product%'
              and not exists (select 1 from public.receipt_voids v where v.receipt_id = x.id)
              and not exists (select 1 from public.product_stock_ledger l where l.receipt_id = x.id and l.kind = 'sale')
            order by x.created_at limit 200 loop
    select count(*) into n from public.product_stock_apply_receipt(p_tenant, r.id, null) a where a.result = 'ok';
    v_a := v_a + n;
  end loop;
  for r in select distinct l.receipt_id as id from public.product_stock_ledger l
            where l.tenant_id = p_tenant and l.kind = 'sale'
              and exists (select 1 from public.receipt_voids v where v.receipt_id = l.receipt_id)
              and not exists (select 1 from public.product_stock_ledger z where z.reverses_id = l.id)
            limit 200 loop
    select count(*) into n from public.product_stock_restore_receipt(p_tenant, r.id, null) a where a.result = 'ok';
    v_r := v_r + n;
  end loop;
  return query select v_a, v_r;
end $$;

revoke all on function public.product_receipt_items(uuid) from public, anon, authenticated;
revoke all on function public.product_stock_move(uuid, uuid, text, integer, integer, text, text, uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.product_stock_apply_receipt(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.product_stock_restore_receipt(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.product_stock_sync(uuid, integer) from public, anon, authenticated;
grant execute on function public.product_stock_move(uuid, uuid, text, integer, integer, text, text, uuid, integer, uuid, uuid) to service_role;
grant execute on function public.product_stock_apply_receipt(uuid, uuid, uuid) to service_role;
grant execute on function public.product_stock_restore_receipt(uuid, uuid, uuid) to service_role;
grant execute on function public.product_stock_sync(uuid, integer) to service_role;

-- ── Row level security: tenant scoped, read only for her session ──────────────────────────────────────────────────────────
alter table public.products enable row level security;
alter table public.product_stock_ledger enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products', 'product_stock_ledger'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_select_own') then
      execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    end if;
  end loop;
end $$;

-- No insert/update/delete grant for authenticated: a browser that could update products could write itself any stock number.
-- Every write is a server route (service role) that checked her session, her tenant and her plan first.
revoke all on public.products from anon, authenticated;
revoke all on public.product_stock_ledger from anon, authenticated;
grant select on public.products to authenticated;
grant select on public.product_stock_ledger to authenticated;

-- ── The trial gate (trial-gate-policies.sql): same restrictive policies, same names, same loop ────────────────────────────
-- (No write grant exists for authenticated today; the gate is here so a future grant cannot open writes to a closed business.)
do $$
declare
  t text;
  targets text[] := array['products', 'product_stock_ledger'];
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
--   select relname, relrowsecurity from pg_class where relname in ('products', 'product_stock_ledger');   -- 2 rows, both true
-- (b) Policies: 1 own select + 4 gate policies per table, nothing for anon:
--   select tablename, policyname, cmd, roles from pg_policies where tablename in ('products', 'product_stock_ledger') order by 1, 2;   -- 10 rows
-- (c) Grants: SELECT only for authenticated, nothing for anon:
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('products', 'product_stock_ledger') and grantee in ('anon', 'authenticated') order by 1, 2, 3;   -- 2 rows, SELECT
-- (d) The stock functions run for the service role only:
--   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_can, has_function_privilege('anon', p.oid, 'execute') as anon_can
--     from pg_proc p where p.proname in ('product_receipt_items', 'product_stock_move', 'product_stock_apply_receipt', 'product_stock_restore_receipt', 'product_stock_sync');   -- 5 rows, all false / false
-- (e) A move is applied once. In a transaction you roll back (any tenant of yours):
--   begin;
--   insert into public.products (tenant_id, name, price, stock) select t.id, 'בדיקה', 100, 5 from public.tenants t limit 1;
--   select * from public.product_stock_move((select tenant_id from public.products where name = 'בדיקה'), (select id from public.products where name = 'בדיקה'), 'received', 3, null, 'verify-key-1', 'בדיקה');   -- ok, stock_after 8
--   select * from public.product_stock_move((select tenant_id from public.products where name = 'בדיקה'), (select id from public.products where name = 'בדיקה'), 'received', 3, null, 'verify-key-1', 'בדיקה');   -- already, stock_after 8
--   select stock from public.products where name = 'בדיקה';   -- 8
--   rollback;
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   drop function if exists public.product_stock_sync(uuid, integer);
--   drop function if exists public.product_stock_restore_receipt(uuid, uuid, uuid);
--   drop function if exists public.product_stock_apply_receipt(uuid, uuid, uuid);
--   drop function if exists public.product_stock_move(uuid, uuid, text, integer, integer, text, text, uuid, integer, uuid, uuid);
--   drop function if exists public.product_receipt_items(uuid);
--   drop table if exists public.product_stock_ledger;
--   drop table if exists public.products;
--   drop function if exists public.product_stock_ledger_same_tenant();
--   drop function if exists public.products_keep_tenant();
