-- add_wa_auto_messages.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Only ADDS - drops nothing.
-- RUN AFTER add_wa_cloud.sql (it adds two columns to wa_cloud_messages, which that file creates).
--
-- WHY: the automatic WhatsApp reminders and booking confirmations through Meta's Cloud API (lib/waCloud/auto.ts),
-- behind WA_AUTO_ENABLED (default off). Until this has run, the automatic path refuses to send anything (the hourly run
-- stops and raises an alert, and every message goes the way it always did), so run it BEFORE setting WA_AUTO_ENABLED.
--
--   wa_auto_claims    one row per (mode, kind, appointment), written BEFORE the send. Its primary key is what stops a
--                     second reminder or confirmation for the same appointment, even from two runs at once. A booking
--                     confirmation made at night waits here as 'deferred' until 08:00.
--   wa_auto_optouts   "no more automatic messages" per business and number (a button tap, or a "הסר" / "stop" reply).
--                     The number itself is not stored: the same purpose-salted hash the cost log uses.
--   wa_cloud_messages + appointment_id (a button tap is checked against the number this appointment's message went to)
--                     + origin ('auto' for these messages), and an index for the global daily ceiling.
--
-- Server only: RLS on, nothing granted to the browser roles. Trial gate as for wa_cloud_messages.

-- ── 1. Idempotency claims ───────────────────────────────────────────────────
create table if not exists public.wa_auto_claims (
  idempotency_key  text primary key,                     -- '<live|mock>:<reminder|booking_confirm>:<appointment id>'
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  appointment_id   uuid not null references public.appointments(id) on delete cascade,
  kind             text not null check (kind in ('reminder', 'booking_confirm')),
  mode             text not null check (mode in ('live', 'mock')),
  status           text not null default 'claimed' check (status in ('claimed', 'deferred', 'sent', 'fallback', 'skipped')),
  wa_message_id    text,
  detail           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists wa_auto_claims_tenant_kind on public.wa_auto_claims (tenant_id, kind, mode, created_at desc);
create index if not exists wa_auto_claims_deferred on public.wa_auto_claims (status) where status = 'deferred';

alter table public.wa_auto_claims enable row level security;
revoke all on public.wa_auto_claims from anon, authenticated;

-- ── 2. Opt-outs from automatic messages ─────────────────────────────────────
create table if not exists public.wa_auto_optouts (
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  recipient_hash  text not null,
  source          text not null default 'reply' check (source in ('reply', 'button')),
  created_at      timestamptz not null default now(),
  primary key (tenant_id, recipient_hash)
);

alter table public.wa_auto_optouts enable row level security;
revoke all on public.wa_auto_optouts from anon, authenticated;

-- ── 3. The cost log: which appointment, and which path ──────────────────────
alter table public.wa_cloud_messages add column if not exists appointment_id uuid;
alter table public.wa_cloud_messages add column if not exists origin text;

create index if not exists wa_cloud_messages_appointment on public.wa_cloud_messages (appointment_id, recipient_hash) where appointment_id is not null;
create index if not exists wa_cloud_messages_mode_day on public.wa_cloud_messages (mode, status, created_at desc);

-- ── 4. Trial gate (same restrictive policies and names as trial-gate-policies.sql) ──
do $$
declare
  t text;
  targets text[] := array['wa_auto_claims', 'wa_auto_optouts'];
begin
  foreach t in array targets loop
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

-- ── VERIFY ───────────────────────────────────────────────────────────────────
-- select to_regclass('public.wa_auto_claims'), to_regclass('public.wa_auto_optouts');                        -- expect both names, not null
-- select column_name from information_schema.columns where table_name = 'wa_cloud_messages' and column_name in ('appointment_id', 'origin');   -- expect 2 rows
-- select tablename, policyname from pg_policies where tablename in ('wa_auto_claims', 'wa_auto_optouts') order by 1, 2;   -- expect 6 rows
-- select grantee, table_name from information_schema.role_table_grants where table_name in ('wa_auto_claims', 'wa_auto_optouts') and grantee in ('anon', 'authenticated');   -- expect no rows
