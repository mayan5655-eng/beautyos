-- add_package_offerings_and_entries.sql
--
-- Stage 1 of packages: the catalogue in front of a purchase, and the ledger
-- underneath one.
--
-- ── STATUS: NOT APPLIED ────────────────────────────────────────────────────
-- Run by hand in the Supabase SQL Editor. Update this header when it lands and
-- say what was run and what came back - and read the live object rather than
-- trusting this line, which this repo has had to learn twice.
--
-- Safe to run more than once.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- `packages` held a purchase already assigned to a named client, and counted
-- its consumption in a single integer, used_sessions, incremented by one button
-- in the packages tab. That is the tracking half of a feature with nothing on
-- either side of it:
--
--   * nothing described what was FOR SALE before someone bought it, so a
--     package could not be offered, priced or listed - only assigned
--   * a counter has no history. Tap the button twice and there is no record
--     that it happened, no way to know which visit either tap was for, and no
--     way back except editing the number - which is not a correction, it is a
--     second unverifiable claim
--
-- ── package_offerings: the thing that exists before anyone buys it ─────────
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.package_offerings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  name        text not null default '',
  service     text not null,
  sessions    int  not null check (sessions > 0),
  price       numeric not null default 0 check (price >= 0),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists package_offerings_tenant_active_idx
  on public.package_offerings (tenant_id, active, sort_order);

alter table public.package_offerings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='package_offerings' and policyname='package_offerings_all_own') then
    create policy package_offerings_all_own on public.package_offerings
      for all to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- The public catalogue read belongs with the booking-page work in Stage 3.
-- Deliberately not added here: an RPC granted to anon that nothing calls is
-- surface area bought on credit.

-- ── The purchase gains a lineage and a clock ───────────────────────────────
--
-- offering_id is nullable on purpose. Every package sold before this migration
-- has no offering behind it, and inventing one would be fabricating a catalogue
-- entry that never existed.
--
-- expires_at is added now and used in Stage 4. Null means no expiry, which is
-- the default and the only behaviour today: an expiry that silently voids
-- sessions somebody paid for is a decision that must be made deliberately, once,
-- with her looking at it.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='packages' and column_name='offering_id') then
    alter table public.packages add column offering_id uuid references public.package_offerings(id) on delete set null;
    raise notice 'added packages.offering_id';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='packages' and column_name='expires_at') then
    alter table public.packages add column expires_at timestamptz;
    raise notice 'added packages.expires_at';
  end if;
end $$;

-- ── package_entries: the ledger ────────────────────────────────────────────
--
-- APPEND ONLY. There is no update policy and no delete policy below, and that
-- is the entire design: a session deducted by mistake is corrected by writing
-- +1 with a reason, never by removing the -1 that recorded it. The mistake is
-- part of the history, because a history you can edit answers no question worth
-- asking - which is the same rule the reviews table is built on.
--
-- appointment_id is nullable: she can draw a session for a walk-in that was
-- never booked, and the ledger should record that rather than refuse it.
create table if not exists public.package_entries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  package_id     uuid not null references public.packages(id) on delete cascade,
  appointment_id uuid,
  -- -1 draws a session, +1 gives one back. Nothing else: a ledger that can move
  -- by arbitrary amounts is a counter with extra steps.
  delta          int  not null check (delta in (-1, 1)),
  reason         text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);

create index if not exists package_entries_package_idx
  on public.package_entries (package_id, created_at);
create index if not exists package_entries_tenant_idx
  on public.package_entries (tenant_id, created_at desc);

-- One draw per appointment per package. Two taps on the same visit is the
-- mistake this feature is most likely to make, and the database refusing it is
-- better than a reversal she has to notice she needs.
create unique index if not exists package_entries_one_draw_per_appt
  on public.package_entries (package_id, appointment_id)
  where appointment_id is not null and delta = -1;

alter table public.package_entries enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='package_entries' and policyname='package_entries_select_own') then
    create policy package_entries_select_own on public.package_entries
      for select to authenticated
      using (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='package_entries' and policyname='package_entries_insert_own') then
    create policy package_entries_insert_own on public.package_entries
      for insert to authenticated
      with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

revoke all on public.package_entries from anon, authenticated;
grant select, insert on public.package_entries to authenticated;

-- ── used_sessions becomes a mirror of the ledger, not a number she writes ──
--
-- Kept rather than dropped, and this is a deliberate trade. Six places render
-- it - the packages tab, the client card, and smartReminders' package_done
-- message, which is a cron job on its own deployment surface. Recomputing it
-- here means none of them change and none of them can disagree with the ledger,
-- because the only thing that writes it is this function.
--
-- SECURITY DEFINER so it can update `packages` regardless of what the caller is
-- allowed to write, which is the point: the caller is allowed to write nothing.
create or replace function public.packages_sync_used()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pid uuid;
  u   int;
  t   int;
