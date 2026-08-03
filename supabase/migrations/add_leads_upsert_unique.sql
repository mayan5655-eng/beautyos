-- add_leads_upsert_unique.sql
-- Support the Facebook webhook's upsert on public.leads.
--
-- Why: app/api/facebook/webhook/route.ts upserts every incoming lead with
-- onConflict: 'tenant_id,source,external_id'. Postgres raises 42P10 ("no unique
-- or exclusion constraint matching the ON CONFLICT specification") unless a
-- matching unique index exists, so today every Facebook lead fails to save.
--
-- FULL index, not partial - deliberately:
--   A partial index (... where external_id is not null) can only serve as an
--   ON CONFLICT arbiter when the statement repeats the predicate, i.e.
--   "on conflict (tenant_id, source, external_id) where external_id is not null".
--   supabase-js sends column names only, so PostgREST emits a bare ON CONFLICT
--   and a partial index would still raise 42P10 - the bug would look fixed and
--   would not be.
--
--   The NULL edge case needs no special handling: Postgres unique indexes are
--   NULLS DISTINCT by default, so any number of leads rows may have
--   external_id IS NULL without colliding. Only rows with a concrete
--   external_id are constrained, which is exactly the intent.
--
--   Caveat: empty string is NOT null. If the app ever writes external_id = ''
--   instead of NULL, two such rows in the same (tenant_id, source) WOULD
--   collide. At the time of writing there are no empty-string rows.
--
-- Self-checking: creates the index only when no equivalent unique index already
-- exists, matched by column set rather than by name. Partial indexes are
-- explicitly excluded from that check (indpred is null), since they would not
-- satisfy the upsert.
--
-- Verified before writing: 0 duplicate groups on (tenant_id, source,
-- external_id) among rows with a non-null external_id, so this applies cleanly.
--
-- Run in the Supabase SQL Editor.

do $$
begin
  if exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
      and i.indisunique
      -- A partial unique index cannot serve a bare ON CONFLICT, so one does not
      -- count as "already handled".
      and i.indpred is null
      and i.indnkeyatts = 3
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(string_to_array(i.indkey::text, ' ')::smallint[]) as k(attnum)
        join pg_attribute a
          on a.attrelid = c.oid
         and a.attnum = k.attnum
         and not a.attisdropped
      ) = array['external_id', 'source', 'tenant_id']
  ) then
    raise notice 'leads already has a matching unique index - nothing to do';
  else
    create unique index leads_tenant_source_external_key
      on public.leads (tenant_id, source, external_id);
    raise notice 'created unique index leads_tenant_source_external_key';
  end if;
end $$;

-- ============================================================================
-- Duplicate finder (run only if the migration above fails)
-- ============================================================================
-- select tenant_id, source, external_id, count(*)
-- from public.leads
-- where external_id is not null
-- group by tenant_id, source, external_id
-- having count(*) > 1
-- order by count(*) desc;
