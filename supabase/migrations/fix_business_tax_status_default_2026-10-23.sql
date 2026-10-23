-- fix_business_tax_status_default_2026-10-23.sql
--
-- settings.business_tax_status (עוסק פטור / מורשה / חברה) is not created by any migration in the repo: it was added in the
-- database directly. The journey pass (2026-10-21) found that a new business who skips the question in onboarding still gets
-- 'exempt' from a column DEFAULT. So the setup checklist ticks "סוג העסק" as done, and a legal document would be typed as an
-- exempt dealer's receipt for someone who never said so (lib/legalReceipts/service.js refuses only while the value is EMPTY).
--
-- This removes the default (and NOT NULL, if the column has it, since onboarding omits the field when she skips it, which would
-- otherwise fail the insert). Existing rows are NOT changed: a stored 'exempt' may be a real answer, and nothing tells the two apart.
-- Safe to run more than once. Run it whenever convenient; the app already handles an empty value.

-- BEFORE (for the record): what the column looks like now.
select column_default, is_nullable, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'settings' and column_name = 'business_tax_status';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'settings' and column_name = 'business_tax_status') then
    execute 'alter table public.settings alter column business_tax_status drop default';
    execute 'alter table public.settings alter column business_tax_status drop not null';
  end if;
end $$;

-- VERIFY (the result should be: column_default = null, is_nullable = YES)
select column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'settings' and column_name = 'business_tax_status';
