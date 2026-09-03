-- add_service_description.sql
--
-- One optional line under each service name: what the client gets.
--
-- ── STATUS: NOT APPLIED ─────────────────────────────────────────────────────
-- Run `npm run migrations:status` to verify; where this header and the script
-- disagree, the script is right.
--
-- The booking page showed a bare treatment name next to a price - the
-- visitor deciding between "הידרהפיל" and "טיפול פנים קלאסי" had nothing to
-- decide WITH. Nullable and optional: an empty description renders nothing,
-- and the template menu now seeds sensible one-liners so a new cosmetician
-- gets them without typing (lib/tenantTemplate.ts).
--
-- No new grants or policies: service_prices already carries tenant-scoped
-- RLS for the settings editor, and the public booking page reads through its
-- existing path. A new column inherits all of it.
--
-- Safe to run more than once.

alter table public.service_prices
  add column if not exists description text;
