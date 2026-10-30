// Kalmea's own subscription billing in MOCK mode, end to end, with an in-memory database and a fake clock:
//   add card -> trial ends -> successful charge -> invoice
//   failed charge -> retries on days 1, 3, 5 -> grace -> blocked (through the existing plan_status gate) -> pay -> unblocked
//   manual "mark paid", cancel and resume, a paused tenant is never touched, the same month is never charged twice.
// Plus the wiring pins: flag default off, mock refused on production, billing reachable while blocked and NOT in the trial gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { billingMode, billingUiEnabled, resolveBilling, newMockToken, createMockAdapters } from './lib/billing/adapter.ts';
import {
  addMonths, saveCard, runDue, cancelSubscription, markPaidManually, priceOf, graceEndsAt, nextRetryAt,
  REGULAR_PRICE, GRACE_DAYS, RETRY_OFFSETS_DAYS,
} from './lib/billing/service.ts';
import type { BillingRepo, Subscription, PaymentRecord, TenantRow, Deps } from './lib/billing/service.ts';
import { signCardSession, verifyCardSession } from './lib/billing/session.ts';
import { planState } from './lib/planState.ts';
import { defaultPlanPrice } from './lib/pricing.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const DAY = 24 * 3600 * 1000;

// ── an in-memory database that behaves like the real tables ──────────────────
function world(start: string) {
  let now = new Date(start);
  const tenants = new Map<string, TenantRow>();
  const subs = new Map<string, Subscription & Record<string, unknown>>();
  const payments: PaymentRecord[] = [];
  let seq = 0;
  const repo: BillingRepo = {
    async getSub(t) { return [...subs.values()].find((s) => s.tenant_id === t) || null; },
    async listSubs() { return [...subs.values()]; },
    async insertSub(row) { const s = { id: `s${++seq}`, ...row } as Subscription & Record<string, unknown>; subs.set(s.id, s); return s; },
    async updateSub(id, patch) { Object.assign(subs.get(id)!, patch); },
    async claimAttempt(id, previous, at) { const s = subs.get(id)!; if ((s.last_attempt_at ?? null) !== previous) return false; s.last_attempt_at = at; return true; },
    async hasSucceeded(subId, period) { return payments.some((p) => p.subscription_id === subId && p.period_start === period && p.status === 'succeeded' && p.kind === 'subscription'); },
    async insertPayment(row) {
      if (row.status === 'succeeded' && row.kind === 'subscription' && payments.some((p) => p.subscription_id === row.subscription_id && p.period_start === row.period_start && p.status === 'succeeded' && p.kind === 'subscription')) throw new Error('unique violation: one success per period');
      const p = { id: `p${++seq}`, created_at: now.toISOString(), ...row } as PaymentRecord; payments.push(p); return p;
    },
    async updatePayment(id, patch) {
      // The same partial unique index as the real table (billing_payments_one_success_per_period), on update too: a row turns 'succeeded'
      // only if no other row of its subscription and period already is.
      const row = payments.find((p) => p.id === id)!;
      if (patch.status === 'succeeded' && row.kind === 'subscription' && payments.some((p) => p.id !== id && p.subscription_id === row.subscription_id && p.period_start === row.period_start && p.status === 'succeeded' && p.kind === 'subscription')) throw new Error('unique violation: one success per period');
      Object.assign(row, patch);
    },
    async findOpenAttempt(subId, period) { return [...payments].reverse().find((p) => p.subscription_id === subId && p.period_start === period && (p.status === 'pending' || p.status === 'unknown')) || null; },
    async pendingInvoices() { return payments.filter((p) => p.status === 'succeeded' && p.kind === 'subscription' && p.invoice_status === 'pending'); },
    async getTenant(id) { return tenants.get(id) || null; },
    async setPlanStatus(id, status) { tenants.get(id)!.plan_status = status; },
  };
  const adapters = createMockAdapters('https://preview.kalmea.test', (t) => `signed:${t}`);
  const deps = (over: Partial<Deps> = {}): Deps => ({ repo, payments: adapters.payments, invoicing: adapters.invoicing, now: () => now, ...over });
  return {
    repo, tenants, subs, payments, deps,
    at: (iso: string) => { now = new Date(iso); },
    plus: (days: number) => { now = new Date(now.getTime() + days * DAY); },
    now: () => now,
    addTenant: (id: string, row: Partial<TenantRow> = {}) => tenants.set(id, { id, name: `עסק ${id}`, plan_status: 'trial', trial_ends_at: null, plan_price: null, ...row }),
  };
}

