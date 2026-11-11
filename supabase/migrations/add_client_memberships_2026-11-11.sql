-- add_client_memberships_2026-11-11.sql
--
-- STATUS: pending. RUN BY HAND in the Supabase SQL editor, AFTER add_grow_cancellation.sql and add_grow_tokens.sql (it uses
-- grow_card_tokens and grow_token_charges, which those create). Safe to run more than once. Nothing here deletes or rewrites any row.
--
-- Client memberships ("מנויים ללקוחות", lib/memberships.ts), behind NEXT_PUBLIC_CLIENT_MEMBERSHIPS. Until this runs the feature stays
-- hidden even with the flag on: the routes answer "needs a migration" and nothing renders.
--
--   1. membership_plans        what she sells: name, monthly price, treatments per month, rollover, minimum months, covered treatments.
--   2. client_memberships      one client's membership: the plan as it was when she joined (frozen), the exact consent words she
--                              ticked (frozen by a trigger once set), the saved card, the next charge day, the status.
--   3. membership_periods      one row per membership per month: THE idempotency lock. unique (membership_id, period_start), so a month is
--                              charged at most once whatever runs twice. Holds the attempts, the Grow payment and its confirmation row.
--   4. membership_redemptions  a treatment credit used at the till: one per receipt (unique receipt_id) and one per credit number of a
--                              month (unique period_id + seq), so two devices can never use the same credit twice.
--
-- Row level security: a business reads only its own rows; nothing is written from the browser (every write is a server route with the
-- service role, which checks the session's tenant). The client's link id and Grow's process id are never readable from the browser.
-- Trial gate: the same restrictive write block (public.is_tenant_active()) as the other Grow tables.

create extension if not exists pgcrypto with schema extensions;

-- 1 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.membership_plans (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  price       numeric(10, 2) not null check (price >= 1),
  credits     integer not null check (credits between 1 and 31),
  rollover    boolean not null default false,
  min_months  integer not null default 0 check (min_months between 0 and 24),
  services    text[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists membership_plans_tenant_idx on public.membership_plans (tenant_id, active);

-- 2 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.client_memberships (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  client_id        text,            -- null once the client was erased (lib/clientData.ts eraseClientData, and the trigger below)
  client_name      text,
  client_phone     text,
  plan_id          uuid,
  plan             jsonb not null,
  status           text not null default 'awaiting_consent'
                   check (status in ('awaiting_consent', 'awaiting_card', 'active', 'past_due', 'paused', 'attention', 'cancelled')),
  pause_reason     text,
  consent_text     text,
  consent_version  text,
  consented_at     timestamptz,
  token_id         uuid,
  process_id       text,
  link_id          text not null,
  started_on       date,
  anchor_day       integer check (anchor_day is null or anchor_day between 1 and 31),
  next_charge_on   date,
  next_retry_on    date,
  failed_attempts  integer not null default 0,
  cancelled_at     timestamptz,
  cancelled_by     text check (cancelled_by is null or cancelled_by in ('owner', 'client', 'erased')),
  -- The charge lock (lib/memberships.ts chargeMembership): set only by a conditional update that still sees the state the run read;
  -- a stale or concurrent run finds it changed and charges nothing. Cleared when the run is done; stale after an hour.
  charge_lock_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists client_memberships_link_uniq on public.client_memberships (link_id);
create index if not exists client_memberships_tenant_client_idx on public.client_memberships (tenant_id, client_id, status);
create index if not exists client_memberships_process_idx on public.client_memberships (process_id) where process_id is not null;
create index if not exists client_memberships_due_idx on public.client_memberships (status, next_charge_on, next_retry_on);
-- One live membership per client of a business (a cancelled one never blocks a new one).
create unique index if not exists client_memberships_one_live_uniq on public.client_memberships (tenant_id, client_id) where status <> 'cancelled';

-- What she agreed to never changes after she agreed: the consent words, their version and moment, and the plan she joined.
create or replace function public.client_memberships_consent_frozen() returns trigger language plpgsql as $$
begin
  if old.consented_at is not null and (
       new.consent_text is distinct from old.consent_text
    or new.consent_version is distinct from old.consent_version
    or new.consented_at is distinct from old.consented_at
    or new.plan is distinct from old.plan) then
    raise exception 'client_memberships: the consent and the plan are frozen once the client agreed' using errcode = '42501';
  end if;
  if new.plan is distinct from old.plan then
    raise exception 'client_memberships: the plan snapshot never changes' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists client_memberships_consent_frozen on public.client_memberships;
create trigger client_memberships_consent_frozen before update on public.client_memberships
  for each row execute function public.client_memberships_consent_frozen();

-- 3 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.membership_periods (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  membership_id    uuid not null references public.client_memberships(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  amount           numeric(10, 2) not null check (amount > 0),
  credits          integer not null check (credits >= 0),
  status           text not null default 'charging' check (status in ('charging', 'paid', 'failed', 'unknown')),
  attempts         integer not null default 1,
  first_failed_on  date,
  grow_payment_id  uuid,
  receipt_id       text,
  error            text,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (membership_id, period_start)
);
create index if not exists membership_periods_tenant_idx on public.membership_periods (tenant_id, membership_id);
create index if not exists membership_periods_charging_idx on public.membership_periods (status, updated_at) where status = 'charging';

-- 4 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.membership_redemptions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  membership_id  uuid not null references public.client_memberships(id) on delete cascade,
  period_id      uuid not null references public.membership_periods(id) on delete cascade,
  client_id      text,
  seq            integer not null check (seq >= 1),
  -- 'used' by a receipt (receipt_id) or a paid Grow link (grow_payment_id); 'reserved' while a discounted Grow link is payable
  -- (held until reserved_until, then 'released' and free again). A held credit cannot be used twice.
  status         text not null default 'used' check (status in ('reserved', 'used', 'released')),
  receipt_id     text,
  grow_payment_id uuid,
  reserved_until timestamptz,
  service        text,
  created_at     timestamptz not null default now()
);
-- One credit number per month among the rows that hold it (a released hold frees its number).
create unique index if not exists membership_redemptions_period_seq_uniq on public.membership_redemptions (period_id, seq) where status <> 'released';
create unique index if not exists membership_redemptions_receipt_uniq on public.membership_redemptions (receipt_id);
-- One credit per Grow link: the callback, the browser and the daily run all use THIS row, once.
create unique index if not exists membership_redemptions_payment_uniq on public.membership_redemptions (grow_payment_id);
create index if not exists membership_redemptions_reserved_idx on public.membership_redemptions (status, reserved_until) where status = 'reserved';
create index if not exists membership_redemptions_tenant_idx on public.membership_redemptions (tenant_id, membership_id);

-- 5 ─ a client card that is deleted stops her membership ─────────────────────
-- No foreign key (client_id is text, like grow_card_tokens and the other Grow tables), so the deletion is followed here: billing stops,
-- her name, phone and public link go, and the card saved for it is revoked. The erasure route does the same first (lib/clientData.ts);
-- this covers any other way a client row is deleted. Nothing is deleted: the months already paid stay for the books.
create or replace function public.client_memberships_on_client_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.grow_card_tokens t set revoked_at = coalesce(t.revoked_at, now()), client_id = null
    from public.client_memberships m
   where m.tenant_id = old.tenant_id and m.client_id = old.id::text and t.tenant_id = m.tenant_id and t.id = m.token_id;
  update public.membership_redemptions set client_id = null where tenant_id = old.tenant_id and client_id = old.id::text;
  update public.client_memberships
     set status = 'cancelled', cancelled_by = 'erased', cancelled_at = coalesce(cancelled_at, now()), client_id = null,
         client_name = 'לקוחה שנמחקה', client_phone = null, token_id = null, process_id = null, next_retry_on = null,
         charge_lock_at = null, link_id = 'erased-' || gen_random_uuid()::text, updated_at = now()
   where tenant_id = old.tenant_id and client_id = old.id::text;
  return old;
end $$;
drop trigger if exists client_memberships_on_client_delete on public.clients;
create trigger client_memberships_on_client_delete after delete on public.clients
  for each row execute function public.client_memberships_on_client_delete();

-- row level security: reads of her own rows only; no browser writes ─────────
do $$
declare
  t text;
begin
  foreach t in array array['membership_plans', 'client_memberships', 'membership_periods', 'membership_redemptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.get_user_tenant_id())', t || '_select_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
grant select on public.membership_plans to authenticated;
grant select on public.membership_periods to authenticated;
grant select on public.membership_redemptions to authenticated;
-- The client's link id and Grow's process id stay on the server.
grant select (id, tenant_id, client_id, client_name, plan_id, plan, status, pause_reason, consent_text, consent_version, consented_at,
              started_on, anchor_day, next_charge_on, next_retry_on, failed_attempts, cancelled_at, cancelled_by, created_at, updated_at)
  on public.client_memberships to authenticated;

-- trial gate ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['membership_plans', 'client_memberships', 'membership_periods', 'membership_redemptions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_active())', t || '_require_active_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active())', t || '_require_active_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_active())', t || '_require_active_delete', t);
  end loop;
end $$;

-- ── VERIFY (read-only; run after the blocks above) ──────────────────────────
-- 1) the four tables exist (expect four trues):
--      select to_regclass('public.membership_plans') is not null, to_regclass('public.client_memberships') is not null,
--             to_regclass('public.membership_periods') is not null, to_regclass('public.membership_redemptions') is not null;
-- 2) a month can be charged only once, and a credit used only once (expect 4 rows):
--      select indexname from pg_indexes where indexname in ('membership_periods_membership_id_period_start_key',
--        'membership_redemptions_period_seq_uniq', 'membership_redemptions_receipt_uniq', 'client_memberships_one_live_uniq');
-- 3) row level security is on, and the browser cannot read the link id (expect relrowsecurity true x4, then false):
--      select relname, relrowsecurity from pg_class where relname in ('membership_plans', 'client_memberships', 'membership_periods', 'membership_redemptions');
--      select has_column_privilege('authenticated', 'public.client_memberships', 'link_id', 'select');
-- 4) the trial gate (expect 12 rows):
--      select tablename, policyname from pg_policies where tablename in ('membership_plans', 'client_memberships', 'membership_periods', 'membership_redemptions') and policyname like '%require_active%';
-- 5b) a deleted client stops her membership (expect the trigger):
--      select tgname from pg_trigger where tgname = 'client_memberships_on_client_delete';
-- 5) THE FREEZE IS PROVEN only with a row to refuse (an empty table proves nothing). In a transaction that is rolled back:
--      begin;
--        insert into public.client_memberships (tenant_id, client_id, plan, link_id, consent_text, consent_version, consented_at)
--          values ('00000000-0000-0000-0000-000000000001', 'verify', '{"name":"x"}'::jsonb, 'verify-' || gen_random_uuid(), 'words', 'membership-v1', now());   -- the demo tenant, never a real one
--        update public.client_memberships set consent_text = 'other words' where client_id = 'verify';   -- expect ERROR 42501
--      rollback;
