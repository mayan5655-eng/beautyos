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
  ops_events: ['source', 'severity', 'message', 'whatsapp_delivery'],
  content_plans: ['tenant_id', 'week_start', 'status'],
  content_items: ['tenant_id', 'plan_id', 'template_key', 'values', 'planned_for', 'status', 'reminder_sent_at'],
  content_item_platforms: ['item_id', 'tenant_id', 'platform', 'caption', 'hashtags', 'edited'],
  content_preferences: ['tenant_id', 'posting_days', 'post_hour', 'items_per_week', 'platforms', 'reminders'],
  publish_jobs: ['tenant_id', 'item_id', 'platform', 'page_id', 'run_at', 'state', 'attempts', 'container_id', 'idempotency_key'],
  publish_events: ['job_id', 'tenant_id', 'event'],
  cron_runs: ['job', 'last_run_at'],
  admin_tenant_contacts: ['tenant_id', 'status', 'note', 'follow_up_on', 'contacted_at', 'updated_at'],
  facebook_pages: ['page_id', 'page_access_token_encrypted', 'is_active', 'long_lived_token_expires_at'],
  facebook_webhook_events: ['leadgen_id', 'payload', 'processed', 'error_message'],
  facebook_oauth_states: ['state', 'user_id', 'tenant_id'],
  service_prices: ['name', 'price', 'duration', 'active', 'description', 'requires_deposit'],
  slot_offers: ['token', 'slot_date', 'slot_start_minute', 'status', 'expires_at', 'claimed_at', 'duration', 'client_id', 'phone'],
  appointments: ['date', 'start_minute', 'duration', 'client_id', 'client_phone', 'confirmation_status', 'confirmation_sent', 'self_booked'],
  leads: ['source', 'external_id', 'status', 'ai_score', 'email', 'raw_form_data', 'received_at'],
  settings: ['lead_api_key_hash'],
  receipts: ['legal_status', 'legal_provider', 'legal_doc_id', 'legal_doc_number', 'legal_doc_type', 'legal_doc_url', 'legal_issued_at', 'legal_error', 'legal_attempts', 'legal_attempted_at'],
  receipt_voids: ['credit_status', 'credit_doc_id', 'credit_doc_number', 'credit_doc_url', 'credit_issued_at', 'credit_error', 'credit_attempts', 'credit_attempted_at'],
  legal_receipt_accounts: ['provider', 'credentials_encrypted', 'environment', 'needs_reconnect'],
  ad_spend: ['tenant_id', 'day', 'source', 'amount', 'origin'],
  grow_accounts: ['tenant_id', 'user_id', 'enabled'],
  grow_payments: ['tenant_id', 'status', 'amount', 'process_id', 'notify_token', 'receipt_id', 'invoice_url'],
  grow_signup_requests: ['tenant_id', 'name', 'phone', 'business_name', 'business_id', 'status'],
  grow_cancel_policies: ['tenant_id', 'policy'],
  appointment_policy_consents: ['tenant_id', 'appointment_id', 'mode', 'snapshot', 'token_id', 'status'],
  grow_card_tokens: ['tenant_id', 'appointment_id', 'token_ref', 'token_encrypted', 'card_last4'],
  grow_card_consents: ['tenant_id', 'appointment_id', 'client_id', 'consent_text', 'consent_version', 'consented_at', 'mode', 'process_id', 'process_token', 'status', 'token_id'],
  grow_token_charges: ['tenant_id', 'client_id', 'appointment_id', 'token_id', 'unique_identifier', 'group_identifier', 'amount', 'purpose', 'status', 'grow_error_id', 'error', 'transaction_id', 'transaction_token', 'asmachta', 'looked_up'],
  cancellation_fee_items: ['tenant_id', 'appointment_id', 'kind', 'amount', 'status', 'grow_payment_id', 'receipt_id'],
  client_credits: ['tenant_id', 'client_id', 'amount', 'used_at'],
  billing_subscriptions: ['tenant_id', 'price', 'status', 'next_charge_at', 'token_ref', 'card_last4', 'failed_attempts', 'past_due_since', 'last_attempt_at', 'canceled_at', 'ends_at'],
  billing_payments: ['tenant_id', 'subscription_id', 'kind', 'status', 'amount', 'period_start', 'period_end', 'invoice_status', 'invoice_number', 'invoice_url'],
  billing_card_consents: ['tenant_id', 'consent_text', 'consent_version', 'accepted_at'],
  // add_billing_addons.sql (paid add-on packs, behind NEXT_PUBLIC_ADDON_PACKS). Until it is run the nightly check reports it missing.
  billing_addons: ['tenant_id', 'pack', 'units', 'usd_allowance', 'price', 'period_month', 'payment_id'],
  grow_onboarding_updates: ['user_id', 'tracking_code', 'match_state', 'matched_tenant_id', 'had_api_key'],
  wa_cloud_messages: ['tenant_id', 'mode', 'status', 'reason', 'wa_message_id', 'recipient_hash', 'cost_estimate_usd', 'delivery_status', 'billable'],
  grow_onboarding_pending: ['tenant_id', 'tracking_code', 'consumed_at'],
  grow_account_secrets: ['tenant_id', 'api_key_encrypted'],
  treatment_results: ['service_id', 'service_name', 'before_url', 'after_url', 'caption', 'sessions', 'consent_name', 'consent_given_on', 'consent_confirmed', 'consent_confirmed_at', 'published', 'client_id'],
  // add_client_pages_2026-10-25.sql - lib/clientPageData.ts, app/api/client-page: the client's personal results page.
  client_pages: ['tenant_id', 'client_id', 'token_id', 'aftercare', 'expires_at', 'revoked_at', 'first_opened_at', 'last_opened_at', 'open_count'],
  // whatsapp-manual-mode.sql (pending, handed over by hand) - see
  // lib/platformSettings.js, lib/ownerNotify.js, app/api/admin/whatsapp-mode,
  // app/api/push/subscribe.
  platform_settings: ['whatsapp_auto_utility_enabled', 'phone_verify_signup', 'phone_verify_existing', 'phone_verify_since'],
  // add_owner_phone_verification.sql - lib/phoneVerify/store.ts: one verified mobile per account, and every code sent.
  owner_phones: ['phone_e164', 'user_id', 'tenant_id'],
  phone_otp: ['phone_e164', 'purpose', 'user_id', 'ip_hash', 'code_hash', 'expires_at', 'attempts', 'consumed_at', 'send_status'],
  push_subscriptions: ['tenant_id', 'endpoint', 'p256dh', 'auth'],
  owner_notifications: ['tenant_id', 'kind', 'title', 'body', 'read_at'],
  whatsapp_inbound: ['tenant_id', 'phone', 'body', 'source'],
};

