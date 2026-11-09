-- receipt_voids_same_tenant_2026-11-09.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Deletes NOTHING.
--
-- Why: the browser inserts payment cancellations (receipt_voids) itself, and the insert policy checks only that the row's
-- tenant_id is hers. The foreign key checks only that receipt_id exists, so a row could name ANOTHER business's receipt. The
-- server reports (weekly digest, monthly report) now read voids filtered by tenant as well; this makes the database refuse such a
-- row outright: a void must belong to the same business as the receipt it cancels.
--
-- STEP 0 (run first, on its own, and look at the result): existing cancellations whose business differs from their receipt's.
-- Expect zero rows. If any come back, they are NOT removed by this file: look at them and decide by hand.
--
--   select v.id as void_id, v.tenant_id as void_tenant, r.id as receipt_id, r.tenant_id as receipt_tenant, v.created_at
--     from public.receipt_voids v
--     join public.receipts r on r.id = v.receipt_id
--    where v.tenant_id is distinct from r.tenant_id;

create or replace function public.receipt_voids_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  receipt_tenant uuid;
begin
  select r.tenant_id into receipt_tenant from public.receipts r where r.id = new.receipt_id;
  if receipt_tenant is null or receipt_tenant is distinct from new.tenant_id then
    raise exception 'receipt_voids: the receipt belongs to another business' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.receipt_voids_same_tenant() from public, anon, authenticated;

drop trigger if exists trg_receipt_voids_same_tenant on public.receipt_voids;
create trigger trg_receipt_voids_same_tenant
  before insert or update of receipt_id, tenant_id on public.receipt_voids
  for each row execute function public.receipt_voids_same_tenant();

-- Verify (run after the above)
-- 1. The trigger exists. Expect one row.
--      select tgname from pg_trigger where tgrelid = 'public.receipt_voids'::regclass and tgname = 'trg_receipt_voids_same_tenant';
-- 2. Still no cross-business cancellations (the STEP 0 query again). Expect zero rows.
--      select count(*) from public.receipt_voids v join public.receipts r on r.id = v.receipt_id where v.tenant_id is distinct from r.tenant_id;