const T = '11111111-1111-1111-1111-111111111111';
const OK = () => ({ tokenRef: newMockToken('ok'), last4: '4242', brand: 'Visa' });
const BAD = () => ({ tokenRef: newMockToken('decline'), last4: '0002', brand: 'Visa' });

// ── mode, flag, production guard ─────────────────────────────────────────────
await ok('mock is the default mode; the billing screens are OFF unless BILLING_UI_ENABLED is on', () => {
  assert.equal(billingMode({}), 'mock'); assert.equal(billingMode({ BILLING_MODE: 'live' }), 'live'); assert.equal(billingMode({ BILLING_MODE: 'nonsense' }), 'mock');
  assert.equal(billingUiEnabled({}), false); assert.equal(billingUiEnabled({ BILLING_UI_ENABLED: 'false' }), false); assert.equal(billingUiEnabled({ BILLING_UI_ENABLED: 'true' }), true);
});

await ok('mock needs no keys and no network; it is refused on Vercel production; live is not configured without the GROW_BILLING_* keys', () => {
  const m = resolveBilling({}, 'https://x.test', () => 's');
  assert.equal(m.configured, true); assert.ok(m.payments && m.invoicing);
  assert.equal(resolveBilling({ VERCEL_ENV: 'production' }, 'https://x.test').configured, false);
  assert.equal(resolveBilling({ VERCEL_ENV: 'preview' }, 'https://x.test').configured, false, 'previews share the production database: no mock unless allowed');
  assert.equal(resolveBilling({ VERCEL_ENV: 'preview', BILLING_MOCK_ALLOWED: 'true' }, 'https://x.test').configured, true);
  const live = resolveBilling({ BILLING_MODE: 'live', VERCEL_ENV: 'production' });
  assert.equal(live.mode, 'live'); assert.equal(live.configured, false); assert.equal(live.payments, null);
});

await ok('the mock card page token is signed, expires, and names only its own business', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const tok = signCardSession(T, 1_000);
  assert.equal(verifyCardSession(tok, 2_000), T);
  assert.equal(verifyCardSession(tok, 1_000 + 31 * 60 * 1000), null, 'expired');
  assert.equal(verifyCardSession(tok.replace(T, '22222222-2222-2222-2222-222222222222'), 2_000), null, 'another business');
  assert.equal(verifyCardSession(tok.slice(0, -2) + 'zz', 2_000), null, 'tampered');
  assert.equal(verifyCardSession('', 0), null);
});

await ok('month arithmetic clamps: 31 Jan + 1 month is the end of February, never March', () => {
  assert.equal(addMonths(new Date('2026-01-31T05:00:00Z'), 1).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(addMonths(new Date('2028-01-31T05:00:00Z'), 1).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(addMonths(new Date('2026-11-30T05:00:00Z'), 3).toISOString().slice(0, 10), '2027-02-28');
  assert.equal(addMonths(new Date('2026-10-18T05:00:00Z'), 1).toISOString().slice(0, 10), '2026-11-18');
});

// ── trial -> card -> first charge -> invoice ─────────────────────────────────
await ok('add card during the trial -> trialing, price from her agreed price or the launch 349, nothing charged yet', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { trial_ends_at: '2026-11-10T08:00:00Z', plan_price: 349 });
  const r = await saveCard(w.deps(), T, OK());
  assert.equal(r.subscription.status, 'trialing'); assert.equal(r.subscription.price, 349); assert.equal(r.charged, null);
  assert.equal(r.subscription.next_charge_at, '2026-11-10T08:00:00.000Z'); assert.equal(r.subscription.card_last4, '4242');
  assert.equal(w.payments.length, 0);
  const w2 = world('2026-11-01T08:00:00Z'); w2.addTenant(T, { trial_ends_at: '2026-11-10T08:00:00Z' });
  // No agreed price: the launch price while it is open (owner 2026-10-25: the card says 349, so 349 is charged).
  assert.equal((await saveCard(w2.deps(), T, OK())).subscription.price, 349);
  assert.equal(priceOf(null), 349);
  assert.equal(REGULAR_PRICE, 499);
  // Once a cutoff is set: on or before it keeps 349, after it (or no signup date) pays the regular price.
  assert.equal(defaultPlanPrice('2026-10-20T10:00:00Z', '2026-12-01T00:00:00Z'), 349);
  assert.equal(defaultPlanPrice('2026-12-02T10:00:00Z', '2026-12-01T00:00:00Z'), 499);
  assert.equal(defaultPlanPrice(null, '2026-12-01T00:00:00Z'), 499);
});

