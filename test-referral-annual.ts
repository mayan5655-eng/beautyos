// The two growth features on Kalmea's own billing, with an in-memory database, the mock provider and a fake clock. No network, no
// real card, no real charge.
//   flags OFF: the billing run is exactly as before (a pending yearly switch and an earned month are both ignored, nothing new is written)
//   annual: a yearly renewal (one charge of 10 months' price for 12 months), a monthly-to-annual switch at renewal only, a past-due retry
//           keeps its amount, the agreed price still wins, a lost yearly reply settles as yearly
//   referral: the first paid charge earns both sides a month, held 14 days; each month is used exactly once in place of a charge; two
//           concurrent runs; a refunded / voided first payment grants nothing usable; self, ineligible, not-first and over-the-cap cases
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newMockToken, createMockAdapters } from './lib/billing/adapter.ts';
import { saveCard, runDue, requestPeriodSwitch, chargePeriodOf, addMonths, grantReferralMonths } from './lib/billing/service.ts';
import type { BillingRepo, ReferralRepo, Subscription, PaymentRecord, TenantRow, Deps } from './lib/billing/service.ts';
import { PLAN_PRICES, ANNUAL_PLAN_PRICES, ANNUAL_MONTHS_PAID, annualPriceOf, annualPlanEnabled } from './lib/pricing.ts';
import { referralsEnabled, REFERRAL_HOLD_DAYS, REFERRAL_MAX_PER_YEAR, newReferralCode, normalizeReferralCode, referralStats, referralWhatsAppHref, REFERRAL_CODE_ALPHABET } from './lib/referral.ts';
import type { ReferralRow, RewardRow } from './lib/referral.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const DAY = 24 * 3600 * 1000;
const read = (p: string) => readFileSync(p, 'utf8');

type Reward = RewardRow & { consumed_subscription_id: string | null; consumed_period_start: string | null; created_at: string };

