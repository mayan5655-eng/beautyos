// lib/billing/referralRepo.ts
//
// SERVER ONLY. The service-role implementation of ReferralRepo (lib/billing/service.ts) over the referral tables of
// supabase/migrations/add_referrals_annual_2026-11-08.sql. The browser roles cannot write any of them; only this file and the signup
// trigger do. Before the migration runs every read answers "nothing" and every write answers "not done", so billing goes on exactly as
// before (a missing table is never an error that stops a charge).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReferralRepo } from './service.ts';
import type { ReferralRow, CreditCandidate } from '../referral.ts';

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const unique = (e: { code?: string; message?: string } | null) => !!e && (e.code === '23505' || /duplicate key|unique/i.test(e.message || ''));
const fail = (e: { message?: string } | null, what: string): never => { throw new Error(`${what}: ${e?.message || 'failed'}`); };

export function supabaseReferralRepo(db: SupabaseClient): ReferralRepo {
  return {
    async referralFor(referredTenantId) {
      const { data, error } = await db.from('referrals').select('id, referrer_tenant_id, referred_tenant_id, status').eq('referred_tenant_id', referredTenantId).maybeSingle();
      if (error) { if (missing(error)) return null; fail(error, 'referralFor'); }
      return (data as ReferralRow | null) || null;
    },
    async countPaidCharges(tenantId) {
      const { count, error } = await db.from('billing_payments').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('kind', 'subscription').eq('status', 'succeeded').gt('amount', 0);
      if (error) fail(error, 'countPaidCharges');
      return count || 0;
    },
    async countReferrerRewardsSince(referrerTenantId, sinceIso) {
      const { count, error } = await db.from('referral_rewards').select('id', { count: 'exact', head: true })
        .eq('tenant_id', referrerTenantId).eq('role', 'referrer').is('voided_at', null).gte('created_at', sinceIso);
      if (error) { if (missing(error)) return 0; fail(error, 'countReferrerRewardsSince'); }
      return count || 0;
    },
    async insertReward(row) {
      const { error } = await db.from('referral_rewards').insert({ ...row, months: 1 });
      if (!error) return true;
      if (unique(error) || missing(error)) return false;
      return fail(error, 'insertReward');
    },
    async markRewarded(referralId, atIso) {
      const { error } = await db.from('referrals').update({ status: 'rewarded', rewarded_at: atIso }).eq('id', referralId).eq('status', 'joined');
      if (error && !missing(error)) fail(error, 'markRewarded');
    },
    async availableCredits(tenantId, nowIso) {
      const { data, error } = await db.from('referral_rewards').select('id, referral_id, trigger_payment_id, available_at')
        .eq('tenant_id', tenantId).is('consumed_at', null).is('voided_at', null).lte('available_at', nowIso).order('available_at', { ascending: true }).limit(24);
      if (error) { if (missing(error)) return []; fail(error, 'availableCredits'); }
      const rows = (data || []) as { id: string; referral_id: string; trigger_payment_id: string | null; available_at: string }[];
      if (!rows.length) return [];
      const refIds = [...new Set(rows.map((r) => r.referral_id))];
      const payIds = [...new Set(rows.map((r) => r.trigger_payment_id).filter(Boolean))] as string[];
      const [refs, pays] = await Promise.all([
        db.from('referrals').select('id, status').in('id', refIds),
        payIds.length ? db.from('billing_payments').select('id, status').in('id', payIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (refs.error) fail(refs.error, 'availableCredits referrals');
      if (pays.error) fail(pays.error, 'availableCredits payments');
      const refStatus = new Map(((refs.data || []) as { id: string; status: string }[]).map((r) => [r.id, r.status]));
      const payStatus = new Map(((pays.data || []) as { id: string; status: string }[]).map((p) => [p.id, p.status]));
      return rows.map((r): CreditCandidate => ({
        id: r.id,
        referral_status: refStatus.get(r.referral_id) ?? null,
        // A payment row that is gone (deleted, or never there) does not stand.
        payment_status: r.trigger_payment_id ? payStatus.get(r.trigger_payment_id) ?? null : null,
      }));
    },
    async claimCredit(rewardId, subId, periodStart, periodEnd, nowIso) {
      // Compare-and-set on consumed_at: of two callers exactly one updates the row. The partial unique index
      // referral_rewards_one_per_period refuses a second month for the same subscription and period.
      const { data, error } = await db.from('referral_rewards')
        .update({ consumed_at: nowIso, consumed_subscription_id: subId, consumed_period_start: periodStart, consumed_period_end: periodEnd })
        .eq('id', rewardId).is('consumed_at', null).is('voided_at', null).select('id');
      if (error) { if (unique(error) || missing(error)) return false; fail(error, 'claimCredit'); }
      return !!(data && data.length === 1);
    },
    async creditForPeriod(subId, periodStart) {
      const { data, error } = await db.from('referral_rewards').select('id').eq('consumed_subscription_id', subId).eq('consumed_period_start', periodStart).not('consumed_at', 'is', null).limit(1);
      if (error) { if (missing(error)) return false; fail(error, 'creditForPeriod'); }
      return !!(data && data.length);
    },
    async voidReward(rewardId, reason, nowIso) {
      const { error } = await db.from('referral_rewards').update({ voided_at: nowIso, void_reason: reason.slice(0, 200) }).eq('id', rewardId).is('consumed_at', null).is('voided_at', null);
      if (error && !missing(error)) fail(error, 'voidReward');
    },
  };
}