await ok('the cron charges one day before the trial ends: active, next charge a month after the trial, one invoice', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { trial_ends_at: '2026-11-10T08:00:00Z', plan_price: 349 });
  await saveCard(w.deps(), T, OK());
  w.at('2026-11-09T05:00:00Z');
  assert.equal((await runDue(w.deps())).charged, 0, '27 hours before the end: nothing yet');
  w.at('2026-11-10T05:00:00Z');                       // the run inside the last 24 hours, 3 hours before the trial ends
  const sum = await runDue(w.deps());
  assert.equal(sum.charged, 1);
  const sub = (await w.repo.getSub(T))!;
  assert.equal(sub.status, 'active'); assert.equal(sub.next_charge_at, '2026-12-10T08:00:00.000Z'); assert.equal(sub.failed_attempts, 0);
  assert.equal(w.tenants.get(T)!.plan_status, 'active');
  assert.equal(planState(w.tenants.get(T)!, new Date('2026-11-20T00:00:00Z')).isBlocked, false, 'the existing gate reads her as active, past the old trial end');
  assert.equal(w.payments.length, 1);
  const p = w.payments[0];
  assert.equal(p.status, 'succeeded'); assert.equal(p.amount, 349); assert.equal(p.invoice_status, 'issued'); assert.ok(p.invoice_number && p.invoice_url);
  assert.equal(p.period_start, '2026-11-10'); assert.equal(p.period_end, '2026-12-10');
});

await ok('the same month is never charged twice: two runs at once, and a repeated run', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { trial_ends_at: '2026-11-02T08:00:00Z' });
  await saveCard(w.deps(), T, OK());
  w.at('2026-11-02T06:00:00Z');
  const [a, b] = await Promise.all([runDue(w.deps()), runDue(w.deps())]);
  assert.equal(a.charged + b.charged, 1, 'exactly one of two concurrent runs charges');
  await runDue(w.deps());
  assert.equal(w.payments.filter((p) => p.status === 'succeeded').length, 1);
});

await ok('an invoice that could not be issued is retried by the next run, and the charge stands', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { trial_ends_at: '2026-11-02T08:00:00Z' });
  await saveCard(w.deps(), T, OK());
  w.at('2026-11-02T06:00:00Z');
  const down = { async issueInvoice() { return { ok: false as const, error: 'provider down' }; } };
  await runDue(w.deps({ invoicing: down }));
  assert.equal(w.payments[0].status, 'succeeded'); assert.equal(w.payments[0].invoice_status, 'pending');
  w.plus(1);
  const sum = await runDue(w.deps());
  assert.equal(sum.invoices, 1); assert.equal(w.payments[0].invoice_status, 'issued'); assert.ok(w.payments[0].invoice_url);
  assert.equal(w.payments.length, 1, 'no second payment');
});