function world(start: string) {
  let now = new Date(start);
  const tenants = new Map<string, TenantRow>();
  const subs = new Map<string, Subscription>();
  const payments: PaymentRecord[] = [];
  const referrals: ReferralRow[] = [];
  const rewards: Reward[] = [];
  const calls: string[] = [];
  let seq = 0;
  const isSuccessDup = (row: Partial<PaymentRecord>, id?: string) => row.kind === 'subscription' && payments.some((p) => p.id !== id && p.subscription_id === row.subscription_id && p.period_start === row.period_start && p.status === 'succeeded' && p.kind === 'subscription');
  const repo: BillingRepo = {
    async getSub(t) { const s = [...subs.values()].find((x) => x.tenant_id === t); return s ? { ...s } : null; },
    async listSubs() { return [...subs.values()].map((s) => ({ ...s })); },
    async insertSub(row) { const s = { id: `s${++seq}`, ...row } as Subscription; subs.set(s.id, s); return { ...s }; },
    async updateSub(id, patch) { Object.assign(subs.get(id)!, patch); },
    async claimAttempt(id, previous, at) { const s = subs.get(id)!; if ((s.last_attempt_at ?? null) !== previous) return false; s.last_attempt_at = at; return true; },
    async hasSucceeded(subId, period) { return payments.some((p) => p.subscription_id === subId && p.period_start === period && p.status === 'succeeded' && p.kind === 'subscription'); },
    async coveredByAnnual(subId, period) { return payments.some((p) => p.subscription_id === subId && p.kind === 'subscription' && p.status === 'succeeded' && p.period_months === 12 && p.period_start! <= period && p.period_end! > period); },
    async insertPayment(row) {
      if (row.status === 'succeeded' && isSuccessDup(row)) throw new Error('unique violation: one success per period');
      const p = { id: `p${++seq}`, created_at: now.toISOString(), ...row } as PaymentRecord; payments.push(p); return { ...p };
    },
    async updatePayment(id, patch) {
      const row = payments.find((p) => p.id === id)!;
      if (patch.status === 'succeeded' && isSuccessDup(row, id)) throw new Error('unique violation: one success per period');
      Object.assign(row, patch);
    },
    async findOpenAttempt(subId, period) { return [...payments].reverse().find((p) => p.subscription_id === subId && (period === null || p.period_start === period) && (p.status === 'pending' || p.status === 'unknown')) || null; },
    async pendingInvoices() { return payments.filter((p) => p.status === 'succeeded' && p.invoice_status === 'pending'); },
    async getTenant(id) { const t = tenants.get(id); return t ? { ...t } : null; },
    async setPlanStatus(id, status) { tenants.get(id)!.plan_status = status; },
  };
  // The same rules as the referral tables: unique (referral_id, role), one used month per (subscription, period), compare-and-set claims.
  const refRepo: ReferralRepo = {
    async referralFor(t) { calls.push('referralFor'); return referrals.find((r) => r.referred_tenant_id === t) || null; },
    async countPaidCharges(t) { calls.push('countPaidCharges'); return payments.filter((p) => p.tenant_id === t && p.kind === 'subscription' && p.status === 'succeeded' && p.amount > 0).length; },
    async countReferrerRewardsSince(t, since) { calls.push('countReferrerRewardsSince'); return rewards.filter((r) => r.tenant_id === t && r.role === 'referrer' && !r.voided_at && r.created_at >= since).length; },
    async insertReward(row) {
      calls.push('insertReward');
      if (rewards.some((r) => r.referral_id === row.referral_id && r.role === row.role)) return false;
      rewards.push({ id: `r${++seq}`, consumed_at: null, voided_at: null, consumed_subscription_id: null, consumed_period_start: null, created_at: now.toISOString(), ...row });
      return true;
    },
    async markRewarded(id) { calls.push('markRewarded'); const r = referrals.find((x) => x.id === id)!; if (r.status === 'joined') r.status = 'rewarded'; },
    async availableCredits(t, at) {
      calls.push('availableCredits');
      return rewards.filter((r) => r.tenant_id === t && !r.consumed_at && !r.voided_at && r.available_at <= at).sort((a, b) => a.available_at.localeCompare(b.available_at))
        .map((r) => ({ id: r.id, referral_status: referrals.find((x) => x.id === r.referral_id)?.status ?? null, payment_status: payments.find((p) => p.id === r.trigger_payment_id)?.status ?? null }));
    },
    async claimCredit(id, subId, start, _end, at) {
      calls.push('claimCredit');
      const r = rewards.find((x) => x.id === id)!;
      if (r.consumed_at || r.voided_at) return false;
      if (rewards.some((x) => x.consumed_at && x.consumed_subscription_id === subId && x.consumed_period_start === start)) return false;
      Object.assign(r, { consumed_at: at, consumed_subscription_id: subId, consumed_period_start: start });
      return true;
    },
    async creditForPeriod(subId, start) { calls.push('creditForPeriod'); return rewards.some((x) => x.consumed_at && x.consumed_subscription_id === subId && x.consumed_period_start === start); },
    async voidReward(id, _reason, at) { calls.push('voidReward'); const r = rewards.find((x) => x.id === id)!; if (!r.consumed_at && !r.voided_at) r.voided_at = at; },
  };
  const adapters = createMockAdapters('https://preview.kalmea.test', (t) => `signed:${t}`);
  const charges: { amount: number; description: string }[] = [];
  const payments_ = { ...adapters.payments, async charge(i: Parameters<typeof adapters.payments.charge>[0]) { charges.push({ amount: i.amount, description: i.description }); return adapters.payments.charge(i); } };
  const deps = (over: Partial<Deps> = {}): Deps => ({ repo, referrals: refRepo, payments: payments_, invoicing: adapters.invoicing, now: () => now, flags: { referrals: true, annual: true }, ...over });
  return {
    repo, refRepo, tenants, subs, payments, referrals, rewards, calls, charges, deps,
    plus: (days: number) => { now = new Date(now.getTime() + days * DAY); },
    at: (s: string) => { now = new Date(s); },
    now: () => now,
    addTenant: (id: string, row: Partial<TenantRow> = {}) => tenants.set(id, { id, name: `עסק ${id}`, plan_status: 'active', trial_ends_at: null, plan_price: null, ...row }),
    /** An active subscription with a good card, due at `due`. */
    addSub: (tenantId: string, due: string, over: Partial<Subscription> = {}) => {
      const s: Subscription = { id: `s${++seq}`, tenant_id: tenantId, price: PLAN_PRICES.launch, status: 'active', next_charge_at: due, token_ref: newMockToken('ok'), card_last4: '4242', card_brand: 'Visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null, ...over };
      subs.set(s.id, s); return s;
    },
    sub: (tenantId: string) => [...subs.values()].find((s) => s.tenant_id === tenantId)!,
  };
}

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'; // the referrer
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'; // the business she brought
const OFF = { referrals: false, annual: false };
const subPays = (w: ReturnType<typeof world>, t: string) => w.payments.filter((p) => p.tenant_id === t && p.kind === 'subscription');

// ── prices and flags ──────────────────────────────────────────────────────────
await ok('annual = 10 monthly prices (4,990 regular, 3,490 launch), and both flags are OFF unless exactly "1"', () => {
  assert.equal(ANNUAL_MONTHS_PAID, 10);
  assert.deepEqual(ANNUAL_PLAN_PRICES, { regular: 4990, launch: 3490 });
  assert.equal(annualPriceOf(299), 2990, 'an agreed monthly price gives her yearly price');
  for (const v of [undefined, '', 'true', '0', 'on']) {
    assert.equal(annualPlanEnabled({ NEXT_PUBLIC_ANNUAL_PLAN: v }), false);
    assert.equal(referralsEnabled({ NEXT_PUBLIC_REFERRALS: v }), false);
  }
  assert.equal(annualPlanEnabled({ NEXT_PUBLIC_ANNUAL_PLAN: '1' }), true);
  assert.equal(referralsEnabled({ NEXT_PUBLIC_REFERRALS: '1' }), true);
  // The test runner forces both off, like every money switch.
  const runner = read('scripts/run-tests.mjs');
  assert.ok(/NEXT_PUBLIC_REFERRALS: ''/.test(runner) && /NEXT_PUBLIC_ANNUAL_PLAN: ''/.test(runner));
});

await ok('a referral code is 10 characters from a 32-letter alphabet with no 0/O/1/I, and normalises', () => {
  assert.equal(REFERRAL_CODE_ALPHABET.length, 32);
  assert.ok(!/[0O1I]/.test(REFERRAL_CODE_ALPHABET));
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) { const c = newReferralCode(); assert.match(c, /^[A-HJ-NP-Z2-9]{10}$/); seen.add(c); }
  assert.equal(seen.size, 2000, 'random');
  assert.equal(normalizeReferralCode(' k7mq2xrt9p '), 'K7MQ2XRT9P');
  for (const bad of ['', 'K7MQ2XRT9', 'K7MQ2XRT9PP', 'K7MQ2XRT0P', "K7'Q2XRT9P", 42, null]) assert.equal(normalizeReferralCode(bad), null);
  const href = referralWhatsAppHref('https://kalmea.co.il/signup?ref=K7MQ2XRT9P');
  assert.ok(href.startsWith('https://wa.me/?text='), 'wa.me only: she sends it herself');
  assert.ok(decodeURIComponent(href).includes('signup?ref=K7MQ2XRT9P'));
  assert.ok(!/[–—]/.test(decodeURIComponent(href)), 'no long dashes in the copy');
});

