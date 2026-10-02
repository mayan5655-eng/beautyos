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

// Critical COLUMNS per table - the shape half of the guard. Existence alone
// missed the second failure mode twice: facebook_pages existed but lacked the
// columns the OAuth callback writes, and owner_questions existed (renamed
// from next_questions) without status/result, so every insert and read
// failed behind catch-and-continue. Listed here: the columns whose absence
// silently kills a feature. Not every column - the ones writes and filters
// depend on.
export const REFERENCED_COLUMNS = {
  owner_questions: ['kind', 'payload', 'status', 'result', 'answered_at'],
  facebook_pages: ['page_id', 'page_access_token_encrypted', 'is_active', 'long_lived_token_expires_at'],
  facebook_webhook_events: ['leadgen_id', 'payload', 'processed', 'error_message'],
  facebook_oauth_states: ['state', 'user_id', 'tenant_id'],
  service_prices: ['name', 'price', 'duration', 'active', 'description'],
  slot_offers: ['token', 'slot_date', 'slot_start_minute', 'status', 'expires_at', 'claimed_at', 'duration', 'client_id', 'phone'],
  appointments: ['date', 'start_minute', 'duration', 'client_id', 'client_phone', 'confirmation_status', 'confirmation_sent', 'self_booked'],
  leads: ['source', 'external_id', 'status', 'ai_score', 'email', 'raw_form_data', 'received_at'],
  settings: ['lead_api_key_hash'],
  receipts: ['legal_status', 'legal_provider', 'legal_doc_id', 'legal_doc_number', 'legal_doc_type', 'legal_doc_url', 'legal_issued_at', 'legal_error', 'legal_attempts', 'legal_attempted_at'],
  receipt_voids: ['credit_status', 'credit_doc_id', 'credit_doc_number', 'credit_doc_url', 'credit_issued_at', 'credit_error', 'credit_attempts', 'credit_attempted_at'],
  legal_receipt_accounts: ['provider', 'credentials_encrypted', 'environment', 'needs_reconnect'],
  treatment_results: ['service_id', 'service_name', 'before_url', 'after_url', 'caption', 'sessions', 'consent_name', 'consent_given_on', 'consent_confirmed', 'consent_confirmed_at', 'published'],
  // whatsapp-manual-mode.sql (pending, handed over by hand) - see
  // lib/platformSettings.js, lib/ownerNotify.js, app/api/admin/whatsapp-mode,
  // app/api/push/subscribe.
  platform_settings: ['whatsapp_auto_utility_enabled'],
  push_subscriptions: ['tenant_id', 'endpoint', 'p256dh', 'auth'],
  owner_notifications: ['tenant_id', 'kind', 'title', 'body', 'read_at'],
};

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
  'designs',
  'expenses',
  'facebook_oauth_states',
  'facebook_pages',
  'facebook_webhook_events',
  'forms',
  'leads',
  'legal_receipt_accounts',
  'owner_questions',
  'owner_notifications',
  'package_entries',
  'package_offerings',
  'packages',
  'platform_admins',
  'platform_settings',
  'push_subscriptions',
  'receipt_voids',
  'receipts',
  'reviews',
  'service_prices',
  'settings',
  'treatment_results',
  'skin_scans',
  'slot_offers',
  'support_messages',
  'tenant_members',
  'tenants',
  'treatment_protocols',
  'waitlist',
  'whatsapp_messages',
];
