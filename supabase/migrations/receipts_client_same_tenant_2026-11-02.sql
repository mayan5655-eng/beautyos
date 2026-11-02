-- receipts_client_same_tenant_2026-11-02.sql
--
-- WHY. A receipt is inserted from the browser under row-level security that checks only receipts.tenant_id. Its client_id was not
-- checked, and a legal document (Morning) reads the client's name, phone and email by that id. The 2026-11-02 audit closed the app
-- side (lib/legalReceipts/service.js reads the client within the receipt's business; /api/grow/charge refuses a client or
-- appointment of another business). This trigger closes the database side, the same way treatment_results_client_same_tenant does:
-- a receipt may only point at a client of the SAME business.
--
-- SAFE TO RUN TWICE. It touches no existing row: the check runs only when a receipt is inserted or its client_id is changed.
-- Run step 0 first; if it returns rows, send them to Claude before running the rest (an existing cross-business link is a finding).

-- ── 0. CHECK FIRST (read-only): existing receipts whose client belongs to another business. Expect 0 rows. ─────────────────────
-- select r.id, r.tenant_id as receipt_tenant, c.tenant_id as client_tenant
--   from public.receipts r join public.clients c on c.id::text = r.client_id::text
--  where r.client_id is not null and c.tenant_id <> r.tenant_id;

create or replace function public.receipts_client_same_tenant()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients c where c.id::text = new.client_id::text and c.tenant_id = new.tenant_id
  ) then
    raise exception 'receipts.client_id must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_client_same_tenant on public.receipts;
create trigger receipts_client_same_tenant
  before insert or update of client_id on public.receipts
  for each row execute function public.receipts_client_same_tenant();

-- ── VERIFY (read-only) ──────────────────────────────────────────────────────
--   select tgname from pg_trigger where tgrelid = 'public.receipts'::regclass and tgname = 'receipts_client_same_tenant';
--   -- expect: one row
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop trigger if exists receipts_client_same_tenant on public.receipts;
-- drop function if exists public.receipts_client_same_tenant();