// ── flags OFF: exactly as before ─────────────────────────────────────────────
await ok('flags OFF: the billing run charges exactly as before, ignoring a pending yearly switch and an earned month', async () => {
  // The same business twice: once plain (as before the features), once with a pending switch, an earned month and a referral.
  const run = async (withExtras: boolean) => {
    const w = world('2027-01-01T08:00:00Z');
    w.addTenant(A); w.addTenant(B);
    w.addSub(A, '2027-01-01T06:00:00Z', withExtras ? { billing_period: 'monthly', pending_period: 'annual' } : {});
    w.addSub(B, '2027-01-01T06:00:00Z');
    if (withExtras) {
      w.referrals.push({ id: 'ref1', referrer_tenant_id: A, referred_tenant_id: B, status: 'joined' });
      w.rewards.push({ id: 'rw', referral_id: 'ref0', tenant_id: A, role: 'referrer', trigger_payment_id: null, available_at: '2026-01-01T00:00:00Z', consumed_at: null, voided_at: null, consumed_subscription_id: null, consumed_period_start: null, created_at: '2026-01-01T00:00:00Z' });
    }
    const d = withExtras ? w.deps({ flags: OFF }) : w.deps({ flags: OFF, referrals: undefined });
    const s1 = await runDue(d);
    w.plus(31); const s2 = await runDue(d);
    return { w, sums: [s1, s2] };
  };
  const base = await run(false);
  const off = await run(true);
  assert.deepEqual(off.sums, base.sums, 'the same summary');
  assert.ok(!('credited' in off.sums[0]), 'no new summary field');
  const shape = (w: ReturnType<typeof world>) => w.payments.map((p) => ({ t: p.tenant_id, amount: p.amount, start: p.period_start, end: p.period_end, status: p.status, months: p.period_months }));
  assert.deepEqual(shape(off.w), shape(base.w), 'the same charges, amounts and periods');
  assert.ok(off.w.payments.every((p) => p.amount === PLAN_PRICES.launch && p.period_months === undefined), 'monthly, and no period_months written');
  assert.equal(off.w.sub(A).pending_period, 'annual', 'the pending switch is left alone, not applied');
  assert.equal(off.w.sub(A).next_charge_at, base.w.sub(A).next_charge_at);
  assert.deepEqual(off.w.calls, [], 'the referral tables are never even read');
  assert.equal(off.w.rewards.length, 1, 'no month granted for B\'s first charge');
  assert.equal(off.w.rewards[0].consumed_at, null, 'and the earned month is not used');
  assert.equal(await requestPeriodSwitch(off.w.deps({ flags: OFF }), A, 'annual').then((r) => r.ok), false, 'no switch accepted');
});

// ── annual ──────────────────────────────────────────────────────────────────
await ok('annual renewal: one charge of 10 months\' price pays 12 calendar months; nothing in between; then the next year', async () => {
  const w = world('2027-01-15T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-15T06:00:00Z', { billing_period: 'annual' });
  const s = await runDue(w.deps());
  assert.equal(s.charged, 1);
  const [p] = subPays(w, A);
  assert.equal(p.amount, ANNUAL_PLAN_PRICES.launch);
  assert.equal(p.period_months, 12);
  assert.equal(p.period_start, '2027-01-15'); assert.equal(p.period_end, '2028-01-15');
  assert.equal(w.sub(A).next_charge_at, '2028-01-15T06:00:00.000Z');
  assert.equal(w.charges[0].description, 'מנוי שנתי לקלמיה');
  for (let m = 0; m < 11; m++) { w.plus(30); await runDue(w.deps()); }
  assert.equal(subPays(w, A).length, 1, 'no charge inside the paid year');
  w.at('2028-01-15T08:00:00Z');
  await runDue(w.deps());
  assert.equal(subPays(w, A).length, 2);
  assert.equal(subPays(w, A)[1].period_end, '2029-01-15');
  assert.equal(addMonths(new Date('2028-02-29T06:00:00Z'), 12).toISOString().slice(0, 10), '2029-02-28', 'a leap day clamps, never skips');
});

