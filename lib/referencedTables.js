// lib/referencedTables.js
//
// Every table the CODE references, by name, in one place.
//
// Three times a feature shipped whose table did not exist in production, or
// existed with another name or shape - facebook_webhook_events (old shape,
// no readers), facebook_pages (missing columns), owner_questions (created as
// next_questions by a hand-run migration). Every one passed the build,
// because the build cannot see the database, and every write sat behind a
// deliberate catch-and-continue, so the failure was invisible until someone
// looked at the actual database.
//
// This list is guarded from BOTH sides, which is what makes it a check that
// runs rather than a comment that rots:
//
//   * test-referenced-tables.js greps the source for .from('...') calls and
//     fails the suite if the code references a table this list does not
//     carry. So the list cannot fall behind the code. (The list MAY carry a
//     table no .from() call names - tenant_members is here because the RLS
//     resolver functions read it inside the database, where no grep sees.)
//   * lib/invariants.js (nightly cron) asks the database, via the
//     service-role schema_objects() RPC, whether every table here exists.
//     So the database cannot fall behind the list - a missing table becomes
//     a WhatsApp message that night, not a discovery weeks later.
//
// When adding a table: create the migration, reference it from code, and add
// it here. The test tells you if you forget; the cron tells you if the
// migration never actually ran in prod.

export const REFERENCED_TABLES = [
  'advisor_messages',
  'ai_usage',
  'appointments',
  'auto_reminders_log',
  'campaign_posts',
  'campaigns',
  'client_photos',
  'clients',
  'community_posts',
  'expenses',
  'facebook_oauth_states',
  'facebook_pages',
  'facebook_webhook_events',
  'forms',
  'leads',
  'owner_questions',
  'package_entries',
  'package_offerings',
  'packages',
  'platform_admins',
  'receipts',
  'reviews',
  'service_prices',
  'settings',
  'skin_scans',
  'slot_offers',
  'support_messages',
  'tenant_members',
  'tenants',
  'treatment_protocols',
  'waitlist',
  'whatsapp_messages',
];