export const REFERENCED_TABLES = [
  'ad_spend',
  // supabase/migrations/add_wa_cloud.sql - lib/waCloud/send.ts, app/api/wa-cloud/webhook, the admin cost log.
  'wa_cloud_messages',
  // supabase/migrations/add_whatsapp_inbound.sql - lib/waConversation.js: the WhatsApp bot's memory.
  'whatsapp_inbound',
  'marketing_suppressions',
  'grow_accounts',
  'grow_payments',
  'grow_cancel_policies',
  'appointment_policy_consents',
  'grow_card_tokens',
  'grow_card_consents',
  'grow_token_charges',
  'cancellation_fee_items',
  'client_credits',
  'grow_signup_requests',
  'billing_subscriptions',
  'billing_payments',
  'billing_card_consents',
  'billing_addons',
  'grow_onboarding_updates',
  'grow_onboarding_pending',
  'grow_account_secrets',
  'advisor_messages',
  'admin_tenant_contacts',
  'ai_usage',
  'appointments',
  'auto_reminders_log',
  'campaign_posts',
  'campaigns',
  'client_photos',
  'clients',
  'content_item_platforms',
  'content_items',
  'content_plans',
  'content_preferences',
  'community_posts',
  'designs',
  'expenses',
  'facebook_oauth_states',
  'facebook_pages',
  'facebook_webhook_events',
  'forms',
  'leads',
  'legal_receipt_accounts',
  'ops_events',
  'cron_runs',
  'owner_notifications',
  'owner_phones',
  'owner_questions',
  'package_entries',
  'package_offerings',
  'packages',
  'phone_otp',
  'platform_admins',
  'platform_settings',
  'publish_events',
  'publish_jobs',
  'product_feedback', // add_product_feedback_2026-10-30.sql; the nightly check reports it missing until that SQL runs
  'push_subscriptions',
  'receipt_voids',
  'receipts',
  'reminder_claims', // add_audit_round2_2026-10-20.sql; the nightly check reports it missing until that SQL runs
  'reviews',
  'service_prices',
  'settings',
  'share_events', // add_share_events.sql; the nightly check reports it missing until that SQL runs
  'skin_scans',
  'slot_offers',
  'support_messages',
  'tenant_members',
  'tenants',
  'treatment_protocols',
  'treatment_results',
  // add_client_pages_2026-10-25.sql (pending, handed over by hand) - the client's personal results page.
  'client_pages',
  'waitlist',
  'whatsapp_messages',
];
