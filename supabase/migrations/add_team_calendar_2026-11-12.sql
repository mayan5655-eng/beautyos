-- add_team_calendar_2026-11-12.sql
--
-- STATUS: pending. RUN BY HAND in the Supabase SQL editor. Safe to run more than once. Nothing here deletes or rewrites any
-- appointment. Run AFTER add_service_buffer_2026-11-05.sql (it rebuilds appointments_no_overlap, which that file last built) and
-- after trial-gate-policies.sql (it uses public.is_tenant_active()).
--
-- The team calendar ("יומן צוות", lib/team.ts), behind NEXT_PUBLIC_TEAM_CALENDAR. Until this runs the code reads "one staff member"
-- everywhere: no staff table means single staff, never an error.
--
--   1. staff_members          the people who work in the business: name, colour, active, optional hours per weekday (null = the
--                             business hours), which treatments each one does (null = all). The owner is a row too (is_owner),
--                             created on first use. Nothing is ever deleted: a person who left is active = false.
--   2. appointments.staff_id  optional. NULL means the owner, so every existing appointment is hers, unchanged. The owner's own
--                             appointments always keep NULL (a trigger turns her row's id into NULL), so "the owner" has one value.
--                             A composite foreign key (tenant_id, staff_id) means an appointment can only name a staff member of
--                             ITS OWN business. A trigger refuses moving an appointment onto an inactive staff member.
--   3. The double-booking guarantees become PER STAFF MEMBER: two people can each have a client at 10:00, one person cannot have
--                             two. uniq_appt_slot_active and appointments_no_overlap get coalesce(staff_id, zero uuid) as a key.
--                             This only loosens them for rows with a staff_id; every existing row (NULL) is checked exactly as before.
--
-- Row level security: a business reads only its own staff; nothing is written from the browser (every write is /api/team with the
-- service role, which checks the session's tenant). Trial gate: the same restrictive write block as the other tables.

begin;
set local search_path = public, extensions;

-- 1 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.staff_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 40),
  color       text not null default '#E9A9A1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active      boolean not null default true,
  is_owner    boolean not null default false,
  -- { "0": {"open": 9, "close": 18} | null, ... } like settings.business_hours; null = the business hours.
  hours       jsonb,
  -- the treatments she does, by name; null = all of them.
  services    text[],
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists staff_members_tenant_id_uniq on public.staff_members (tenant_id, id);
create unique index if not exists staff_members_one_owner_uniq on public.staff_members (tenant_id) where is_owner;
create index if not exists staff_members_tenant_idx on public.staff_members (tenant_id, active, sort_order);

-- The owner row never stops being active (she is the business), and is never turned into somebody else.
create or replace function public.staff_members_owner_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.is_owner and (not new.is_owner or not new.active) then
    raise exception 'staff_members: the owner row stays the owner and stays active' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists staff_members_owner_guard on public.staff_members;
create trigger staff_members_owner_guard before insert or update on public.staff_members
  for each row execute function public.staff_members_owner_guard();

-- 2 ─────────────────────────────────────────────────────────────────────────
alter table public.appointments add column if not exists staff_id uuid;
comment on column public.appointments.staff_id is
  'Which staff member (public.staff_members) this appointment is with. NULL = the owner. Part of uniq_appt_slot_active and appointments_no_overlap (lib/team.ts).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_staff_same_tenant_fk' and conrelid = 'public.appointments'::regclass) then
    alter table public.appointments
      add constraint appointments_staff_same_tenant_fk
      foreign key (tenant_id, staff_id) references public.staff_members (tenant_id, id);
    raise notice 'added appointments_staff_same_tenant_fk';
  end if;
end $$;
create index if not exists appointments_tenant_staff_date_idx on public.appointments (tenant_id, staff_id, date) where staff_id is not null;

-- The owner's own row is written as NULL; a NEW assignment to an inactive staff member is refused (an old appointment of someone
-- who left keeps its staff_id and can still be edited).
create or replace function public.appointments_staff_check() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  if new.staff_id is null then return new; end if;
  select is_owner, active, tenant_id into s from public.staff_members where id = new.staff_id;
  if not found or s.tenant_id is distinct from new.tenant_id then
    raise exception 'appointments: staff member of another business' using errcode = '23503';
  end if;
  if s.is_owner then
    new.staff_id := null;
    return new;
  end if;
  if not s.active and (tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id) then
    raise exception 'appointments: this staff member is not active' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists appointments_staff_check on public.appointments;
