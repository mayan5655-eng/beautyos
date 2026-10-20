-- Saved cards (Grow tokens): the consent a client gives, an encrypted token bound to one business and one client, and a ledger of every token charge.
-- RUN BY HAND in the Supabase SQL editor, after add_grow_cancellation.sql. Safe to run twice. Nothing here deletes anything.
--
--   1. grow_card_tokens    gets token_encrypted (the token is stored AES-256-GCM encrypted by the app, like the other secrets).
--   2. grow_card_consents  the required tick on the booking page: the exact text she agreed to, when, for which client and booking, and the Grow
--                          process that followed. One row per booking.
--   3. grow_token_charges  every charge of a saved card. The row is written BEFORE Grow is called, with the numeric transactionUniqueIdentifier
--                          that goes to Grow; that identifier is unique across all rows and is never reused, not even after a failed charge.
--
-- Row level security: a business reads only its own rows; nothing is written from the browser; token_ref and Grow's process token are never granted.
-- Trial gate: the same restrictive write block (public.is_tenant_active()) as the other Grow tables.

-- 1 ─────────────────────────────────────────────────────────────────────────
alter table public.grow_card_tokens add column if not exists token_encrypted boolean not null default false;

-- 2 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.grow_card_consents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appointment_id  text not null,
  client_id       text,
  consent_text    text not null,
  consent_version text not null,
  consented_at    timestamptz not null default now(),
  mode            text not null default 'save_only' check (mode in ('save_only', 'charge_and_save')),
  process_id      text,
  process_token   text,
  status          text not null default 'awaiting' check (status in ('awaiting', 'saved', 'failed')),
  token_id        uuid,
  created_at      timestamptz not null default now(),
  unique (tenant_id, appointment_id)
);
create index if not exists grow_card_consents_process_idx on public.grow_card_consents (process_id);

-- 3 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.grow_token_charges (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  client_id          text not null,
  appointment_id     text not null,
  token_id           uuid not null,
  unique_identifier  bigint not null,
  group_identifier   bigint,
  amount             numeric(10, 2) not null check (amount > 0),
  purpose            text not null default 'fee',
  fee_item_id        text,
  status             text not null default 'initiated' check (status in ('initiated', 'succeeded', 'failed', 'unknown')),
  grow_error_id      integer,
  error              text,
  transaction_id     text,
  transaction_token  text,
  asmachta           text,
  looked_up          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Unique across all businesses: in the Grow sandbox they share one business, and a number is never offered twice.
create unique index if not exists grow_token_charges_unique_identifier_uniq on public.grow_token_charges (unique_identifier);
create index if not exists grow_token_charges_appt_idx on public.grow_token_charges (tenant_id, appointment_id);

-- row level security: reads of her own rows only; no browser writes ─────────
do $$
declare
  t text;
begin
  foreach t in array array['grow_card_consents', 'grow_token_charges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Column grants: the token and Grow's process token are never readable from the browser.
grant select (id, tenant_id, appointment_id, client_id, consent_text, consent_version, consented_at, mode, status, created_at) on public.grow_card_consents to authenticated;
grant select (id, tenant_id, client_id, appointment_id, amount, purpose, status, grow_error_id, asmachta, created_at, updated_at) on public.grow_token_charges to authenticated;
grant select (id, tenant_id, client_id, appointment_id, card_last4, card_brand, created_at, revoked_at) on public.grow_card_tokens to authenticated;

-- trial gate ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['grow_card_consents', 'grow_token_charges'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_active())', t || '_require_active_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active())', t || '_require_active_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_active())', t || '_require_active_delete', t);
    raise notice 'gated %', t;
  end loop;
end $$;

-- ── VERIFY (read-only; run after the block above) ───────────────────────────
-- 1) the new columns and tables exist:
--      select (select count(*) from information_schema.columns where table_name = 'grow_card_tokens' and column_name = 'token_encrypted') as token_column_1,
--             to_regclass('public.grow_card_consents') is not null as consents_table,
--             to_regclass('public.grow_token_charges') is not null as charges_table;
-- 2) row level security is on, and the browser cannot read the token or Grow's process token:
--      select relname, relrowsecurity from pg_class where relname in ('grow_card_consents', 'grow_token_charges');
--      select has_column_privilege('authenticated', 'public.grow_card_tokens', 'token_ref', 'select') as token_readable,          -- false
--             has_column_privilege('authenticated', 'public.grow_card_consents', 'process_token', 'select') as process_token_readable;  -- false
-- 3) the trial gate is on both tables:
--      select tablename, policyname from pg_policies where tablename in ('grow_card_consents', 'grow_token_charges') and policyname like '%require_active%' order by 1, 2;   -- 6 rows
-- 4) the identifier can never repeat:
--      select indexname from pg_indexes where indexname = 'grow_token_charges_unique_identifier_uniq';