await ok('a monthly charge is refused while a paid year still covers its date', async () => {
  const w = world('2027-03-01T08:00:00Z');
  w.addTenant(A);
  const sub = w.addSub(A, '2027-03-01T06:00:00Z', { billing_period: 'monthly' });
  // A paid year from February (as if written by an earlier run), with next_charge_at wrongly left on March.
  w.payments.push({ id: 'py', tenant_id: A, subscription_id: sub.id, kind: 'subscription', status: 'succeeded', amount: 3490, currency: 'ILS', period_start: '2027-02-01', period_end: '2028-02-01', period_months: 12, attempt: 1, provider: 'card', provider_payment_id: 'x', error: null, invoice_status: 'issued', invoice_number: null, invoice_url: null, note: null, created_at: '2027-02-01T00:00:00Z' });
  const s = await runDue(w.deps());
  assert.equal(s.charged, 0); assert.equal(w.charges.length, 0);
});

await ok('monthly to annual: the switch waits for the renewal (no charge now, no double charge), then one yearly charge', async () => {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-01T06:00:00Z');
  await runDue(w.deps());
  assert.equal(subPays(w, A)[0].amount, PLAN_PRICES.launch);
  w.plus(10);
  const r = await requestPeriodSwitch(w.deps(), A, 'annual');
  assert.deepEqual(r, { ok: true, billingPeriod: 'monthly', pendingPeriod: 'annual', effectiveAt: '2027-02-01T06:00:00.000Z' });
  await runDue(w.deps());
  assert.equal(w.charges.length, 1, 'nothing is charged when she switches');
  assert.equal(chargePeriodOf(w.sub(A), { annual: true }), 'annual');
  w.at('2027-02-01T08:00:00Z');
  await runDue(w.deps());
  const pays = subPays(w, A);
  assert.equal(pays.length, 2);
  assert.equal(pays[1].amount, ANNUAL_PLAN_PRICES.launch); assert.equal(pays[1].period_end, '2028-02-01');
  assert.equal(w.sub(A).billing_period, 'annual'); assert.equal(w.sub(A).pending_period, null);
  // And back: asking for monthly waits for the end of the paid year; asking again for annual clears it.
  assert.equal((await requestPeriodSwitch(w.deps(), A, 'monthly') as { pendingPeriod: string }).pendingPeriod, 'monthly');
  assert.equal((await requestPeriodSwitch(w.deps(), A, 'annual') as { pendingPeriod: string | null }).pendingPeriod, null);
});

await ok('a failed renewal that applied the switch is retried for the same yearly period; she may switch back while past due', async () => {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-01T06:00:00Z', { token_ref: newMockToken('decline'), pending_period: 'annual' });
  await runDue(w.deps());
  assert.equal(subPays(w, A)[0].amount, ANNUAL_PLAN_PRICES.launch, 'her renewal applied the switch');
  assert.equal(w.sub(A).status, 'past_due');
  assert.equal(w.sub(A).billing_period, 'annual'); assert.equal(w.sub(A).pending_period, null);
  w.plus(1); await runDue(w.deps());
  assert.equal(subPays(w, A)[1].amount, ANNUAL_PLAN_PRICES.launch, 'the retry is the same period and amount');
  assert.equal(subPays(w, A)[1].status, 'failed');
  // A yearly amount her card refuses: she goes back to monthly, and the next retry (day 3) is monthly, for the same unpaid period.
  await requestPeriodSwitch(w.deps(), A, 'monthly');
  w.subs.get(w.sub(A).id)!.token_ref = newMockToken('ok');
  w.at('2027-01-04T08:00:00Z'); await runDue(w.deps());
  const pays = subPays(w, A);
  assert.equal(pays.length, 3); assert.equal(pays[2].status, 'succeeded');
  assert.equal(pays[2].amount, PLAN_PRICES.launch); assert.equal(pays[2].period_start, '2027-01-01'); assert.equal(pays[2].period_end, '2027-02-01');
  assert.equal(w.sub(A).billing_period, 'monthly');
  assert.equal(pays.filter((p) => p.status === 'succeeded').length, 1, 'one success for that period');
});

await ok('her agreed price still wins: an agreed 299 a month is 2,990 a year', async () => {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A, { plan_status: 'trial', trial_ends_at: '2027-01-01T12:00:00Z', plan_price: 299 });
  await saveCard(w.deps(), A, { tokenRef: newMockToken('ok'), last4: '4242' });
  await requestPeriodSwitch(w.deps(), A, 'annual');
  await runDue(w.deps());
  assert.equal(subPays(w, A)[0].amount, 2990);
});

