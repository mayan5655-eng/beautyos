-- grant_protocol_book_full_TEMPLATE.sql
--
-- NOT A MIGRATION. A template for giving ONE business the full protocol book (lib/protocolBook/book.ts hasFullBook), while
-- billing for the upgrade is not live. Replace the tenant id, run by hand, and run the VERIFY line.
-- feature_flags is a protected key: a business cannot set it from the app (lib/settingsColumns.ts), only this can.
--
-- Never run it for the founder's own tenant without deciding to.

update public.settings
   set automations = jsonb_set(
         coalesce(automations, '{}'::jsonb),
         '{feature_flags}',
         coalesce(automations -> 'feature_flags', '{}'::jsonb) || '{"protocol_book_full": true}'::jsonb,
         true)
 where tenant_id = '00000000-0000-0000-0000-000000000000';   -- <- the business's tenant id

-- To take it back: replace true with false above.

-- VERIFY: should return true
--   select automations -> 'feature_flags' -> 'protocol_book_full' from public.settings where tenant_id = '00000000-0000-0000-0000-000000000000';
