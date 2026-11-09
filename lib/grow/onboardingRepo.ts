// lib/grow/onboardingRepo.ts
//
// SERVER ONLY. The service-role implementation of OnboardingRepo (lib/grow/webhook.ts). Both tables are written and
// read only through the service role: add_grow_onboarding.sql grants nothing to anon or authenticated.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminAttachRepo, StoredOnboardingRow } from './webhook.ts';

const UPDATE_COLS = 'id, user_id, tracking_code, business_title, name, package_id, package_name, tracking_status_id, tracking_status_message, grow_status, grow_error, had_api_key, match_state, matched_tenant_id';

export function supabaseOnboardingRepo(db: SupabaseClient): AdminAttachRepo {
  return {
    async getUpdate(id) {
      // Used only by the admin attach (/api/admin/grow-onboarding), after requirePlatformAdmin(). No api_key column exists to read.
      const { data, error } = await db.from('grow_onboarding_updates').select(UPDATE_COLS).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data || null) as StoredOnboardingRow | null;
    },
    async insertUpdate(row) {
      const { data, error } = await db.from('grow_onboarding_updates').insert(row).select('id').single();
      if (error || !data) throw new Error(error?.message || 'insert failed');
      return String((data as { id: unknown }).id);
    },
    async findPendingByTrackingCode(code) {
      const { data, error } = await db.from('grow_onboarding_pending').select('tenant_id').eq('tracking_code', code).is('consumed_at', null).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { tenant_id: String((data as { tenant_id: unknown }).tenant_id) } : null;
    },
    async getAccount(tenantId) {
      const { data, error } = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { user_id: String((data as { user_id: unknown }).user_id), enabled: (data as { enabled: unknown }).enabled === true } : null;
    },
    async saveAccount(tenantId, userId, enabled) {
      const { error } = await db.from('grow_accounts').upsert(
        { tenant_id: tenantId, user_id: userId, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id' },
      );
      if (error) throw new Error(error.message);
    },
    async setMatch(updateId, state, tenantId) {
      const { error } = await db.from('grow_onboarding_updates').update({ match_state: state, matched_tenant_id: tenantId }).eq('id', updateId);
      if (error) throw new Error(error.message);
    },
    async setPendingStatus(tenantId, status, message) {
      const patch = { status, status_message: message ? message.slice(0, 200) : null, updated_at: new Date().toISOString() };
      const { error } = await db.from('grow_onboarding_pending').update(patch).eq('tenant_id', tenantId);
      // The status columns come from add_grow_cashier.sql (run by hand): without them this is a no-op, never a failure.
      if (error && !/column|schema cache|42703|PGRST204/i.test(`${error.code} ${error.message}`)) throw new Error(error.message);
    },
    async saveApiKey(tenantId, sealed) {
      const { error } = await db.from('grow_account_secrets').upsert(
        { tenant_id: tenantId, api_key_encrypted: sealed, source: 'registration', updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id' },
      );
      // add_grow_register.sql not run yet: say so, without the key.
      if (error) throw new Error(/schema cache|does not exist|42P01|PGRST205/i.test(`${error.code} ${error.message}`) ? 'grow_account_secrets missing' : error.message);
    },
    async ensurePending(tenantId, trackingCode, fallbackCode) {
      const have = await db.from('grow_onboarding_pending').select('tenant_id').eq('tenant_id', tenantId).maybeSingle();
      if (have.error) throw new Error(have.error.message);
      if (have.data) return;
      let r = await db.from('grow_onboarding_pending').insert({ tenant_id: tenantId, tracking_code: trackingCode });
      // The tracking code already belongs to another business's pending row (unique): keep that one and use the admin code here.
      if (r.error && /23505|duplicate/i.test(`${r.error.code} ${r.error.message}`) && trackingCode !== fallbackCode) {
        r = await db.from('grow_onboarding_pending').insert({ tenant_id: tenantId, tracking_code: fallbackCode });
      }
      if (r.error && !/23505|duplicate/i.test(`${r.error.code} ${r.error.message}`)) throw new Error(r.error.message);
    },
    async clearPending(tenantId) {
      const { error } = await db.from('grow_onboarding_pending').update({ consumed_at: new Date().toISOString() }).eq('tenant_id', tenantId).is('consumed_at', null);
      if (error) throw new Error(error.message);
    },
  };
}
