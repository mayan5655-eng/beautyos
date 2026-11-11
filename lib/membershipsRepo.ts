// lib/membershipsRepo.ts
//
// SERVER ONLY. The service-role implementation of MembershipRepo (lib/memberships.ts) over the tables of
// supabase/migrations/add_client_memberships_2026-11-11.sql, plus the two shared Grow tables it writes like the cancellation fees do
// (grow_card_tokens for the sealed card, grow_token_charges for the ledger-first identifier). Every statement names the tenant it acts
// for, except the three lookups that START from an unguessable value (the client's link id, Grow's process id) and the daily run.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LedgerRow } from './grow/tokenCharge.ts';
import { planState } from './planState.ts';
import type { TenantPlanRow } from './planState.ts';
import type { Membership, MembershipRepo, Period, Plan, PlanSnapshot, Redemption, StoredToken } from './memberships.ts';

const fail = (e: { message?: string } | null, what: string): never => { throw new Error(`${what}: ${e?.message || 'failed'}`); };

const snap = (raw: unknown): PlanSnapshot => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { name: String(r.name || ''), price: Number(r.price) || 0, credits: Number(r.credits) || 0, rollover: r.rollover === true, min_months: Number(r.min_months) || 0, services: Array.isArray(r.services) ? r.services.map(String) : [] };
};
const plan = (r: Record<string, unknown>): Plan => ({ ...(r as unknown as Plan), price: Number(r.price), credits: Number(r.credits), min_months: Number(r.min_months) || 0, rollover: r.rollover === true, services: Array.isArray(r.services) ? (r.services as unknown[]).map(String) : [], active: r.active !== false });
const mem = (r: Record<string, unknown>): Membership => ({ ...(r as unknown as Membership), plan: snap(r.plan), failed_attempts: Number(r.failed_attempts) || 0, anchor_day: r.anchor_day == null ? null : Number(r.anchor_day) });
const per = (r: Record<string, unknown>): Period => ({ ...(r as unknown as Period), amount: Number(r.amount), credits: Number(r.credits), attempts: Number(r.attempts) || 0 });
const red = (r: Record<string, unknown>): Redemption => ({ ...(r as unknown as Redemption), seq: Number(r.seq), status: (r.status as Redemption['status']) || 'used' });

