// lib/billing/repo.ts
//
// SERVER ONLY. The service-role implementation of BillingRepo (lib/billing/service.ts). Every statement names the tenant or the subscription it
// acts for. The billing tables are written only here (the browser roles can only read their own rows, without the token reference), and they are
// deliberately NOT in the trial gate: a blocked tenant must still be able to reach billing to pay.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingRepo, Subscription, PaymentRecord, TenantRow } from './service.ts';

const num = (v: unknown) => Number(v);
const subOf = (r: Record<string, unknown>): Subscription => ({ ...(r as unknown as Subscription), price: num(r.price), failed_attempts: Number(r.failed_attempts) || 0 });
const payOf = (r: Record<string, unknown>): PaymentRecord => ({ ...(r as unknown as PaymentRecord), amount: num(r.amount) });
const fail = (e: { message?: string } | null, what: string) => { throw new Error(`${what}: ${e?.message || 'failed'}`); };

export function supabaseBillingRepo(db: SupabaseClient): BillingRepo {
  return {
    async getSub(tenantId) {
      const { data, error } = await db.from('billing_subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getSub');
      return data ? subOf(data) : null;
    },
    async listSubs() {
      const { data, error } = await db.from('billing_subscriptions').select('*').order('created_at', { ascending: true }).limit(2000);
      if (error) fail(error, 'listSubs');
      return (data || []).map(subOf);
    },
    async insertSub(row) {
      const { data, error } = await db.from('billing_subscriptions').insert(row).select('*').single();
      if (error || !data) fail(error, 'insertSub');
      return subOf(data as Record<string, unknown>);
    },
    async updateSub(id, patch) {
      const { error } = await db.from('billing_subscriptions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) fail(error, 'updateSub');
    },
    async claimAttempt(id, previous, now) {
      const q = db.from('billing_subscriptions').update({ last_attempt_at: now }).eq('id', id);
      const { data, error } = await (previous === null ? q.is('last_attempt_at', null) : q.eq('last_attempt_at', previous)).select('id');
      if (error) fail(error, 'claimAttempt');
      return !!(data && data.length === 1);
    },
    async hasSucceeded(subId, periodStart) {
      const { data, error } = await db.from('billing_payments').select('id').eq('subscription_id', subId).eq('period_start', periodStart).eq('status', 'succeeded').eq('kind', 'subscription').limit(1);
      if (error) fail(error, 'hasSucceeded');
      return !!(data && data.length);
    },
    async insertPayment(row) {
      const { data, error } = await db.from('billing_payments').insert(row).select('*').single();
      if (error || !data) fail(error, 'insertPayment');
      return payOf(data as Record<string, unknown>);
    },
    async updatePayment(id, patch) {
      const { error } = await db.from('billing_payments').update(patch).eq('id', id);
      if (error) fail(error, 'updatePayment');
    },
    async pendingInvoices() {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await db.from('billing_payments').select('*').eq('status', 'succeeded').eq('kind', 'subscription').eq('invoice_status', 'pending').gte('created_at', since).limit(50);
      if (error) fail(error, 'pendingInvoices');
      return (data || []).map(payOf);
    },
    async getTenant(tenantId) {
      const { data, error } = await db.from('tenants').select('id, name, plan_status, trial_ends_at, plan_price').eq('id', tenantId).maybeSingle();
      if (error) fail(error, 'getTenant');
      return (data || null) as TenantRow | null;
    },
    async setPlanStatus(tenantId, status) {
      const { error } = await db.from('tenants').update({ plan_status: status }).eq('id', tenantId);
      if (error) fail(error, 'setPlanStatus');
    },
  };
}
