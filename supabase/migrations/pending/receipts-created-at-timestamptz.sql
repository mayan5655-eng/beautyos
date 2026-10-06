-- receipts-created-at-timestamptz.sql
--
-- ── STATUS: PENDING and OPTIONAL. Run by hand in the Supabase SQL Editor. ──────────────────
--
-- THE BUG IT BELONGS TO (already fixed in the app, 2026-10-06): receipts.created_at and
-- clients.created_at are `timestamp WITHOUT time zone` columns that hold UTC. PostgREST returns them
-- with no zone ("2026-10-05T22:10:35.383187"), JavaScript read that as LOCAL time, and in Israel every
-- receipt came out 2-3 hours early: a payment at 01:10 on the 6th was "yesterday", and "today" showed no
-- payments. The app now treats a zone-less DB timestamp as UTC (lib/dbTime.js), so it is correct today
-- WITHOUT this migration.
--
-- WHY RUN IT ANYWAY. A column that holds UTC but does not say so is a trap for the next reader (a report,
-- an export, a SQL query: `created_at::date` is the UTC date, not hers). timestamptz says it. After this
-- PostgREST returns "2026-10-05T22:10:35.383187+00:00"; lib/dbTime.js leaves a value with an offset alone,
-- so nothing in the app changes. The default (now()) is unchanged: it was always UTC.
--
-- SAFETY. The conversion declares the existing values to be UTC, which they are. If a view or rule
-- depends on either column Postgres refuses with a clear error and changes nothing. Run it as ONE
-- statement block (the SQL editor does), and run the VERIFY first.
--
-- ── STEP 0 - what the columns are now (read-only) ───────────────────────────────────────
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name in ('receipts', 'clients') and column_name = 'created_at';
--   -- expect: timestamp without time zone, default now()

alter table public.receipts alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table public.clients  alter column created_at type timestamptz using created_at at time zone 'UTC';

-- ── VERIFY ───────────────────────────────────────────────────────────────────────────────
--   select table_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name in ('receipts', 'clients') and column_name = 'created_at';
--   -- expect: timestamp with time zone, for both
--   select created_at, created_at at time zone 'Asia/Jerusalem' as israel from public.receipts order by created_at desc limit 3;
--   -- the second column is the wall-clock time she saw; the first carries +00
--   -- in the app: register a payment at any hour; "today" counts it and the confirmation is dated today.
