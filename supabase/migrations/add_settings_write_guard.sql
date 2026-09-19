-- add_settings_write_guard.sql
--
-- STATUS: NOT APPLIED. Run `npm run migrations:status` to verify; where this
-- header and the script disagree, the script is right.
--
-- APPLY ONLY AFTER the deploy that contains app/api/settings/save is live.
-- The order matters: this file removes the browser's ability to write the
-- settings table, and until that route is deployed the browser is the only
-- writer. Run it early and every settings save and every signup fails.
--
-- ── What this closes ───────────────────────────────────────────────────────
-- The app saved settings as one wide UPDATE of the whole row, so any tenant
-- could write, on her own row, the columns that were never hers:
--
--   green_api_instance    the key app/api/whatsapp-webhook uses to map an
--                         inbound message to a tenant. Write another tenant's
--                         id here and her conversations could route to you.
--   lead_api_key_hash     bypassing /api/settings/lead-key
--   automations           carries the platform's feature_flags
--
-- and anything a future migration adds. Two guards, each sufficient alone:
--
--   1. The browser cannot write the table. INSERT/UPDATE/DELETE are revoked
--      from `authenticated`; the server route writes with the service role
--      and keeps only the columns in lib/settingsColumns.ts.
--   2. An instance id can belong to one row. A partial unique index means a
--      second tenant claiming an id that is already someone's is refused by
--      the database, whatever path the write took.
--
-- The webhook additionally refuses to act when more than one row matches an
-- instance id, so a duplicate that predates the index (if any) routes to
-- nobody rather than to whoever sorted first.

-- 1. One instance id, one row. Blank and null are exempt: most rows have
--    neither, since per-tenant instances are dead by decision.
--    If this CREATE fails with a duplicate, two tenants already share an
--    instance id; that is a live incident, not a migration problem - find
--    them with the query in the VERIFY block and resolve by hand first.
create unique index if not exists settings_green_api_instance_uniq
  on public.settings (green_api_instance)
  where green_api_instance is not null and green_api_instance <> '';

-- 2. The browser reads its own row (settings_auth_tenant_read, from
--    legacy/anon-revoke.sql) and writes nothing. Explicit grant of SELECT so
--    a later `revoke all` never takes the read away by accident.
revoke insert, update, delete, truncate, references, trigger on public.settings from authenticated;
grant  select on public.settings to authenticated;
revoke all on public.settings from anon;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- (a) The index exists:
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='settings'
--      and indexname='settings_green_api_instance_uniq';
--   -> one row
--
-- (b) authenticated holds SELECT and nothing else:
--   select privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='settings' and grantee='authenticated';
--   -> exactly one row: SELECT
--
-- (c) anon holds nothing:
--   select count(*) from information_schema.role_table_grants
--    where table_schema='public' and table_name='settings' and grantee='anon';
--   -> 0
--
-- (d) No two rows share an instance id (run BEFORE step 1 if it failed):
--   select green_api_instance, count(*) from public.settings
--    where green_api_instance is not null and green_api_instance <> ''
--    group by 1 having count(*) > 1;
--   -> no rows
--
-- (e) In the app: change the business name in Settings and save - it must
--     succeed (through the route). Then, in the browser console on the
--     dashboard, `await supabase.from('settings').update({business_name:'x'}).eq('tenant_id', '<yours>')`
--     must return a permission error and change nothing.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   drop index if exists public.settings_green_api_instance_uniq;
--   grant insert, update on public.settings to authenticated;
-- (delete was never used by the app; do not re-grant it.)
