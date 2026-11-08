// lib/billing/repo.ts
//
// SERVER ONLY. The service-role implementation of BillingRepo (lib/billing/service.ts). Every statement names the tenant or the subscription it
// acts for. The billing tables are written only here (the browser roles can only read their own rows, without the token reference), and they are
// deliberately NOT in the trial gate: a blocked tenant must still be able to reach billing to pay.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingRepo, Subscription, PaymentRecord, TenantRow } from './service.ts';
import { billingPayerPhone } from './payerPhone.ts';
import { readAllRows } from '../pagedRead.js';

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
      // Every row, paged: one select stops at the server's 1000-row cap without saying so, and the businesses past it were never charged.
      const r = await readAllRows(db, 'billing_subscriptions', { order: ['created_at', 'id'] as unknown as string });
      if (r.error) fail(r.error, 'listSubs');
      if (!r.complete) fail({ message: `listSubs: read ${r.fetched} of ${r.total} subscriptions` }, 'listSubs');
      return (r.data || []).map(subOf);
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
    async findOpenAttempt(subId, periodStart) {
      let q = db.from('billing_payments').select('*').eq('subscription_id', subId).eq('kind', 'subscription').in('status', ['pending', 'unknown']);
      if (periodStart) q = q.eq('period_start', periodStart);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(1);
      // Before add_kalmea_billing_grow.sql the statuses do not exist: nothing is open.
      if (error) return null;
      return data && data[0] ? payOf(data[0] as Record<string, unknown>) : null;
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
      const { data, error } = await db.from('billing_payments').select('*').eq('status', 'succeeded').in('kind', ['subscription', 'addon']).eq('invoice_status', 'pending').gte('created_at', since).limit(50);
      if (error) fail(error, 'pendingInvoices');
      return (data || []).map(payOf);
    },
    async getTenant(tenantId) {
      const { data, error } = await db.from('tenants').select('id, name, plan_status, trial_ends_at, plan_price, created_at').eq('id', tenantId).maybeSingle();
      if (error) fail(error, 'getTenant');
      if (!data) return null;
      // The payer's phone for the token charge: the same source as the card page (app/api/billing/card). A read failure leaves it
      // empty, which chargeToken refuses as before; it never blocks reading the tenant itself.
      const st = await db.from('settings').select('business_phone, automations').eq('tenant_id', tenantId).maybeSingle();
      const autos = (st.data?.automations && typeof st.data.automations === 'object' ? st.data.automations : {}) as Record<string, unknown>;
      // Only an Israeli mobile counts, with the SMS-verified one as the last fallback (lib/billing/payerPhone.ts, 2026-11-02 audit).
      const phone = await billingPayerPhone(db, tenantId, [autos.owner_phone, st.data?.business_phone]);
      return { ...(data as TenantRow), phone } as TenantRow;
    },
    async insertAddon(row) {
      const { error } = await db.from('billing_addons').insert(row);
      if (error) fail(error, 'insertAddon');
    },
    async coveredByAnnual(subId, periodStart) {
      // add_referrals_annual_2026-11-08.sql adds period_months; before it runs there is no yearly charge to find.
      const { data, error } = await db.from('billing_payments').select('id').eq('subscription_id', subId).eq('kind', 'subscription').eq('status', 'succeeded')
        .eq('period_months', 12).lte('period_start', periodStart).gt('period_end', periodStart).limit(1);
      // Fail closed: only a MISSING column (the migration has not run, so no yearly charge can exist) means "not covered". Any other
      // read error throws, and the run charges nothing for her this time (a paid year may cover this date).
      if (error) {
        if (error.code === '42703' || /period_months.*does not exist|does not exist.*period_months|schema cache/i.test(error.message || '')) return false;
        fail(error, 'coveredByAnnual');
      }
      return !!(data && data.length);
    },
    async setPlanStatus(tenantId, status) {
      const { error } = await db.from('tenants').update({ plan_status: status }).eq('id', tenantId);
      if (error) fail(error, 'setPlanStatus');
    },
  };
}