// ── failure -> retries -> grace -> blocked -> pay -> unblocked ───────────────
await ok('failed charge -> past_due, retries on days 1, 3 and 5, blocked after the 7-day grace, a successful card unblocks at once', async () => {
  assert.deepEqual([...RETRY_OFFSETS_DAYS], [1, 3, 5]); assert.equal(GRACE_DAYS, 7);
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'active', trial_ends_at: null });
  await w.repo.insertSub({ tenant_id: T, price: 499, status: 'active', next_charge_at: '2026-11-10T05:00:00.000Z', token_ref: BAD().tokenRef, card_last4: '0002', card_brand: 'Visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null });

  w.at('2026-11-10T06:00:00Z');                       // day 0: due, refused
  assert.equal((await runDue(w.deps())).failed, 1);
  let sub = (await w.repo.getSub(T))!;
  assert.equal(sub.status, 'past_due'); assert.equal(sub.failed_attempts, 1);
  assert.equal(w.tenants.get(T)!.plan_status, 'active', 'still working during the grace period');
  assert.equal(nextRetryAt(sub)!.toISOString(), '2026-11-11T06:00:00.000Z');
  assert.equal(graceEndsAt(sub)!.toISOString(), '2026-11-17T06:00:00.000Z');

  w.at('2026-11-10T20:00:00Z'); await runDue(w.deps());      // the same day: no retry
  assert.equal((await w.repo.getSub(T))!.failed_attempts, 1);

  w.at('2026-11-11T07:00:00Z'); await runDue(w.deps());      // day 1
  assert.equal((await w.repo.getSub(T))!.failed_attempts, 2);
  w.at('2026-11-12T07:00:00Z'); await runDue(w.deps());      // day 2: nothing
  assert.equal((await w.repo.getSub(T))!.failed_attempts, 2);
  w.at('2026-11-13T07:00:00Z'); await runDue(w.deps());      // day 3
  assert.equal((await w.repo.getSub(T))!.failed_attempts, 3);
  w.at('2026-11-15T07:00:00Z'); await runDue(w.deps());      // day 5
  sub = (await w.repo.getSub(T))!;
  assert.equal(sub.failed_attempts, 4); assert.equal(nextRetryAt(sub), null, 'no more retries');
  assert.equal(w.payments.filter((p) => p.status === 'failed').length, 4);
  assert.equal(w.tenants.get(T)!.plan_status, 'active', 'day 5: still inside the grace period');

  w.at('2026-11-16T07:00:00Z'); await runDue(w.deps());      // day 6
  assert.equal(w.tenants.get(T)!.plan_status, 'active');
  w.at('2026-11-17T07:00:00Z');                              // day 7: grace over
  const sum = await runDue(w.deps());
  assert.equal(sum.blocked, 1); assert.equal(w.tenants.get(T)!.plan_status, 'expired');
  assert.equal(planState(w.tenants.get(T)!, w.now()).isBlocked, true, 'the EXISTING gate now reads her as blocked');

  // she adds a working card: charged immediately, unblocked, history keeps the failures
  const r = await saveCard(w.deps(), T, OK());
  assert.equal(r.charged, 'charged');
  sub = (await w.repo.getSub(T))!;
  assert.equal(sub.status, 'active'); assert.equal(sub.failed_attempts, 0); assert.equal(sub.past_due_since, null);
  assert.equal(sub.next_charge_at, '2026-12-17T07:00:00.000Z');
  assert.equal(w.tenants.get(T)!.plan_status, 'active');
  assert.equal(planState(w.tenants.get(T)!, w.now()).isBlocked, false, 'unblocked at once');
  const last = w.payments[w.payments.length - 1];
  assert.equal(last.status, 'succeeded'); assert.equal(last.invoice_status, 'issued');
  assert.equal(w.payments.filter((p) => p.status === 'failed').length, 4);
});

await ok('a retry that succeeds ends the failure state without any new card', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'active', trial_ends_at: null });
  const s = await w.repo.insertSub({ tenant_id: T, price: 499, status: 'active', next_charge_at: '2026-11-10T05:00:00.000Z', token_ref: BAD().tokenRef, card_last4: '0002', card_brand: 'Visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null });
  w.at('2026-11-10T06:00:00Z'); await runDue(w.deps());
  await w.repo.updateSub(s.id, { token_ref: OK().tokenRef });   // the bank unblocked the card
  w.at('2026-11-11T07:00:00Z');
  assert.equal((await runDue(w.deps())).charged, 1);
  const sub = (await w.repo.getSub(T))!;
  assert.equal(sub.status, 'active'); assert.equal(sub.failed_attempts, 0);
});

await ok('no card on file when it is due: past due, then blocked after the grace period', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'active', trial_ends_at: null });
  const m = await markPaidManually(w.deps(), T);             // pays by hand: a subscription without a card
  assert.equal(m.subscription.token_ref, null);
  w.at(m.subscription.next_charge_at!); w.plus(0.01);
  await runDue(w.deps());
  assert.equal((await w.repo.getSub(T))!.status, 'past_due');
  w.plus(8); await runDue(w.deps());
  assert.equal(w.tenants.get(T)!.plan_status, 'expired');
});

// ── manual payment, cancel, paused ───────────────────────────────────────────
await ok('manual "mark paid": a payment is recorded, the period extends a month, a blocked business is unblocked; paying early loses no days', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'expired', trial_ends_at: '2026-10-01T00:00:00Z', plan_price: 349 });
  const r = await markPaidManually(w.deps(), T, { note: 'העברה בנקאית' });
  assert.equal(w.tenants.get(T)!.plan_status, 'active');
  assert.equal(r.payment.kind, 'manual'); assert.equal(r.payment.amount, 349); assert.equal(r.payment.provider, 'manual'); assert.equal(r.payment.note, 'העברה בנקאית');
  assert.equal(r.subscription.next_charge_at, '2026-12-01T08:00:00.000Z');
  w.plus(10);                                                     // she pays again early
  const r2 = await markPaidManually(w.deps(), T, { amount: 400 });
  assert.equal(r2.subscription.next_charge_at, '2027-01-01T08:00:00.000Z', 'the new month starts where the paid one ends');
  assert.equal(r2.payment.amount, 400);
  assert.equal(w.payments.length, 2);
});