export function supabaseMembershipRepo(db: SupabaseClient): MembershipRepo {
  return {
    async getAccount(tenantId) {
      const { data, error } = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getAccount');
      return (data || null) as { user_id: string; enabled: boolean } | null;
    },
    async tenantActive(tenantId) {
      // The same rules as public.is_tenant_active() (lib/planState.ts mirrors them), read for ANY tenant with the service role: the
      // daily run has no session. Fails open, like the database: an unreadable row never closes a paying business.
      const { data, error } = await db.from('tenants').select('plan_status, trial_started_at, trial_ends_at').eq('id', tenantId).maybeSingle();
      if (error || !data) return true;
      return !planState(data as TenantPlanRow).isBlocked;
    },
    async businessName(tenantId) {
      const { data } = await db.from('settings').select('business_name').eq('tenant_id', tenantId).maybeSingle();
      return String((data as { business_name?: unknown } | null)?.business_name || '').trim();
    },
    async listPlans(tenantId) {
      const { data, error } = await db.from('membership_plans').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true });
      if (error) fail(error, 'listPlans');
      return (data || []).map((r) => plan(r as Record<string, unknown>));
    },
    async getPlan(tenantId, planId) {
      const { data, error } = await db.from('membership_plans').select('*').eq('tenant_id', tenantId).eq('id', planId).maybeSingle();
      if (error) fail(error, 'getPlan');
      return data ? plan(data as Record<string, unknown>) : null;
    },
    async insertPlan(row) {
      const { data, error } = await db.from('membership_plans').insert(row).select('*').single();
      if (error || !data) fail(error, 'insertPlan');
      return plan(data as Record<string, unknown>);
    },
    async updatePlan(tenantId, planId, patch) {
      const { data, error } = await db.from('membership_plans').update({ ...patch, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', planId).select('*');
      if (error) fail(error, 'updatePlan');
      return data && data[0] ? plan(data[0] as Record<string, unknown>) : null;
    },
    async getClient(tenantId, clientId) {
      const { data, error } = await db.from('clients').select('id, name, phone').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle();
      if (error) fail(error, 'getClient');
      return (data || null) as { id: string; name: string | null; phone: string | null } | null;
    },
    async insertMembership(row) {
      const { data, error } = await db.from('client_memberships').insert(row).select('*').single();
      if (error || !data) fail(error, 'insertMembership');
      return mem(data as Record<string, unknown>);
    },
    async getMembership(tenantId, membershipId) {
      const { data, error } = await db.from('client_memberships').select('*').eq('tenant_id', tenantId).eq('id', membershipId).maybeSingle();
      if (error) fail(error, 'getMembership');
      return data ? mem(data as Record<string, unknown>) : null;
    },
    async findMembershipByLink(linkId) {
      if (!/^[0-9a-f]{48}$/.test(String(linkId || ''))) return null;
      const { data, error } = await db.from('client_memberships').select('*').eq('link_id', linkId).limit(2);
      if (error) fail(error, 'findMembershipByLink');
      return data && data.length === 1 ? mem(data[0] as Record<string, unknown>) : null;
    },
    async findMembershipByProcess(processId) {
      if (!processId) return null;
      const { data, error } = await db.from('client_memberships').select('*').eq('process_id', processId).limit(2);
      if (error) fail(error, 'findMembershipByProcess');
      return data && data.length === 1 ? mem(data[0] as Record<string, unknown>) : null;
    },
    async listMemberships(tenantId, f = {}) {
      let q = db.from('client_memberships').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(500);
      if (f.clientId) q = q.eq('client_id', f.clientId);
      if (f.statuses) q = q.in('status', f.statuses);
      const { data, error } = await q;
      if (error) fail(error, 'listMemberships');
      return (data || []).map((r) => mem(r as Record<string, unknown>));
    },
    async updateMembership(tenantId, membershipId, patch, from) {
      let q = db.from('client_memberships').update({ ...patch, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', membershipId);
      if (from) q = q.in('status', from);
      const { data, error } = await q.select('*');
      if (error) fail(error, 'updateMembership');
      return data && data[0] ? mem(data[0] as Record<string, unknown>) : null;
    },
    async listDue(today) {
      const [a, b] = await Promise.all([
        db.from('client_memberships').select('*').eq('status', 'active').lte('next_charge_on', today).limit(1000),
        db.from('client_memberships').select('*').eq('status', 'past_due').lte('next_retry_on', today).limit(1000),
      ]);
      if (a.error) fail(a.error, 'listDue');
      if (b.error) fail(b.error, 'listDue');
      return [...(a.data || []), ...(b.data || [])].map((r) => mem(r as Record<string, unknown>));
    },
    async listStaleCharging(beforeIso) {
      const { data, error } = await db.from('membership_periods').select('*').eq('status', 'charging').lt('updated_at', beforeIso).limit(200);
      if (error) fail(error, 'listStaleCharging');
      return (data || []).map((r) => per(r as Record<string, unknown>));
    },
    async insertPeriod(row) {
      const { data, error } = await db.from('membership_periods').insert(row).select('*').single();
      if (error) { if (error.code === '23505') return null; fail(error, 'insertPeriod'); }
      return data ? per(data as Record<string, unknown>) : null;
    },
    async getPeriodByStart(tenantId, membershipId, periodStart) {
      const { data, error } = await db.from('membership_periods').select('*').eq('tenant_id', tenantId).eq('membership_id', membershipId).eq('period_start', periodStart).maybeSingle();
      if (error) fail(error, 'getPeriodByStart');
      return data ? per(data as Record<string, unknown>) : null;
    },
    async findPeriodByPayment(tenantId, paymentId) {
      const { data, error } = await db.from('membership_periods').select('*').eq('tenant_id', tenantId).eq('grow_payment_id', paymentId).limit(2);
      if (error) fail(error, 'findPeriodByPayment');
      return data && data.length === 1 ? per(data[0] as Record<string, unknown>) : null;
    },
    async releasePeriodReservations(tenantId, periodId) {
      const { data, error } = await db.from('membership_redemptions').update({ status: 'released' }).eq('tenant_id', tenantId).eq('period_id', periodId).eq('status', 'reserved').select('id');
      if (error) fail(error, 'releasePeriodReservations');
      return (data || []).length;
    },
    async transitionPeriod(tenantId, periodId, from, patch, expectAttempts) {
      let q = db.from('membership_periods').update({ ...patch, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', periodId).in('status', from);
      if (expectAttempts !== undefined) q = q.eq('attempts', expectAttempts);
      const { data, error } = await q.select('*');
      if (error) fail(error, 'transitionPeriod');
      return data && data[0] ? per(data[0] as Record<string, unknown>) : null;
    },
    async listPeriods(tenantId, membershipIds) {
      if (!membershipIds.length) return [];
      const { data, error } = await db.from('membership_periods').select('*').eq('tenant_id', tenantId).in('membership_id', membershipIds).order('period_start', { ascending: true }).limit(2000);
      if (error) fail(error, 'listPeriods');
      return (data || []).map((r) => per(r as Record<string, unknown>));
    },
    async listRedemptions(tenantId, membershipIds) {
      if (!membershipIds.length) return [];
      const { data, error } = await db.from('membership_redemptions').select('*').eq('tenant_id', tenantId).in('membership_id', membershipIds).limit(5000);
      if (error) fail(error, 'listRedemptions');
      return (data || []).map((r) => red(r as Record<string, unknown>));
    },
    async insertRedemption(row) {
      const { data, error } = await db.from('membership_redemptions').insert(row).select('*').single();
      if (error) {
        if (error.code === '23505') {
          const text = `${error.message || ''} ${(error as { details?: string }).details || ''}`;
          return { row: null, conflict: /receipt/i.test(text) ? 'receipt' : 'seq' };
        }
        fail(error, 'insertRedemption');
      }
      return { row: data ? red(data as Record<string, unknown>) : null, conflict: null };
    },
    async findRedemptionByReceipt(tenantId, receiptId) {
      const { data, error } = await db.from('membership_redemptions').select('*').eq('tenant_id', tenantId).eq('receipt_id', receiptId).maybeSingle();
      if (error) fail(error, 'findRedemptionByReceipt');
      return data ? red(data as Record<string, unknown>) : null;
    },
    async findRedemptionByPayment(tenantId, paymentId) {
      const { data, error } = await db.from('membership_redemptions').select('*').eq('tenant_id', tenantId).eq('grow_payment_id', paymentId).maybeSingle();
      if (error) fail(error, 'findRedemptionByPayment');
      return data ? red(data as Record<string, unknown>) : null;
    },
    async updateRedemption(tenantId, redemptionId, from, patch) {
      const { data, error } = await db.from('membership_redemptions').update(patch).eq('tenant_id', tenantId).eq('id', redemptionId).in('status', from).select('*');
      if (error) { if (error.code === '23505') return null; fail(error, 'updateRedemption'); }
      return data && data[0] ? red(data[0] as Record<string, unknown>) : null;
    },
    async releaseExpiredReservations(nowIso, scope) {
      let q = db.from('membership_redemptions').update({ status: 'released' }).eq('status', 'reserved').lt('reserved_until', nowIso);
      if (scope) q = q.eq('tenant_id', scope.tenantId).eq('membership_id', scope.membershipId);
      const { data, error } = await q.select('id');
      if (error) fail(error, 'releaseExpiredReservations');
      return (data || []).length;
    },
    async listOpenReservations() {
      const { data, error } = await db.from('membership_redemptions').select('*').eq('status', 'reserved').not('grow_payment_id', 'is', null).limit(1000);
      if (error) fail(error, 'listOpenReservations');
      return (data || []).map((r) => red(r as Record<string, unknown>));
    },
    async paymentState(tenantId, paymentId) {
      const { data, error } = await db.from('grow_payments').select('status, receipt_id').eq('tenant_id', tenantId).eq('id', paymentId).maybeSingle();
      if (error) fail(error, 'paymentState');
      return (data || null) as { status: string; receipt_id: string | null } | null;
    },
    async claimCharge(tenantId, read, nowIso, staleBeforeIso) {
      // Exactly the state this run read, and no fresh lock: anything else and nothing changes (null), so the run skips.
      let q = db.from('client_memberships').update({ charge_lock_at: nowIso, updated_at: nowIso })
        .eq('tenant_id', tenantId).eq('id', read.id).eq('status', read.status).eq('failed_attempts', read.failed_attempts)
        .or(`charge_lock_at.is.null,charge_lock_at.lt."${staleBeforeIso}"`);
      q = read.next_charge_on ? q.eq('next_charge_on', read.next_charge_on) : q.is('next_charge_on', null);
      q = read.next_retry_on ? q.eq('next_retry_on', read.next_retry_on) : q.is('next_retry_on', null);
      const { data, error } = await q.select('*');
      if (error) fail(error, 'claimCharge');
      return data && data.length === 1 ? mem(data[0] as Record<string, unknown>) : null;
    },
    async insertToken(row) {
      const { data, error } = await db.from('grow_card_tokens').insert(row).select('id').single();
      if (error || !data) fail(error, 'insertToken');
      return { id: String((data as { id: unknown }).id) };
    },
    async getToken(tenantId, tokenId) {
      const { data, error } = await db.from('grow_card_tokens').select('id, tenant_id, client_id, token_ref, token_encrypted, revoked_at').eq('tenant_id', tenantId).eq('id', tokenId).maybeSingle();
      if (error) fail(error, 'getToken');
      if (!data || (data as { revoked_at?: unknown }).revoked_at) return null;
      return data as unknown as StoredToken;
    },
    // The same ledger as every other saved-card charge: the identifier is written BEFORE Grow is called and is unique across all rows.
    async insertCharge(row) {
      const { data, error } = await db.from('grow_token_charges').insert(row).select('*').single();
      if (error) { if (error.code === '23505') return null; fail(error, 'insertCharge'); }
      return data ? ({ ...(data as Record<string, unknown>), amount: Number((data as { amount: unknown }).amount), unique_identifier: Number((data as { unique_identifier: unknown }).unique_identifier) } as unknown as LedgerRow) : null;
    },
    async updateCharge(id, patch) {
      const { error } = await db.from('grow_token_charges').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) fail(error, 'updateCharge');
    },
  };
}
