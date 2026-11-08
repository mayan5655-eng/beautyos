-- add_loyalty_2026-11-05.sql
--
-- STATUS: pending. Run by hand in the Supabase SQL editor. Safe to run more than once. Not run by anyone yet: do not trust this line,
-- check with the VERIFY queries at the bottom.
--
-- WHAT. The loyalty stamp card (כרטיסיית נאמנות, lib/loyalty.js). Stamps are NOT stored: they are derived from receipts every time, so
-- nothing here holds a counter. Two append-only ledgers hold what a receipt cannot say:
--   loyalty_redemptions  a reward she gave a client (at the till, or by hand from the client card)
--   loyalty_adjustments  a manual +1 / -1 correction to a client's card, with the reason
-- and one column on grow_payments:
--   loyalty_redemption   the reward she applied at the till to a visit paid by a Grow link ({client_id, reward, stamps_used}). The
--                        server consumes it when Grow says the link was paid (lib/grow/service.ts): a 🎁 mark on the receipt and a
--                        loyalty_redemptions row, however late the client pays and whether or not her browser is still open.
--
-- BEFORE THIS RUNS the card already works: progress is counted from receipts, and a reward given at the till is marked on the receipt
-- itself. What waits for this file: the +1 / -1 correction, a reward given outside the till, and the record of a reward paid by card
-- through Grow. The app says so in those three places instead of failing.
--
-- APPEND ONLY, like package_entries and receipt_voids: select and insert policies, no update, no delete. A wrong correction is fixed by
-- writing the opposite one, so the history stays whole.
--
-- Run order: after trial-gate-policies.sql (it uses public.is_tenant_active()), after add_till_and_calendar_small_things.sql, and after
-- add_grow_payments.sql (it adds a column to grow_payments).

begin;