await ok('cancel: she keeps what she paid for, then the existing gate closes; adding a card inside that time resumes; nothing is deleted', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'active', trial_ends_at: null });
  await w.repo.insertSub({ tenant_id: T, price: 499, status: 'active', next_charge_at: '2026-11-20T05:00:00.000Z', token_ref: OK().tokenRef, card_last4: '4242', card_brand: 'Visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null });
  const c = await cancelSubscription(w.deps(), T);
  assert.equal(c.ok, true); assert.equal(c.endsAt, '2026-11-20T05:00:00.000Z');
  w.at('2026-11-19T06:00:00Z'); await runDue(w.deps());
  assert.equal(w.tenants.get(T)!.plan_status, 'active', 'still working until the end of the paid period');
  assert.equal(w.payments.length, 0, 'nothing charged after cancelling');
  const r = await saveCard(w.deps(), T, OK());               // changes her mind
  assert.equal((await w.repo.getSub(T))!.status, 'active'); assert.equal(r.charged, null);
  await cancelSubscription(w.deps(), T);
  w.at('2026-11-21T06:00:00Z'); const sum = await runDue(w.deps());
  assert.equal(sum.blocked, 1); assert.equal(w.tenants.get(T)!.plan_status, 'expired');
  assert.ok(await w.repo.getSub(T), 'the subscription row and history remain');
});

await ok('a paused tenant is an arrangement and is never changed by billing', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'paused', trial_ends_at: null });
  await markPaidManually(w.deps(), T);
  assert.equal(w.tenants.get(T)!.plan_status, 'paused');
  const s = (await w.repo.getSub(T))!;
  await w.repo.updateSub(s.id, { status: 'past_due', past_due_since: '2026-10-01T00:00:00.000Z', failed_attempts: 4 });
  w.at('2026-11-20T00:00:00Z'); await runDue(w.deps());
  assert.equal(w.tenants.get(T)!.plan_status, 'paused');
});

await ok('a tenant that is already active (paying by hand) who adds a card is not charged for the month she already has', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'active', trial_ends_at: null });
  const r = await saveCard(w.deps(), T, OK());
  assert.equal(r.charged, null); assert.equal(w.payments.length, 0);
  assert.equal(r.subscription.status, 'active'); assert.equal(r.subscription.next_charge_at, '2026-12-01T08:00:00.000Z');
});

await ok('a blocked business with no subscription pays by adding a card: charged at once and unblocked', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'expired', trial_ends_at: '2026-10-20T00:00:00Z' });
  const r = await saveCard(w.deps(), T, OK());
  assert.equal(r.charged, 'charged'); assert.equal(w.tenants.get(T)!.plan_status, 'active'); assert.equal(w.payments.length, 1);
});

await ok('a card that is refused at once leaves a blocked business blocked, with the failure on record', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { plan_status: 'expired', trial_ends_at: '2026-10-20T00:00:00Z' });
  const r = await saveCard(w.deps(), T, BAD());
  assert.equal(r.charged, 'failed'); assert.equal(w.tenants.get(T)!.plan_status, 'expired');
  assert.equal(w.payments[0].status, 'failed');
});

// ── wiring (source pins) ─────────────────────────────────────────────────────
await ok('CRITICAL: the billing tables are NOT in the trial gate, and billing routes never use the plan guard', () => {
  const gate = read('trial-gate-policies.sql');
  assert.ok(!/billing_/.test(gate), 'the trial gate does not list the billing tables');
  const mig = read('supabase/migrations/add_kalmea_billing.sql');
  assert.ok(!/create policy [^\n]*_require_active/i.test(mig), 'the migration creates no gate policy');
  for (const f of ['_shared.ts', 'status/route.ts', 'card/route.ts', 'cancel/route.ts', 'mock-card/route.ts', 'charge-due/route.ts']) {
    assert.ok(!/planGuard|requireActiveTenant|is_tenant_active/.test(read(`app/api/billing/${f}`).replace(/^\/\/.*$/gm, '')), `${f} does not use the plan guard (a blocked business must reach billing)`);
  }
});