create trigger appointments_staff_check before insert or update of staff_id, tenant_id on public.appointments
  for each row execute function public.appointments_staff_check();

-- 3 ─────────────────────────────────────────────────────────────────────────
-- Same predicate as add_appointment_start_minute.sql, one more key column.
drop index if exists public.uniq_appt_slot_active;
create unique index if not exists uniq_appt_slot_active
  on public.appointments (tenant_id, (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)), date, start_minute)
  where confirmation_status <> 'cancelled';

-- Same range and predicate as add_service_buffer_2026-11-05.sql, one more key column.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'appointments_no_overlap'
      and conrelid = 'public.appointments'::regclass
      and pg_get_constraintdef(oid) like '%staff_id%'
  ) then
    raise notice 'appointments_no_overlap already includes staff_id, skipping';
    return;
  end if;
  alter table public.appointments drop constraint if exists appointments_no_overlap;
  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      tenant_id with =,
      (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
      date with =,
      (
        case
          when start_minute is null or duration is null or duration <= 0
            then 'empty'::int4range
          else int4range(start_minute, start_minute + duration + coalesce(buffer_minutes, 0))
        end
      ) with &&
    )
    where (coalesce(confirmation_status, '') <> 'cancelled');
  raise notice 'rebuilt appointments_no_overlap per staff member';
end $$;

-- row level security: reads of her own rows only; no browser writes ─────────
alter table public.staff_members enable row level security;
drop policy if exists staff_members_select_own on public.staff_members;
create policy staff_members_select_own on public.staff_members for select to authenticated using (tenant_id = public.get_user_tenant_id());
revoke all on public.staff_members from anon, authenticated;
grant select on public.staff_members to authenticated;

-- trial gate ─────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.is_tenant_active()') is null then
    raise notice 'SKIPPED the trial gate: public.is_tenant_active() does not exist. Run trial-state.sql and trial-gate-policies.sql first, then this file again.';
    return;
  end if;
  drop policy if exists staff_members_require_active_insert on public.staff_members;
  drop policy if exists staff_members_require_active_update on public.staff_members;
  drop policy if exists staff_members_require_active_delete on public.staff_members;
  create policy staff_members_require_active_insert on public.staff_members as restrictive for insert to authenticated with check (public.is_tenant_active());
  create policy staff_members_require_active_update on public.staff_members as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active());
  create policy staff_members_require_active_delete on public.staff_members as restrictive for delete to authenticated using (public.is_tenant_active());
end $$;

notify pgrst, 'reload schema';
commit;

-- ── VERIFY (read-only; run after the block above) ───────────────────────────
-- 1) the table and the column exist (expect true, true):
--      select to_regclass('public.staff_members') is not null,
--             exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'staff_id');
-- 2) both double-booking guarantees are per staff member (expect 2 rows, each mentioning staff_id):
--      select indexname, indexdef from pg_indexes where indexname = 'uniq_appt_slot_active';
--      select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'appointments_no_overlap';
-- 3) an appointment can only name a staff member of its own business (expect 1 row):
--      select conname from pg_constraint where conname = 'appointments_staff_same_tenant_fk';
-- 4) row level security is on and the browser cannot write (expect true, then false, false):
--      select relrowsecurity from pg_class where relname = 'staff_members';
--      select has_table_privilege('authenticated', 'public.staff_members', 'insert'), has_table_privilege('authenticated', 'public.staff_members', 'update');
-- 5) the trial gate (expect 3 rows):
--      select policyname from pg_policies where tablename = 'staff_members' and policyname like '%require_active%';
-- 6) the triggers (expect 2 rows):
--      select tgname from pg_trigger where tgname in ('staff_members_owner_guard', 'appointments_staff_check');
-- 7) nothing changed for existing data (expect 0: every appointment is still the owner's):
--      select count(*) from public.appointments where staff_id is not null;
