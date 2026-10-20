-- add_booking_source.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. The code works before it runs: bookings are
-- made exactly as today, only the source is not stored (the tag is written in a separate best-effort update after the booking).
--
-- WHAT (lib/bookingSource.ts): where a booking came from, so her marketing can be measured in bookings and shekels.
--   appointments.source       the channel of the link it was booked from (?src=): instagram, whatsapp, post, bio, referral...
--   appointments.referred_by  the client whose personal "bring a friend" link it came from (?ref=), checked on the server to be a
--                             client of the same business
--   clients.source / clients.referred_by   the same, on a client card the booking CREATED (first touch); an existing client is never
--                             re-attributed
-- No new table and no new grant: both tables keep their RLS and the trial gate exactly as they are; the booking route writes these
-- columns with the service role, and her app reads them with her existing select.

alter table public.appointments add column if not exists source text;
alter table public.appointments add column if not exists referred_by text;
alter table public.clients add column if not exists source text;
alter table public.clients add column if not exists referred_by text;

do $$
begin
  alter table public.appointments drop constraint if exists appointments_source_shape;
  alter table public.appointments add constraint appointments_source_shape check (source is null or source ~ '^[a-z0-9_-]{1,30}$');
  alter table public.clients drop constraint if exists clients_source_shape;
  alter table public.clients add constraint clients_source_shape check (source is null or source ~ '^[a-z0-9_-]{1,30}$');
end $$;

create index if not exists appointments_tenant_source_idx on public.appointments (tenant_id, source) where source is not null;
create index if not exists clients_tenant_referred_idx on public.clients (tenant_id, referred_by) where referred_by is not null;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1. four columns:
--   select table_name, column_name from information_schema.columns
--    where table_schema = 'public' and column_name in ('source', 'referred_by') and table_name in ('appointments', 'clients') order by 1, 2;
-- 2. after a booking from a tagged link (for example your page with ?src=instagram):
--   select date, service, source, referred_by from public.appointments where source is not null order by created_at desc limit 5;
