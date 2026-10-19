// lib/grow/onboardingRepo.ts
//
// SERVER ONLY. The service-role implementation of OnboardingRepo (lib/grow/webhook.ts). Both tables are written and
// read only through the service role: add_grow_onboarding.sql grants nothing to anon or authenticated.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnboardingRepo } from './webhook.ts';

export function supabaseOnboardingRepo(db: SupabaseClient): OnboardingRepo {
  return {
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
    async clearPending(tenantId) {
      const { error } = await db.from('grow_onboarding_pending').update({ consumed_at: new Date().toISOString() }).eq('tenant_id', tenantId).is('consumed_at', null);
      if (error) throw new Error(error.message);
    },
  };
}