create table if not exists public.loyalty_redemptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_user_tenant_id(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  receipt_id  uuid references public.receipts(id) on delete set null,
  reward      text not null default '',
  every       int  not null default 10 check (every between 1 and 100),
  -- The stamps this redemption took WHEN it was given (her "every" setting at that moment). lib/loyalty.js counts with this, so a
  -- later change of the setting never rewrites past rewards. Null only for a legacy row: it is read with the current setting.
  stamps_used int  check (stamps_used between 1 and 100),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
-- For a table created by an earlier draft of this file (none is known to exist): the same column, added once.
alter table public.loyalty_redemptions add column if not exists stamps_used int check (stamps_used between 1 and 100);
create index if not exists loyalty_redemptions_tenant_client_idx on public.loyalty_redemptions (tenant_id, client_id, created_at);
-- One redemption per receipt: two taps (or the till and the Grow callback both recording it) are one reward.
create unique index if not exists loyalty_redemptions_one_per_receipt on public.loyalty_redemptions (receipt_id) where receipt_id is not null;

create table if not exists public.loyalty_adjustments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_user_tenant_id(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  delta       int  not null check (delta in (-1, 1)),
  reason      text not null check (length(btrim(reason)) > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index if not exists loyalty_adjustments_tenant_client_idx on public.loyalty_adjustments (tenant_id, client_id, created_at);

-- The reward intent of a Grow card charge, written by the charge route (service role) and read back by the paid callback. Nullable:
-- every other payment has none. No policy change: grow_payments is written by the server only.
alter table public.grow_payments add column if not exists loyalty_redemption jsonb;
comment on column public.grow_payments.loyalty_redemption is 'Loyalty reward applied at the till to this charge: {client_id, reward, stamps_used}. Consumed server-side when paid.';

-- The client (and, for a redemption, the receipt) must belong to the same business as the row (the same guard receipts got on
-- 2026-11-02): RLS checks only tenant_id.
-- ONE FUNCTION PER TABLE, on purpose. plpgsql resolves new.<field> when it plans the expression, so a shared function that mentions
-- new.receipt_id fails on every loyalty_adjustments insert ("record new has no field receipt_id"), even behind a tg_table_name test
-- in the same condition. The adjustments function never names receipt_id.
create or replace function public.loyalty_client_same_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.tenant_id = new.tenant_id) then
    raise exception 'loyalty rows must name a client of the same business' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.loyalty_redemption_same_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.tenant_id = new.tenant_id) then
    raise exception 'loyalty rows must name a client of the same business' using errcode = '23514';
  end if;
  if new.receipt_id is not null
     and not exists (select 1 from public.receipts r where r.id = new.receipt_id and r.tenant_id = new.tenant_id) then
    raise exception 'loyalty_redemptions.receipt_id must belong to the same business' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists loyalty_redemptions_same_tenant on public.loyalty_redemptions;
create trigger loyalty_redemptions_same_tenant before insert or update on public.loyalty_redemptions
  for each row execute function public.loyalty_redemption_same_tenant();
drop trigger if exists loyalty_adjustments_same_tenant on public.loyalty_adjustments;
create trigger loyalty_adjustments_same_tenant before insert or update on public.loyalty_adjustments
  for each row execute function public.loyalty_client_same_tenant();

-- ── Row level security: tenant scoped, the same shape as receipt_voids / package_entries ──────────────────────────────────
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_adjustments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['loyalty_redemptions', 'loyalty_adjustments'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_select_own') then
      execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_insert_own') then
      execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = public.get_user_tenant_id())', t || '_insert_own', t);
    end if;
  end loop;
end $$;

revoke all on public.loyalty_redemptions from anon, authenticated;
revoke all on public.loyalty_adjustments from anon, authenticated;
grant select, insert on public.loyalty_redemptions to authenticated;
grant select, insert on public.loyalty_adjustments to authenticated;

-- ── The trial gate (trial-gate-policies.sql): same restrictive policies, same names, same loop ────────────────────────────
do $$
declare
  t text;
  targets text[] := array['loyalty_redemptions', 'loyalty_adjustments'];
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
    raise notice 'gated %', t;
  end loop;
end $$;

commit;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- (a) Both tables exist with RLS on:
--   select relname, relrowsecurity from pg_class where relname in ('loyalty_redemptions', 'loyalty_adjustments');   -- 2 rows, both true
-- (b) The policies: 2 own policies + 3 gate policies per table, nothing for anon, no update/delete own policy:
--   select tablename, policyname, cmd, roles from pg_policies where tablename in ('loyalty_redemptions', 'loyalty_adjustments') order by 1, 2;   -- 10 rows
-- (c) Grants: exactly SELECT and INSERT for authenticated, nothing for anon:
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('loyalty_redemptions', 'loyalty_adjustments') and grantee in ('anon', 'authenticated') order by 1, 2, 3;   -- 4 rows
-- (d) The same-business guard refuses a client of another business. In a transaction you roll back:
--   begin;
--   insert into public.loyalty_adjustments (tenant_id, client_id, delta, reason)
--     select t.id, (select c.id from public.clients c where c.tenant_id <> t.id limit 1), 1, 'בדיקה' from public.tenants t limit 1;   -- expect 23514
--   rollback;
-- (e) A correction for a client of her own business goes in (the trigger must not touch receipt_id). In a transaction you roll back:
--   begin;
--   insert into public.loyalty_adjustments (tenant_id, client_id, delta, reason)
--     select c.tenant_id, c.id, 1, 'בדיקה' from public.clients c limit 1;   -- expect INSERT 0 1, no error
--   rollback;
-- (f) The stamps_used column is there:
--   select column_name from information_schema.columns where table_name = 'loyalty_redemptions' and column_name = 'stamps_used';   -- 1 row
-- (g) The reward intent column on grow_payments is there:
--   select column_name, data_type from information_schema.columns where table_name = 'grow_payments' and column_name = 'loyalty_redemption';   -- 1 row, jsonb
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   alter table public.grow_payments drop column if exists loyalty_redemption;
--   drop table if exists public.loyalty_adjustments;
--   drop table if exists public.loyalty_redemptions;
--   drop function if exists public.loyalty_client_same_tenant();
--   drop function if exists public.loyalty_redemption_same_tenant();
