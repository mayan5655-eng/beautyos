-- slot-offers.sql
-- Automatic gap-filling: when a slot frees up, offer it to multiple clients at
-- once via a WhatsApp claim link. First valid click wins.
-- Run in the Supabase SQL Editor.

-- ============================================================================
-- 1) slot_offers table  (one row per recipient; each gets its own token)
-- ============================================================================
create table if not exists public.slot_offers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default get_user_tenant_id(),

  -- The freed slot. Kept self-contained (date/hour/service/duration) so it works
  -- whether the source appointment was soft-cancelled OR hard-deleted.
  appointment_id uuid references public.appointments(id) on delete set null,
  slot_date      text not null,          -- matches appointments.date "YYYY-MM-DD"
  slot_hour      int  not null,
  service        text,
  duration       int,

  -- The recipient this token was sent to.
  client_id      uuid references public.clients(id) on delete set null,
  client_name    text,
  phone          text,

  -- Unguessable claim token (the /claim/[token] URL). App generates it; the
  -- default is a safe fallback.
  token          text not null unique default encode(gen_random_bytes(16), 'hex'),

  status         text not null default 'sent'
                 check (status in ('sent','claimed','expired','superseded','cancelled')),

  sent_at        timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '2 hours'),
  claimed_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- ============================================================================
-- 2) Indexes  (including the atomic "first valid click wins" guarantee)
-- ============================================================================

-- Race-safety backbone: at most ONE claimed offer per (tenant, date, hour).
-- Two different tokens for the same slot can both pass the claim UPDATE's WHERE,
-- but only one can COMMIT status='claimed' -- the second hits this unique index
-- and errors, which the claim route treats as "התור נתפס" (slot taken).
create unique index if not exists uniq_slot_offer_claimed
  on public.slot_offers (tenant_id, slot_date, slot_hour)
  where status = 'claimed';

-- Lookups: sibling rows for a slot, and expiry sweeps.
create index if not exists idx_slot_offers_slot
  on public.slot_offers (tenant_id, slot_date, slot_hour);
create index if not exists idx_slot_offers_status_expires
  on public.slot_offers (status, expires_at);

-- ============================================================================
-- 3) Row Level Security
--    Tenant-scoped for the app. The public /claim/[token] route reads/writes
--    with the service-role key (keyed only by the secret token), so no
--    anonymous policy is defined on purpose.
-- ============================================================================
alter table public.slot_offers enable row level security;

create policy "slot_offers tenant read" on public.slot_offers
  for select to authenticated using (tenant_id = get_user_tenant_id());

create policy "slot_offers tenant insert" on public.slot_offers
  for insert to authenticated with check (tenant_id = get_user_tenant_id());

create policy "slot_offers tenant update" on public.slot_offers
  for update to authenticated using (tenant_id = get_user_tenant_id());

create policy "slot_offers tenant delete" on public.slot_offers
  for delete to authenticated using (tenant_id = get_user_tenant_id());

-- ============================================================================
-- 4) (Recommended, optional) Anti-double-book guard on appointments.
--    Ensures a claimed slot can never collide with a manual/online booking.
--    Run only if a tenant is never meant to have two ACTIVE appointments in the
--    same hour (true for a single-chair solo practice).
-- ============================================================================
create unique index if not exists uniq_appt_slot_active
  on public.appointments (tenant_id, date, hour)
  where confirmation_status <> 'cancelled';