begin
  pid := coalesce(new.package_id, old.package_id);
  select coalesce(-sum(delta), 0) into u from public.package_entries where package_id = pid;
  select total_sessions into t from public.packages where id = pid;
  -- The flag the guard below reads. Transaction-local, so it cannot leak into
  -- another statement.
  perform set_config('app.pkg_sync', '1', true);
  update public.packages
     set used_sessions = u,
         active = (t is null or u < t)
   where id = pid;
  perform set_config('app.pkg_sync', '', true);
  return null;
end $$;

drop trigger if exists package_entries_sync_trg on public.package_entries;
create trigger package_entries_sync_trg
  after insert or delete on public.package_entries
  for each row execute function public.packages_sync_used();

-- ── And nothing else may touch it ──────────────────────────────────────────
--
-- Without this the app could go on writing used_sessions directly, the ledger
-- would be an optional second opinion, and the audit would hold only for as
-- long as everyone remembered to use it. A guarantee that depends on being
-- remembered is not one.
--
-- Blocks every writer including the service-role key, and lets exactly one
-- caller through: packages_sync_used above, which sets the flag immediately
-- before its update and clears it after.
create or replace function public.packages_used_is_derived()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.pkg_sync', true), '') = '1' then
    return new;
  end if;
  if new.used_sessions is distinct from old.used_sessions
  or new.active        is distinct from old.active then
    raise exception 'used_sessions and active are derived from package_entries; write an entry instead.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists packages_used_is_derived_trg on public.packages;
create trigger packages_used_is_derived_trg
  before update on public.packages
  for each row execute function public.packages_used_is_derived();

-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- Existing packages carry a used_sessions with no entries behind it. Write the
-- entries that would have produced it, so the ledger explains every number
-- already on screen instead of resetting them all to zero.
--
-- Marked as a backfill in `reason`, because that is what they are: a
-- reconstruction, not a record of something observed. Guarded on there being no
-- entries yet, so re-running this file does not double them.
do $$
declare
  pkg record;
  i   int;
begin
  for pkg in
    select p.id, p.tenant_id, coalesce(p.used_sessions, 0) as used
      from public.packages p
     where coalesce(p.used_sessions, 0) > 0
       and not exists (select 1 from public.package_entries e where e.package_id = p.id)
  loop
    for i in 1..pkg.used loop
      insert into public.package_entries (tenant_id, package_id, delta, reason)
      values (pkg.tenant_id, pkg.id, -1, 'backfill: used_sessions before the ledger existed');
    end loop;
  end loop;
end $$;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) Tables, indexes, triggers.
--        select table_name from information_schema.tables
--         where table_schema='public' and table_name in ('package_offerings','package_entries');
--        select tgname from pg_trigger
--         where tgrelid in ('public.packages'::regclass,'public.package_entries'::regclass)
--           and not tgisinternal;
--
--   b) The backfill explains what was already on screen. Expect used_sessions
--      to equal the entry count for every package.
--        select p.id, p.used_sessions, count(e.id) as entries
--          from public.packages p
--          left join public.package_entries e on e.package_id = p.id
--         group by p.id, p.used_sessions
--        having p.used_sessions is distinct from count(e.id);
--        -- expect ZERO rows
--
--   c) THE ONE THAT MATTERS. used_sessions cannot be written directly, and an
--      entry moves it. Expect 42501 on the first update and a changed number
--      after the insert. Replace the id with a real package of yours.
--        begin;
--          update public.packages set used_sessions = 99 where id = '<a-package-id>';  -- must FAIL 42501
--        rollback;
--        begin;
--          insert into public.package_entries (tenant_id, package_id, delta, reason)
--          values ('<your-tenant-id>', '<a-package-id>', -1, 'verify');
--          select used_sessions from public.packages where id = '<a-package-id>';      -- must be +1
--          insert into public.package_entries (tenant_id, package_id, delta, reason)
--          values ('<your-tenant-id>', '<a-package-id>', 1, 'verify reversal');
--          select used_sessions from public.packages where id = '<a-package-id>';      -- back down
--        rollback;
--
--   d) One draw per appointment. The second insert must fail with 23505.
--        begin;
--          insert into public.package_entries (tenant_id, package_id, appointment_id, delta)
--          values ('<your-tenant-id>', '<a-package-id>', '<an-appointment-id>', -1);
--          insert into public.package_entries (tenant_id, package_id, appointment_id, delta)
--          values ('<your-tenant-id>', '<a-package-id>', '<an-appointment-id>', -1);
--        rollback;
