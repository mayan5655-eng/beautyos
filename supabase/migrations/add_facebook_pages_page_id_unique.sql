-- add_facebook_pages_page_id_unique.sql
-- Enforce one row per Facebook page in public.facebook_pages.
--
-- Why: app/api/facebook/webhook/route.ts resolves the tenant for an incoming
-- lead by looking the page up with .eq('page_id', ...).single(). PostgREST's
-- .single() errors when more than one row matches, so if the same Facebook page
-- were ever connected by two tenants, every lead for that page would be dropped
-- and only show up as a "tenant matched: NO" line in the log.
--
-- Self-checking: creates the index only when no unique index on page_id already
-- exists, so it is safe to run against a database that already has one (under
-- any index name, not just the one used here).
--
-- Note: this will fail if duplicate page_id values already exist. Find them
-- first with the query at the bottom of this file if the migration errors.
-- Note: Postgres unique indexes do not constrain NULLs - any number of rows may
-- have page_id IS NULL. That is acceptable here: the webhook only ever looks up
-- a concrete page id.
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
      and c.relname = 'facebook_pages'
      and i.indisunique
      and i.indnatts = 1
      and i.indkey[0] = (
        select a.attnum
        from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'page_id'
          and not a.attisdropped
      )
  ) then
    raise notice 'facebook_pages.page_id is already unique - nothing to do';
  else
    create unique index facebook_pages_page_id_key
      on public.facebook_pages (page_id);
    raise notice 'created unique index facebook_pages_page_id_key';
  end if;
end $$;

-- ============================================================================
-- Duplicate finder (run only if the migration above fails)
-- ============================================================================
-- select page_id, count(*)
-- from public.facebook_pages
-- where page_id is not null
-- group by page_id
-- having count(*) > 1
-- order by count(*) desc;