await ok('no card number is ever stored: only a token reference; the browser role cannot read it', () => {
  const mig = read('supabase/migrations/add_kalmea_billing.sql');
  assert.ok(!/card_number|\bpan\b|cvv|cvc|expiry|exp_month/i.test(mig.replace(/^--.*$/gm, '')), 'no card-data column');
  assert.ok(/token_ref\s+text/.test(mig));
  const grant = mig.match(/grant select \(([^)]*)\)\s+on public\.billing_subscriptions/);
  assert.ok(grant && !/token_ref/.test(grant[1]), 'token_ref is not granted to the browser');
  assert.ok(/revoke all on public\.billing_subscriptions from anon, authenticated/.test(mig) && /billing_payments_one_success_per_period/.test(mig));
  assert.ok(!/\b(insert|update|delete)\b[^;]*to authenticated/i.test(mig.replace(/^--.*$/gm, '')), 'no browser write access');
});

await ok('every signed-in billing route is behind the flag; the cron is protected and does nothing while billing is off', () => {
  assert.ok(/export async function caller\(\) \{\n  const off = uiOff\(\);/.test(read('app/api/billing/_shared.ts')));
  for (const f of ['status', 'card', 'cancel']) assert.ok(/caller\(\)/.test(read(`app/api/billing/${f}/route.ts`)));
  const cron = read('app/api/billing/charge-due/route.ts');
  assert.ok(cron.indexOf('isAuthorizedCron(request)') > 0 && cron.indexOf('isAuthorizedCron(request)') < cron.indexOf('billingUiEnabled()'), 'auth first, then the flag');
  // Parsed, not pattern-matched: Vercel rewrites vercel.json as minified JSON inside its build, so a formatting-sensitive pin fails there.
  const crons = (JSON.parse(read('vercel.json')).crons || []) as { path: string; schedule: string }[];
  assert.equal(crons.find((c) => c.path === '/api/billing/charge-due')?.schedule, '0 5 * * *', 'scheduled daily');
  const mock = read('app/api/billing/mock-card/route.ts');
  assert.ok(/b\.mode !== 'mock' \|\| !b\.configured/.test(mock) && /verifyCardSession/.test(mock), 'the mock page is 404 unless mock is allowed, and needs a signed token');
});

await ok('the admin can list subscriptions and mark paid / set a price, behind the platform-admin check', () => {
  const route = read('app/api/admin/billing/route.ts');
  assert.ok(route.indexOf('requirePlatformAdmin()') > 0 && route.indexOf('requirePlatformAdmin()') < route.indexOf('markPaidManually('));
  assert.ok(/mark-paid/.test(route) && /set-price/.test(route));
  assert.ok(/BillingAdmin/.test(read('app/dashboard/admin/page.tsx')));
  assert.ok(/mark-paid/.test(read('app/dashboard/admin/BillingActions.tsx')) || /'mark-paid'/.test(read('app/dashboard/admin/BillingActions.tsx')));
});

await ok('the UI: the card sits in settings, the banner invites a card from 5 days before the end, the WhatsApp fallback stays', () => {
  const app = read('app/beautyos.jsx');
  assert.ok(/<BillingCard /.test(app) && /<BillingNotices /.test(app));
  const notices = read('app/BillingNotices.jsx');
  assert.ok(/s\.inviteDays \?\? 5/.test(notices) && /הוספת כרטיס אשראי/.test(notices) && /תשלום וחזרה לעבודה/.test(notices));
  const banner = read('app/TrialBanner.jsx');
  assert.ok(/supportWhatsAppUrl\(\)/.test(banner) && /CTA_WHATSAPP_HE/.test(banner), 'the WhatsApp renewal CTA is still there');
});

await ok('a subscription charge asks for a RECEIPT with no VAT (exempt dealer); the amount charged is the amount on the document', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.addTenant(T, { trial_ends_at: '2026-11-10T08:00:00Z', plan_price: 349 });
  const seen: any[] = [];
  const spy = { async issueInvoice(i: any) { seen.push(i); return createMockAdapters('https://preview.kalmea.test', (t) => t).invoicing.issueInvoice(i); } };
  await saveCard(w.deps({ invoicing: spy }), T, OK());
  w.at('2026-11-10T05:00:00Z');
  await runDue(w.deps({ invoicing: spy }));
  assert.equal(seen.length, 1); assert.equal(seen[0].docType, 'receipt'); assert.equal(seen[0].vatAmount, 0); assert.equal(seen[0].amount, 349);
  assert.ok(/[?&]t=r(&|$)/.test(w.payments[0].invoice_url || ''), 'the mock document is a receipt');
});

console.log(`billing: ${n} ok`);