await ok('a yearly charge whose reply was lost settles as yearly (12 months), never as a second charge', async () => {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-01T06:00:00Z', { pending_period: 'annual' });
  let lost = true;
  const d0 = w.deps();
  const flaky = { ...d0.payments, async charge(i: Parameters<typeof d0.payments.charge>[0]) { const r = await d0.payments.charge(i); return lost ? { ok: false as const, code: 'unreachable' as const, error: 'timeout' } : r; }, async lookup(t: string, u: number) { return lost ? { ok: true as const, found: false, status: 'pending' as const } : d0.payments.lookup!(t, u); } };
  // The money moved but the answer never came: the row stays unknown.
  const lookupUnknown = { ...flaky, async lookup() { return { ok: false as const, error: 'down' }; } };
  await runDue(w.deps({ payments: lookupUnknown }));
  assert.equal(subPays(w, A)[0].status, 'unknown');
  lost = false;
  w.plus(1); await runDue(w.deps({ payments: flaky }));
  const pays = subPays(w, A);
  assert.equal(pays.length, 1, 'no second charge');
  assert.equal(pays[0].status, 'succeeded');
  assert.equal(w.sub(A).next_charge_at, '2028-01-01T06:00:00.000Z');
  assert.equal(w.sub(A).billing_period, 'annual');
});

// ── referral free months ──────────────────────────────────────────────────────
/** A referred B in trial (card saved), A already paying monthly. */
function referralWorld() {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-05T06:00:00Z');
  w.addTenant(B, { plan_status: 'trial', trial_ends_at: '2027-01-02T06:00:00Z' });
  w.addSub(B, '2027-01-02T06:00:00Z', { status: 'trialing' });
  w.referrals.push({ id: 'ref1', referrer_tenant_id: A, referred_tenant_id: B, status: 'joined' });
  return w;
}

await ok('nothing at signup or during the trial; the FIRST paid charge earns both sides one month, held 14 days', async () => {
  const w = referralWorld();
  assert.equal(w.rewards.length, 0, 'nothing for joining');
  await runDue(w.deps()); // B's trial ends tomorrow: charged now
  assert.equal(subPays(w, B)[0].status, 'succeeded');
  assert.equal(w.rewards.length, 2);
  assert.deepEqual(w.rewards.map((r) => [r.tenant_id, r.role]).sort(), [[A, 'referrer'], [B, 'referred']].sort());
  assert.ok(w.rewards.every((r) => r.available_at === new Date(w.now().getTime() + REFERRAL_HOLD_DAYS * DAY).toISOString()));
  assert.equal(w.referrals[0].status, 'rewarded');
  // A's charge on the 5th falls inside the hold: she pays it.
  w.at('2027-01-05T08:00:00Z'); await runDue(w.deps());
  assert.equal(subPays(w, A).length, 1);
});

await ok('each month is used exactly once in place of a charge: skipped, no payment row, the period moves one month', async () => {
  const w = referralWorld();
  await runDue(w.deps());
  w.at('2027-01-05T08:00:00Z'); await runDue(w.deps());          // A pays (hold)
  w.at('2027-02-02T08:00:00Z');                                  // B's second month and A's are both past the hold
  const s = await runDue(w.deps());
  assert.equal(s.credited, 1, 'B uses her month');
  assert.equal(subPays(w, B).length, 1, 'no payment row for the free month');
  assert.equal(w.sub(B).next_charge_at, '2027-03-02T06:00:00.000Z');
  w.at('2027-02-05T08:00:00Z');
  assert.equal((await runDue(w.deps())).credited, 1, 'A uses hers');
  assert.equal(subPays(w, A).length, 1);
  assert.equal(w.sub(A).next_charge_at, '2027-03-05T06:00:00.000Z');
  assert.ok(w.rewards.every((r) => r.consumed_at));
  // A second run the same day, and the following months: charged as usual, never another free month.
  await runDue(w.deps());
  w.at('2027-03-02T08:00:00Z'); await runDue(w.deps());
  w.at('2027-03-05T08:00:00Z'); await runDue(w.deps());
  assert.equal(subPays(w, B).length, 2); assert.equal(subPays(w, A).length, 2);
  assert.equal(w.rewards.length, 2, 'B\'s second paid charge earns nothing more');
  assert.equal(await grantReferralMonths(w.deps(), B, subPays(w, B)[0], w.now()), 'none', 'granting again is a no-op');
});

await ok('two concurrent billing runs: one charge per period, one month used, never both', async () => {
  const w = referralWorld();
  await Promise.all([runDue(w.deps()), runDue(w.deps())]);
  assert.equal(subPays(w, B).filter((p) => p.status === 'succeeded').length, 1);
  assert.equal(w.charges.length, 1);
  assert.equal(w.rewards.length, 2, 'granted once');
  w.at('2027-02-02T08:00:00Z');
  await Promise.all([runDue(w.deps()), runDue(w.deps()), runDue(w.deps())]);
  // Both are due now (A's charge of 5 Jan never ran in this world): each uses her ONE month, once.
  assert.equal(w.rewards.filter((r) => r.consumed_at && r.tenant_id === B).length, 1, 'one month used by B');
  assert.equal(w.rewards.filter((r) => r.consumed_at && r.tenant_id === A).length, 1, 'one month used by A');
  assert.equal(w.charges.length, 1, 'and no charge for either month');
  assert.equal(new Set(w.rewards.map((r) => r.consumed_period_start)).size, 2);
  // The run that stopped after the claim, before moving the date: the next run finishes it without a second month or a charge.
  const w2 = referralWorld();
  await runDue(w2.deps());
  w2.at('2027-02-02T08:00:00Z');
  const before = w2.sub(B).next_charge_at;
  const stuck = { ...w2.repo, async updateSub() { throw new Error('crash after the claim'); } };
  await runDue(w2.deps({ repo: stuck }));
  assert.equal(w2.sub(B).next_charge_at, before);
  assert.equal(subPays(w2, B).length, 1, 'no charge in the run that stopped after the claim');
  await runDue(w2.deps());
  assert.equal(w2.rewards.filter((r) => r.consumed_at && r.tenant_id === B).length, 1, 'still one month for B');
  assert.equal(subPays(w2, B).length, 1);
  assert.equal(w2.sub(B).next_charge_at, '2027-03-02T06:00:00.000Z');
});

