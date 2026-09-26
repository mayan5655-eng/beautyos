-- add_treatment_results.sql
--
-- Results photos for the public page: a treatment, an "after" photo (a "before"
-- is optional), a short line, optionally how many sessions - and, for every
-- one of them, the CONSENT RECORD of the client whose face or body it is.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run by hand in the Supabase SQL Editor. `npm run migrations:status` verifies.
-- Where this header and the script disagree, the script is right.
--
-- ── Why a table, and not branding.results ───────────────────────────────────
--
-- settings.branding is returned WHOLE by get_public_branding to anyone who
-- opens her page. A consent record holds a client's name. Put it beside the
-- photo in branding and the name of every client who agreed to be photographed
-- is one network tab away from any visitor. So the record lives here, where
-- anon has no privilege at all, and the public page reads through
-- get_public_results, whose column list has no consent fields in it.
--
-- ── What "consent" means here, and what it does not ─────────────────────────
--
-- The record says: WHO (consent_name), WHEN the client gave permission
-- (consent_given_on, entered by her), and THAT SHE CONFIRMED it
-- (consent_confirmed, ticked in the app). When she confirmed, and as whom, are
-- stamped by the trigger below from now() and auth.uid() - the browser cannot
-- write them. It is her attestation, kept per photo. It is not a signed
-- release; a clinic that wants one should keep the signed form on file and
-- name it in consent_name's client file.
--
-- ── The rule that matters: nothing publishes without it ─────────────────────
--
-- Enforced in the DATABASE, not the form: the CHECK constraint refuses a row
-- with published = true unless the consent fields are complete, so a bug in
-- the settings screen, an old client build or a direct API call all hit the
-- same wall. get_public_results repeats the condition in its WHERE clause, so
-- even a row that somehow slipped through is not served.
--
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.treatment_results (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,

  -- The treatment it came from. service_id is text and has no foreign key on
  -- purpose: a result must outlive a renamed or deleted service, so the name
  -- is stored beside it and the page matches on either.
  service_id           text,
  service_name         text not null default '',

  before_url           text,                       -- optional: not every result has a good before shot
  after_url            text not null check (btrim(after_url) <> ''),
  caption              text not null default '' check (char_length(caption) <= 200),
  sessions             int check (sessions is null or sessions between 1 and 99),

  -- ── the consent record (never returned to the public page) ──
  consent_name         text not null default '',   -- who
  consent_given_on     date,                       -- when the client gave permission
  consent_confirmed    boolean not null default false,  -- that she confirmed it
  consent_confirmed_at timestamptz,                -- stamped by trigger
  consent_confirmed_by uuid,                       -- stamped by trigger (auth.uid())

  published            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint treatment_results_consent_before_publish check (
    published = false
    or (
      consent_confirmed
      and btrim(consent_name) <> ''
      and consent_given_on is not null
      and consent_confirmed_at is not null
    )
  )
);

create index if not exists treatment_results_tenant_created_idx
  on public.treatment_results (tenant_id, created_at desc);

-- ── Stamp who confirmed and when; withdraw publication with the consent ─────
--
-- consent_confirmed_at / _by are written here, from the server clock and the
-- session, never from the request. Un-ticking the confirmation also
-- un-publishes the row: the photo comes off her page in the same statement.
create or replace function public.treatment_results_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.consent_confirmed then
    if tg_op = 'INSERT' or not coalesce(old.consent_confirmed, false) then
      new.consent_confirmed_at := now();
      new.consent_confirmed_by := auth.uid();
    else
      -- Already confirmed: the stamp is not hers to rewrite.
      new.consent_confirmed_at := old.consent_confirmed_at;
      new.consent_confirmed_by := old.consent_confirmed_by;
    end if;
  else
    new.consent_confirmed_at := null;
    new.consent_confirmed_by := null;
    new.published := false;
  end if;

  return new;
end;
$$;

drop trigger if exists treatment_results_stamp on public.treatment_results;
create trigger treatment_results_stamp
  before insert or update on public.treatment_results
  for each row execute function public.treatment_results_stamp();

-- ── RLS: hers, and only hers ────────────────────────────────────────────────
alter table public.treatment_results enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='treatment_results' and policyname='treatment_results_select_own') then
    create policy treatment_results_select_own on public.treatment_results
      for select to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='treatment_results' and policyname='treatment_results_insert_own') then
    create policy treatment_results_insert_own on public.treatment_results
      for insert to authenticated with check (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='treatment_results' and policyname='treatment_results_update_own') then
    create policy treatment_results_update_own on public.treatment_results
      for update to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='treatment_results' and policyname='treatment_results_delete_own') then
    create policy treatment_results_delete_own on public.treatment_results
      for delete to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- anon gets NOTHING on this table, in either direction. A new table inherits
-- the default anon grants unless they are revoked here (revoke-anon-grants.sql
-- section 3 is still off).
revoke all on public.treatment_results from anon, public;
grant select, insert, delete on public.treatment_results to authenticated;
grant update (service_id, service_name, before_url, after_url, caption, sessions,
              consent_name, consent_given_on, consent_confirmed, published)
  on public.treatment_results to authenticated;

-- ── The public read ─────────────────────────────────────────────────────────
--
-- Same shape as get_public_reviews: SECURITY DEFINER, explicit column list,
-- granted to anon. Published AND consented rows only, and no consent column of
-- any kind in the result.
create or replace function public.get_public_results(p_tenant_id uuid)
returns table (
  id           uuid,
  service_id   text,
  service_name text,
  before_url   text,
  after_url    text,
  caption      text,
  sessions     int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.service_id, r.service_name, r.before_url, r.after_url, r.caption, r.sessions
    from public.treatment_results r
   where r.tenant_id = p_tenant_id
     and r.published
     and r.consent_confirmed
   order by r.created_at desc
   limit 60;
$$;

revoke execute on function public.get_public_results(uuid) from public;
grant  execute on function public.get_public_results(uuid) to anon, authenticated;

-- ── Trial gate ──────────────────────────────────────────────────────────────
-- 'treatment_results' is added to the targets array in trial-gate-policies.sql
-- (three restrictive policies, like every other table she writes). Re-run that
-- file after this one; its expected counts are now 66 policies / 22 tables.

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--
--   a) Publishing without consent does not happen (run in a transaction and
--      roll back). No confirmation: the trigger takes the row off publication.
--      Confirmed but no name or date: the CHECK constraint refuses it.
--        begin;
--        insert into public.treatment_results (tenant_id, after_url, published)
--          values ((select id from public.tenants limit 1), 'https://x/y.jpg', true)
--          returning published;                       -- expect: false
--        insert into public.treatment_results (tenant_id, after_url, published, consent_confirmed)
--          values ((select id from public.tenants limit 1), 'https://x/y.jpg', true, true);
--        -- expect: ERROR 23514 treatment_results_consent_before_publish
--        rollback;
--
--   b) The public function carries no consent column:
--        select column_name from information_schema.routines r
--          join information_schema.parameters p on p.specific_name = r.specific_name
--         where r.routine_name = 'get_public_results' and p.parameter_mode = 'OUT';
--        -- expect: id, service_id, service_name, before_url, after_url, caption, sessions
--
--   c) anon has nothing on the table:
--        select grantee, privilege_type from information_schema.role_table_grants
--         where table_name = 'treatment_results' and grantee in ('anon', 'public');
--        -- expect: no rows
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop function if exists public.get_public_results(uuid);
-- drop table if exists public.treatment_results;
-- drop function if exists public.treatment_results_stamp();
-- (and remove 'treatment_results' from the targets array in trial-gate-policies.sql)
