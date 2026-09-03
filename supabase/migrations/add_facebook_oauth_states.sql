-- add_facebook_oauth_states.sql
--
-- Server-side OAuth state for the Facebook connect flow.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run `npm run migrations:status` to verify; where this header and the script
-- disagree, the script is right.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
--
-- The state used to live only in a sameSite=lax cookie, which does not
-- reliably survive the round-trip to facebook.com in a popup or across
-- browser contexts - the callback then rejects with invalid_state even though
-- the user really did just come from our own /oauth/start. Now /oauth/start
-- writes a row with the service role BEFORE redirecting (failing loudly if it
-- cannot), and the callback accepts either the cookie or a fresh row bound to
-- the same user, then deletes the row so a state cannot be replayed.
--
-- A table with this name may already exist from an older implementation; the
-- adds below bring it to the shape the routes use without touching whatever
-- else it carries.
--
-- RLS is enabled with NO policies on purpose: only the two OAuth routes touch
-- this table, both with the service role, and both authenticate the user
-- themselves first. No client has any business reading states.
--
-- Safe to run more than once.

create table if not exists public.facebook_oauth_states (
  state      text primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now()
);

alter table public.facebook_oauth_states add column if not exists user_id uuid;
alter table public.facebook_oauth_states add column if not exists created_at timestamptz not null default now();

create unique index if not exists facebook_oauth_states_state_key
  on public.facebook_oauth_states (state);

alter table public.facebook_oauth_states enable row level security;

revoke all on public.facebook_oauth_states from anon, authenticated;