await ok('a refunded first payment grants nothing usable: both months are voided and both pay as usual', async () => {
  const w = referralWorld();
  await runDue(w.deps());
  // Refunded inside the hold: the earning charge no longer stands.
  w.payments.find((p) => p.tenant_id === B)!.status = 'refunded' as PaymentRecord['status'];
  w.at('2027-01-05T08:00:00Z'); await runDue(w.deps());
  w.at('2027-02-02T08:00:00Z'); await runDue(w.deps());
  w.at('2027-02-05T08:00:00Z'); await runDue(w.deps());
  assert.ok(w.rewards.every((r) => r.voided_at && !r.consumed_at), 'voided, never used');
  assert.equal(subPays(w, B).filter((p) => p.status === 'succeeded').length, 1, 'B pays her second month');
  assert.equal(subPays(w, A).length, 2, 'A pays too');
  // The admin's void (a refund done in Grow): the same.
  const w2 = referralWorld();
  await runDue(w2.deps());
  w2.referrals[0].status = 'voided';
  w2.at('2027-02-02T08:00:00Z'); await runDue(w2.deps());
  assert.ok(w2.rewards.find((r) => r.tenant_id === B)!.voided_at);
  assert.equal(subPays(w2, B).length, 2);
});

await ok('no reward: ineligible (same owner, email or mobile), not her first paid charge, herself, or a payment that is not a card charge', async () => {
  const w = referralWorld();
  w.referrals[0].status = 'ineligible';
  await runDue(w.deps());
  assert.equal(w.rewards.length, 0, 'ineligible');
  const w2 = referralWorld();
  w2.payments.push({ id: 'old', tenant_id: B, subscription_id: w2.sub(B).id, kind: 'subscription', status: 'succeeded', amount: 349, currency: 'ILS', period_start: '2026-06-01', period_end: '2026-07-01', attempt: 1, provider: 'card', provider_payment_id: 'x', error: null, invoice_status: 'issued', invoice_number: null, invoice_url: null, note: null, created_at: '2026-06-01T00:00:00Z' });
  await runDue(w2.deps());
  assert.equal(w2.rewards.length, 0, 'she had paid before: this is not her first charge');
  const w3 = referralWorld();
  w3.referrals[0].referrer_tenant_id = B;
  await runDue(w3.deps());
  assert.equal(w3.rewards.length, 0, 'herself');
  assert.equal(await grantReferralMonths(w.deps(), B, { id: 'm', kind: 'manual', amount: 349, status: 'succeeded' }, w.now()), 'none', 'a manual payment');
});

await ok('the referrer\'s cap: past REFERRAL_MAX_PER_YEAR months in 365 days she earns no more; the new business still gets hers', async () => {
  const w = referralWorld();
  for (let i = 0; i < REFERRAL_MAX_PER_YEAR; i++) w.rewards.push({ id: `c${i}`, referral_id: `old${i}`, tenant_id: A, role: 'referrer', trigger_payment_id: null, available_at: '2026-12-01T00:00:00Z', consumed_at: '2026-12-02T00:00:00Z', voided_at: null, consumed_subscription_id: 'x', consumed_period_start: `2026-12-${String(i + 1).padStart(2, '0')}`, created_at: '2026-12-01T00:00:00Z' });
  await runDue(w.deps());
  const fresh = w.rewards.filter((r) => r.referral_id === 'ref1');
  assert.deepEqual(fresh.map((r) => r.role), ['referred']);
});

await ok('a yearly subscriber\'s free month moves her renewal one month, and her plan stays yearly', async () => {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-01T06:00:00Z', { billing_period: 'annual' });
  w.referrals.push({ id: 'ref9', referrer_tenant_id: A, referred_tenant_id: B, status: 'rewarded' });
  w.payments.push({ id: 'pb', tenant_id: B, subscription_id: 'sb', kind: 'subscription', status: 'succeeded', amount: 349, currency: 'ILS', period_start: '2026-12-01', period_end: '2027-01-01', attempt: 1, provider: 'card', provider_payment_id: 'x', error: null, invoice_status: 'issued', invoice_number: null, invoice_url: null, note: null, created_at: '2026-12-01T00:00:00Z' });
  w.rewards.push({ id: 'rw9', referral_id: 'ref9', tenant_id: A, role: 'referrer', trigger_payment_id: 'pb', available_at: '2026-12-15T00:00:00Z', consumed_at: null, voided_at: null, consumed_subscription_id: null, consumed_period_start: null, created_at: '2026-12-01T00:00:00Z' });
  assert.equal((await runDue(w.deps())).credited, 1);
  assert.equal(w.sub(A).next_charge_at, '2027-02-01T06:00:00.000Z');
  assert.equal(w.sub(A).billing_period, 'annual');
  w.at('2027-02-01T08:00:00Z'); await runDue(w.deps());
  assert.equal(subPays(w, A)[0].amount, ANNUAL_PLAN_PRICES.launch);
  assert.equal(subPays(w, A)[0].period_end, '2028-02-01');
});

