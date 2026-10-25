-- add_client_pages_2026-10-25.sql
--
-- The client's personal results page (kalmea.app/c/<token>), opened from a link the owner sends her client by hand.
--
-- ── STATUS: NOT RUN. Written as a file only (standing rule). Run by hand in the Supabase SQL Editor. ──
-- Until it runs, the app says so ("הדף האישי עוד לא הופעל") and every link answers "no longer active"; nothing breaks.
-- Safe to run more than once.
--
-- ── What it adds ────────────────────────────────────────────────────────────
--
-- 1. public.client_pages - one row per link the owner made for one client.
--      token_id    22 random characters. The link is <token_id>.<expiry>.<signature>; the signature is checked by the app
--                  (lib/clientPage.ts) BEFORE this table is touched. No tenant id and no client id appear in the link.
--      revoked_at  "ביטול הקישור": a revoked link answers "not found" at once, whatever copies are in WhatsApp threads.
--      expires_at  the link's own end date (180 days); the signature carries the same date.
--      aftercare   the owner's tips for this client, one per line (rendered on the page, so capped).
--      first_opened_at / last_opened_at / open_count   the ONLY thing learned back: "she opened it". No IP, no device, no history.
--    One ACTIVE link per client (partial unique index); revoking, or making a new link, retires the previous one.
--    RLS: the owner may READ her own rows (for the "נפתח" line). anon gets nothing at all. There are no insert/update/delete
--    policies for `authenticated` on purpose: the only writer is /api/client-page on the service key, which checks the
--    session and the client's tenant first. The public page reads through the service key too, after verifying the token.
--
-- 2. public.treatment_results.client_id - which client a before/after photo belongs to (nullable; set in Settings -> results).
--    The client's page shows ONLY the photos linked to HER whose consent record is complete (the same rule as the table's
--    consent CHECK). A trigger refuses a link to a client of another business.
--    ON DELETE SET NULL: deleting a client unlinks her photos; they are not deleted here (nothing is deleted from the product).
--
-- ── Erasing a client ────────────────────────────────────────────────────────
-- client_pages.client_id is ON DELETE CASCADE: when a client card is erased (lib/clientData.ts) her links die with it.

create table if not exists public.client_pages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  client_id       uuid not null references public.clients(id) on delete cascade,
  token_id        text not null unique check (char_length(token_id) = 22),
  aftercare       text not null default '' check (char_length(aftercare) <= 1500),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      int not null default 0 check (open_count >= 0)
);

create unique index if not exists client_pages_one_active_per_client
  on public.client_pages (client_id) where revoked_at is null;
create index if not exists client_pages_tenant_client_idx
  on public.client_pages (tenant_id, client_id, created_at desc);

alter table public.client_pages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_pages' and policyname='client_pages_select_own') then
    create policy client_pages_select_own on public.client_pages
      for select to authenticated using (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- anon and public: nothing, in either direction. authenticated: read only.
revoke all on public.client_pages from anon, public;
revoke all on public.client_pages from authenticated;
grant select on public.client_pages to authenticated;

-- ── Which client a result photo belongs to ──────────────────────────────────
alter table public.treatment_results
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists treatment_results_client_idx
  on public.treatment_results (client_id) where client_id is not null;

-- The existing grant lists the columns authenticated may UPDATE; client_id has to join it. (INSERT is granted on the whole table.)
grant update (client_id) on public.treatment_results to authenticated;

-- A result may only point at a client of the SAME business.
create or replace function public.treatment_results_client_same_tenant()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients c where c.id = new.client_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'treatment_results.client_id must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists treatment_results_client_same_tenant on public.treatment_results;
create trigger treatment_results_client_same_tenant
  before insert or update of client_id on public.treatment_results
  for each row execute function public.treatment_results_client_same_tenant();

-- ── VERIFY (read-only) ──────────────────────────────────────────────────────
--
--   a) both objects exist:
--        select to_regclass('public.client_pages') as client_pages,
--               (select count(*) from information_schema.columns
--                 where table_schema='public' and table_name='treatment_results' and column_name='client_id') as results_client_id;
--        -- expect: client_pages | 1
--
--   b) anon has nothing on the new table, authenticated can only select:
--        select grantee, privilege_type from information_schema.role_table_grants
--         where table_schema='public' and table_name='client_pages' and grantee in ('anon','public','authenticated');
--        -- expect: only (authenticated, SELECT)
--
--   c) RLS is on:
--        select relrowsecurity from pg_class where oid = 'public.client_pages'::regclass;   -- expect: true
--
--   d) then, from the repo:  node --env-file=.env.local scripts/smoke/rls-cross-tenant.mjs   (expect ALL OK)
--                            node --env-file=.env.local scripts/smoke/client-results-page.mjs (expect ALL OK)
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop trigger if exists treatment_results_client_same_tenant on public.treatment_results;
-- drop function if exists public.treatment_results_client_same_tenant();
-- alter table public.treatment_results drop column if exists client_id;
-- drop table if exists public.client_pages;
