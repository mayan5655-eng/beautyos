-- add_owner_welcome.sql
--
-- The once-only marker for the welcome WhatsApp a new business owner gets after onboarding (lib/ownerWelcome.ts).
-- One row per business, inserted BEFORE anything is sent: tenant_id is the primary key and phone_hash is unique, so a
-- second save, a retry, a race or a second account on the same number can never send it twice.
-- No phone number is stored: a hash (to stop the same number twice) and the last 4 digits (for the admin).
--
-- Safe to run any time: nothing sends until OWNER_WELCOME_WA is set in Vercel (default off). Idempotent.

create table if not exists public.owner_welcome_messages (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  phone_hash       text not null unique,
  phone_last4      text,
  phone_source     text not null check (phone_source in ('verified', 'onboarding')),
  mode             text not null check (mode in ('mock', 'live')),
  status           text not null check (status in ('claimed', 'mock', 'accepted', 'refused', 'failed')),
  wa_message_id    text,
  message_preview  text,
  error_detail     text
);

alter table public.owner_welcome_messages enable row level security;
revoke all on public.owner_welcome_messages from anon, authenticated;   -- only the server (service role) reads and writes it

-- wa_cloud_messages (add_wa_cloud.sql) takes the welcome's cost row as message_type 'owner_welcome'; no change needed there.

-- ── Verify (run after) ──────────────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns where table_name = 'owner_welcome_messages' order by ordinal_position;
--   expect 11 rows
-- select relrowsecurity from pg_class where relname = 'owner_welcome_messages';   -- expect true
-- select count(*) from public.owner_welcome_messages;                            -- expect 0