/** console.error lines while fn runs (moneyAlert logs there when there is no database, as in tests). */
async function captureErrors(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.error = orig; }
  return lines;
}

await ok('a referral error AFTER a successful charge never undoes it (granting the months is after the money)', async () => {
  const w = referralWorld();
  const broken: ReferralRepo = { ...w.refRepo, async referralFor() { throw new Error('db down'); } };
  const s = await runDue(w.deps({ referrals: broken }));
  assert.equal(s.charged, 1);
  assert.equal(subPays(w, B)[0].status, 'succeeded');
});

await ok('FAIL CLOSED: a month claimed, the renewal update failed, and the next run cannot read the claim: no Grow charge, a money alert', async () => {
  const w = referralWorld();
  await runDue(w.deps());                                         // B's first paid charge earns the months
  w.at('2027-02-02T08:00:00Z');
  const stuck = { ...w.repo, async updateSub() { throw new Error('crash after the claim'); } };
  await runDue(w.deps({ repo: stuck }));                          // B's month is claimed, the date does not move
  assert.equal(w.rewards.filter((r) => r.consumed_at && r.tenant_id === B).length, 1);
  const chargesBefore = w.charges.length;
  const unreadable: ReferralRepo = { ...w.refRepo, async creditForPeriod() { throw new Error('db read failed'); }, async availableCredits() { throw new Error('db read failed'); } };
  const errs = await captureErrors(async () => { await runDue(w.deps({ referrals: unreadable })); });
  assert.equal(w.charges.length, chargesBefore, 'Grow is never called for the period the month already covers');
  assert.equal(subPays(w, B).length, 1, 'no payment row either');
  // Logged, and the money alert is raised (moneyAlert throttles per business and period, so here the claim run's alert already went).
  assert.ok(errs.some((l) => /\[billing\] free month check failed for tenant/.test(l) && /db read failed/.test(l)), 'reported');
  assert.ok(/'free month check failed; nothing charged this run, the next run retries'/.test(read('lib/billing/service.ts')), 'with its money alert');
  // Healthy again: the next run finishes moving the date with that same month. Still no charge, no second month.
  await runDue(w.deps());
  assert.equal(w.charges.length, chargesBefore);
  assert.equal(w.rewards.filter((r) => r.consumed_at && r.tenant_id === B).length, 1);
  assert.equal(w.sub(B).next_charge_at, '2027-03-02T06:00:00.000Z');
});

await ok('FAIL CLOSED: an unreadable list of months charges nobody this run; the next healthy run charges once', async () => {
  const w = referralWorld();
  const broken: ReferralRepo = { ...w.refRepo, async availableCredits() { throw new Error('db down'); } };
  const errs = await captureErrors(async () => { await runDue(w.deps({ referrals: broken })); });
  assert.equal(w.charges.length, 0);
  assert.ok(errs.some((l) => /money-alert/.test(l)));
  await runDue(w.deps());
  assert.equal(w.charges.length, 1);
  assert.equal(subPays(w, B).filter((p) => p.status === 'succeeded').length, 1);
});

await ok('FAIL CLOSED: an unreadable "is this date inside a paid year" charges nothing (the run reports it)', async () => {
  const w = world('2027-03-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-03-01T06:00:00Z', { billing_period: 'annual' });
  const repo = { ...w.repo, async coveredByAnnual(): Promise<boolean> { throw new Error('coveredByAnnual: db down'); } };
  const errs = await captureErrors(async () => { await runDue(w.deps({ repo })); });
  assert.equal(w.charges.length, 0);
  // runDue's own catch reports it (and raises its money alert, throttled per business, so it may already have fired in this file).
  assert.ok(errs.some((l) => /\[billing\] run failed for tenant/.test(l) && /coveredByAnnual/.test(l)));
  // The real repo: only a missing period_months column (migration not run) reads as "not covered"; anything else throws.
  const src = read('lib/billing/repo.ts');
  const fn = src.slice(src.indexOf('async coveredByAnnual'), src.indexOf('async setPlanStatus'));
  assert.ok(/42703/.test(fn) && /fail\(error, 'coveredByAnnual'\)/.test(fn) && !/if \(error\) return false;/.test(fn));
});

await ok('an unknown yearly charge that settles later keeps a switch back to monthly she asked for meanwhile', async () => {
  const w = world('2027-01-01T08:00:00Z');
  w.addTenant(A);
  w.addSub(A, '2027-01-01T06:00:00Z', { pending_period: 'annual' });
  const d0 = w.deps();
  let settled = false;
  const flaky = {
    ...d0.payments,
    async charge(i: Parameters<typeof d0.payments.charge>[0]) { await d0.payments.charge(i); return { ok: false as const, code: 'unreachable' as const, error: 'timeout' }; },
    async lookup(t: string, u: number) { return settled ? d0.payments.lookup!(t, u) : { ok: false as const, error: 'down' }; },
  };
  await runDue(w.deps({ payments: flaky }));                      // the yearly charge goes out, the answer never comes
  assert.equal(subPays(w, A)[0].status, 'unknown'); assert.equal(subPays(w, A)[0].period_months, 12);
  assert.equal(w.sub(A).billing_period, 'annual'); assert.equal(w.sub(A).pending_period, null);
  // Meanwhile she asks to go back to monthly.
  assert.equal((await requestPeriodSwitch(w.deps(), A, 'monthly') as { pendingPeriod: string }).pendingPeriod, 'monthly');
  settled = true;
  w.plus(1); await runDue(w.deps({ payments: flaky }));          // Grow now says the yearly charge was paid
  assert.equal(subPays(w, A)[0].status, 'succeeded');
  assert.equal(w.sub(A).billing_period, 'annual', 'the paid year stands');
  assert.equal(w.sub(A).pending_period, 'monthly', 'her later request is kept');
  assert.equal(w.sub(A).next_charge_at, '2028-01-01T06:00:00.000Z');
  w.at('2028-01-01T08:00:00Z'); await runDue(w.deps());           // the next renewal is monthly
  const pays = subPays(w, A);
  assert.equal(pays.length, 2);
  assert.equal(pays[1].amount, PLAN_PRICES.launch); assert.equal(pays[1].period_months, undefined); assert.equal(pays[1].period_end, '2028-02-01');
  assert.equal(w.sub(A).billing_period, 'monthly'); assert.equal(w.sub(A).pending_period, null);
});

await ok('Settings counts only: joined, paid, months earned / used / waiting, no names', () => {
  const now = new Date('2027-02-01T00:00:00Z');
  const st = referralStats(
    [{ status: 'joined' }, { status: 'rewarded' }, { status: 'ineligible' }, { status: 'voided' }],
    [{ available_at: '2027-01-01T00:00:00Z', consumed_at: '2027-01-20T00:00:00Z', voided_at: null }, { available_at: '2027-03-01T00:00:00Z', consumed_at: null, voided_at: null }, { available_at: '2027-01-01T00:00:00Z', consumed_at: null, voided_at: '2027-01-02T00:00:00Z' }],
    now,
  );
  assert.deepEqual(st, { joined: 2, paid: 1, earned: 2, used: 1, waiting: 1, available: 0 });
});

// ── wiring pins ──────────────────────────────────────────────────────────────
await ok('wiring: the cron passes the referral repo; the routes check their flags, the session tenant and the rate limit', () => {
  assert.ok(/referrals: supabaseReferralRepo\(db\)/.test(read('app/api/billing/charge-due/route.ts')));
  const me = read('app/api/referrals/me/route.ts');
  assert.ok(/referralsEnabled\(\)/.test(me) && /callerTenantId\(/.test(me) && !/searchParams|request\.json/.test(me), 'her tenant from the session only');
  assert.ok(/isDemoTenantId/.test(me) && /requireActiveTenant/.test(me));
  assert.ok(!/\bname\b/.test(me.replace(/\/\/.*$/gm, '')), 'no business names leave this route');
  const lookup = read('app/api/referrals/lookup/route.ts');
  assert.ok(/checkIpLimit\(request, 'referral-lookup'\)/.test(lookup) && /referralsEnabled\(\)/.test(lookup));
  assert.ok(/valid: true/.test(lookup) && !/tenant_id: |name/.test(lookup.replace(/\/\/.*$/gm, '').split('NextResponse.json').slice(1).join('')), 'the lookup answers valid or not, nothing about the business');
  const period = read('app/api/billing/period/route.ts');
  assert.ok(/annualPlanEnabled\(\)/.test(period) && /requestPeriodSwitch/.test(period) && /consent !== true/.test(period));
  const adminRoute = read('app/api/admin/referrals/route.ts');
  assert.ok(/requirePlatformAdmin\(\)/.test(adminRoute.split('export async function POST')[1].slice(0, 200)));
  const card = read('app/BusinessReferralCard.jsx');
  assert.ok(/const on = referralsEnabled\(\);/.test(card) && /if \(!on\) return;\s*\n\s*let alive/.test(card), 'with the flag off the card fetches nothing');
  assert.ok(!/wa\.me\/\d/.test(card) && !/fetch\([^)]*send/.test(card), 'share opens her own WhatsApp, Kalmea sends nothing');
  const billingCard = read('app/BillingCard.jsx');
  assert.ok(/\{an && \(/.test(billingCard), 'the annual choice renders only when the status route sends it (flag on)');
  assert.ok(/if \(annualPlanEnabled\(\)\)/.test(read('app/api/billing/status/route.ts')), 'and the route sends it only with the flag');
  const signup = read('app/signup/page.tsx');
  assert.ok(/referralsEnabled\(\)/.test(signup) && /kl_ref/.test(signup));
});

console.log(`test-referral-annual: ${n} ok`);
