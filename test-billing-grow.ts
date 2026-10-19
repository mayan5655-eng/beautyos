// Kalmea's own subscription on Kalmea's own Grow account (feat/kalmea-billing): separate credentials, the charge-identifier ledger with the
// same duplicate rules as the client token flow, the consent tick, the Grow callback route. Fake ops and an in-memory repo only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { growBillingCreds, createGrowBillingAdapters, GROW_BILLING_PRODUCTION_BASE } from './lib/billing/growBilling.ts';
import { resolveBilling, createMockAdapters, newMockToken } from './lib/billing/adapter.ts';
import type { PaymentsAdapter, ChargeInput, ChargeResult, LookupResult } from './lib/billing/adapter.ts';
import { saveCard, runDue } from './lib/billing/service.ts';
import type { BillingRepo, Subscription, PaymentRecord, TenantRow, Deps } from './lib/billing/service.ts';
import { billingConsentTextHe } from './lib/billing/consent.ts';
import type { GrowOps } from './lib/grow/ops.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

// ── credentials: GROW_BILLING_* only ─────────────────────────────────────────
await ok('the billing account reads only GROW_BILLING_*; the platform keys never configure it', () => {
  const platformOnly = { GROW_API_KEY: 'P', GROW_PAGE_CODE: 'P', GROW_TOKEN_API_KEY: 'T', GROW_TOKEN_PAGE_CODE: 'T', GROW_TOKEN_USER_ID_TEST: 'T', GROW_TOKEN_API_KEY_TEST: 'T', GROW_TOKEN_PAGE_CODE_TEST: 'T' };
  const none = growBillingCreds(platformOnly);
  assert.equal(none.creds, null);
  assert.deepEqual(none.missing, ['GROW_BILLING_USER_ID', 'GROW_BILLING_API_KEY', 'GROW_BILLING_PAGE_CODE']);
  const c = growBillingCreds({ GROW_BILLING_USER_ID: 'kalmea1', GROW_BILLING_API_KEY: 'K', GROW_BILLING_PAGE_CODE: 'PG' }).creds!;
  assert.equal(c.userId, 'kalmea1'); assert.equal(c.userIdOverride, 'kalmea1', 'every call is for Kalmea\'s own business');
  assert.equal(c.env, 'sandbox');
  assert.equal(growBillingCreds({ GROW_BILLING_USER_ID: 'k', GROW_BILLING_API_KEY: 'K', GROW_BILLING_PAGE_CODE: 'P', GROW_BILLING_ENV: 'production' }).creds!.apiBase, GROW_BILLING_PRODUCTION_BASE);
  assert.equal(growBillingCreds({ GROW_BILLING_USER_ID: 'k', GROW_BILLING_API_KEY: 'K', GROW_BILLING_PAGE_CODE: 'P', GROW_BILLING_API_BASE: 'http://x' }).creds, null);
  const g = src('lib/billing/growBilling.ts');
  assert.ok(!/['"]GROW_(API_KEY|PAGE_CODE|TOKEN_)/.test(g), 'no platform variable is read in the billing provider');
  for (const f of ['lib/grow/config.ts', 'lib/grow/tokenFlow.ts', 'lib/grow/adapter.ts']) assert.ok(!src(f).includes('GROW_BILLING_'), `${f} never reads the billing keys`);
});

await ok('BILLING_MODE stays mock by default; live is configured only with the billing keys; mock never on production', () => {
  assert.equal(resolveBilling({}, 'https://x.test', () => 's').mode, 'mock');
  assert.equal(resolveBilling({ BILLING_MODE: 'live' }).configured, false);
  assert.equal(resolveBilling({ BILLING_MODE: 'live', GROW_BILLING_USER_ID: 'k', GROW_BILLING_API_KEY: 'K', GROW_BILLING_PAGE_CODE: 'P' }).configured, true);
  assert.equal(resolveBilling({ VERCEL_ENV: 'production' }).configured, false);
});

// ── the Grow adapters, against fake token ops ────────────────────────────────
function fakeOps(over: Partial<GrowOps> = {}) {
  const calls: Record<string, unknown>[] = [];
  const ops: GrowOps = {
    async createTokenSession(i) { calls.push({ op: 'session', ...i }); return { ok: true, url: 'https://grow.test/card' }; },
    async chargeToken(i) { calls.push({ op: 'charge', ...i }); return { ok: true, transactionId: 'tx1', invoiceUrl: 'https://grow.test/r/1', invoiceNumber: '501' }; },
    async lookupToken(i) { calls.push({ op: 'lookup', ...i }); return { ok: true, found: true, status: 'paid', transactionId: 'tx1' }; },
    async refund() { return { ok: false, code: 'declined', error: 'n/a' }; },
    ...over,
  };
  return { ops, calls };
}
const CREDS = growBillingCreds({ GROW_BILLING_USER_ID: 'kalmea1', GROW_BILLING_API_KEY: 'K', GROW_BILLING_PAGE_CODE: 'PG' }).creds!;

await ok('card page: save only, on Kalmea\'s business, the payer as two words, Grow posts to our signed notify URL', async () => {
  const f = fakeOps();
  const a = createGrowBillingAdapters(CREDS, f.ops);
  const s = await a.payments.createCardSession({ tenantId: 't1', businessName: 'סטודיו', returnUrl: 'https://k/r', fullName: 'רונית', phone: '0501234567', notifyUrl: 'https://k/api/billing/grow-notify?s=x' });
  assert.equal(s.url, 'https://grow.test/card');
  const c = f.calls[0];
  assert.equal(c.mode, 'save_only'); assert.equal(c.userId, 'kalmea1'); assert.equal(c.fullName, 'רונית רונית'); assert.equal(c.notifyUrl, 'https://k/api/billing/grow-notify?s=x');
});

await ok('charge: the unique identifier is required and passed; the receipt comes back with the charge; 1010 is "duplicate"', async () => {
  const f = fakeOps();
  const a = createGrowBillingAdapters(CREDS, f.ops);
  const base: ChargeInput = { tokenRef: 'tok', amount: 349, currency: 'ILS', description: 'מנוי קלמיה', idempotencyKey: 'k' };
  assert.equal((await a.payments.charge(base)).ok, false, 'no identifier, no call');
  assert.equal(f.calls.length, 0);
  const r = await a.payments.charge({ ...base, uniqueIdentifier: 123456789, groupIdentifier: 77 });
  assert.deepEqual(r, { ok: true, providerPaymentId: 'tx1', invoiceNumber: '501', invoiceUrl: 'https://grow.test/r/1' });
  assert.equal(f.calls[0].uniqueIdentifier, 123456789);
  const dup = createGrowBillingAdapters(CREDS, fakeOps({ async chargeToken() { return { ok: false, code: 'duplicate', error: 'seen', errId: 1010 }; } }).ops);
  assert.equal(((await dup.payments.charge({ ...base, uniqueIdentifier: 123456789 })) as { code: string }).code, 'duplicate');
  const lost = createGrowBillingAdapters(CREDS, fakeOps({ async chargeToken() { return { ok: false, code: 'unreachable', error: 'x' }; } }).ops);
  assert.equal(((await lost.payments.charge({ ...base, uniqueIdentifier: 123456789 })) as { code: string }).code, 'unreachable');
});

// ── the ledger in the service ────────────────────────────────────────────────
function world(start: string) {
  let now = new Date(start);
  const tenants = new Map<string, TenantRow>();
  const subs = new Map<string, Subscription>();
  const payments: PaymentRecord[] = [];
  const order: string[] = [];
  let seq = 0;
  const repo: BillingRepo = {
    async getSub(t) { const s = [...subs.values()].find((x) => x.tenant_id === t); return s ? { ...s } : null; },
    async listSubs() { return [...subs.values()].map((s) => ({ ...s })); },
    async insertSub(row) { const s = { id: `s${++seq}`, ...row } as Subscription; subs.set(s.id, s); return { ...s }; },
    async updateSub(id, patch) { Object.assign(subs.get(id)!, patch); },
    async claimAttempt(id, previous, at) { const s = subs.get(id)!; if ((s.last_attempt_at ?? null) !== previous) return false; s.last_attempt_at = at; return true; },
    async hasSucceeded(subId, period) { return payments.some((p) => p.subscription_id === subId && p.period_start === period && p.status === 'succeeded'); },
    async findOpenAttempt(subId, period) { return [...payments].reverse().find((p) => p.subscription_id === subId && p.period_start === period && (p.status === 'pending' || p.status === 'unknown')) || null; },
    async insertPayment(row) {
      order.push(`insert:${row.status}:${row.unique_identifier ?? ''}`);
      if (row.unique_identifier != null && payments.some((p) => p.unique_identifier === row.unique_identifier)) throw new Error('duplicate key value violates unique constraint billing_payments_unique_identifier_key');
      const p = { id: `p${++seq}`, created_at: now.toISOString(), ...row } as PaymentRecord; payments.push(p); return { ...p };
    },
    async updatePayment(id, patch) { Object.assign(payments.find((p) => p.id === id)!, patch); },
    async pendingInvoices() { return []; },
    async getTenant(id) { return tenants.get(id) || null; },
    async setPlanStatus(id, st) { tenants.get(id)!.plan_status = st; },
  };
  return { repo, tenants, subs, payments, order, at: (iso: string) => { now = new Date(iso); }, now: () => now };
}
const T = '22222222-2222-2222-2222-222222222222';

function scripted(results: ChargeResult[], lookups: LookupResult[] = []) {
  const charges: ChargeInput[] = [];
  const looked: number[] = [];
  const payments: PaymentsAdapter = {
    async createCardSession() { return { url: 'x' }; },
    async charge(i) { charges.push(i); return results.shift() || { ok: false, code: 'declined', error: 'no script' }; },
    async lookup(_t, uid) { looked.push(uid); return lookups.shift() || { ok: true, found: false, status: 'unknown' }; },
  };
  return { payments, charges, looked };
}
const invoicing = createMockAdapters('https://k.test', () => 's').invoicing;
const ids = (...xs: number[]) => () => xs.shift()!;

await ok('every charge is written to the ledger with its identifier BEFORE Grow is called, and Grow\'s receipt is kept', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.tenants.set(T, { id: T, name: 'סטודיו', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  const sp = scripted([{ ok: true, providerPaymentId: 'tx9', invoiceNumber: '42', invoiceUrl: 'https://grow.test/r/42' }]);
  const d: Deps = { repo: w.repo, payments: { ...sp.payments, charge: async (i) => { w.order.push(`charge:${i.uniqueIdentifier}`); return sp.payments.charge(i); } }, invoicing, now: w.now, newIdentifier: ids(200000001) };
  const r = await saveCard(d, T, { tokenRef: 'tok', last4: '4242' });
  assert.equal(r.charged, 'charged');
  assert.deepEqual(w.order, ['insert:pending:200000001', 'charge:200000001']);
  const p = w.payments[0];
  assert.equal(p.status, 'succeeded'); assert.equal(p.unique_identifier, 200000001);
  assert.equal(p.invoice_status, 'issued'); assert.equal(p.invoice_url, 'https://grow.test/r/42'); assert.equal(p.invoice_number, '42');
  assert.equal(w.tenants.get(T)!.plan_status, 'active');
});

await ok('a refused card: the identifier is spent; the retry draws a NEW one (never reused, not even after a refusal)', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.tenants.set(T, { id: T, name: 'ס', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  const sp = scripted([{ ok: false, code: 'declined', error: 'card refused' }, { ok: true, providerPaymentId: 'tx2' }]);
  const d: Deps = { repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(300000001, 300000002) };
  assert.equal((await saveCard(d, T, { tokenRef: 'tok' })).charged, 'failed');
  w.at('2026-11-02T09:00:00Z');
  await runDue(d);
  assert.deepEqual(sp.charges.map((c) => c.uniqueIdentifier), [300000001, 300000002]);
  assert.deepEqual(w.payments.map((p) => p.status), ['failed', 'succeeded']);
});

await ok('a collision on the unique index draws another identifier before Grow is ever called', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.tenants.set(T, { id: T, name: 'ס', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  w.payments.push({ id: 'old', tenant_id: 'other', subscription_id: 'x', kind: 'subscription', status: 'failed', amount: 1, currency: 'ILS', period_start: null, period_end: null, attempt: 1, provider: 'card', provider_payment_id: null, error: null, invoice_status: 'none', invoice_number: null, invoice_url: null, note: null, created_at: '', unique_identifier: 400000001 });
  const sp = scripted([{ ok: true, providerPaymentId: 'tx' }]);
  await saveCard({ repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(400000001, 400000002) }, T, { tokenRef: 'tok' });
  assert.deepEqual(sp.charges.map((c) => c.uniqueIdentifier), [400000002]);
});

await ok('1010 "already seen": looked up by that identifier; paid counts once and nothing is charged again', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.tenants.set(T, { id: T, name: 'ס', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  const sp = scripted([{ ok: false, code: 'duplicate', error: '1010' }], [{ ok: true, found: true, status: 'paid', providerPaymentId: 'txA' }]);
  const r = await saveCard({ repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(500000001) }, T, { tokenRef: 'tok' });
  assert.equal(r.charged, 'charged');
  assert.deepEqual(sp.looked, [500000001]);
  assert.equal(sp.charges.length, 1);
  assert.equal(w.payments[0].status, 'succeeded'); assert.equal(w.payments[0].provider_payment_id, 'txA');
});

await ok('a lost reply that the lookup cannot settle stays "unknown": no second charge until it is settled, then it counts once', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.tenants.set(T, { id: T, name: 'ס', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  const sp = scripted([{ ok: false, code: 'unreachable', error: 'timeout' }], [{ ok: false, error: 'grow down' }, { ok: false, error: 'still down' }, { ok: true, found: true, status: 'paid', providerPaymentId: 'txLate' }]);
  const d: Deps = { repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(600000001, 600000002) };
  assert.equal((await saveCard(d, T, { tokenRef: 'tok' })).charged, 'skipped');
  assert.equal(w.payments[0].status, 'unknown');
  w.at('2026-11-01T12:00:00Z');
  await runDue(d);
  assert.equal(sp.charges.length, 1, 'the unsettled month is not charged again');
  w.at('2026-11-02T08:00:00Z');
  await runDue(d);
  assert.equal(sp.charges.length, 1);
  assert.equal(w.payments[0].status, 'succeeded');
  assert.equal(w.payments.filter((p) => p.status === 'succeeded').length, 1);
});

await ok('an unknown charge that Grow never saw is closed as failed, and the next attempt carries a new identifier', async () => {
  const w = world('2026-11-01T08:00:00Z');
  w.tenants.set(T, { id: T, name: 'ס', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  const sp = scripted([{ ok: false, code: 'unreachable', error: 'timeout' }, { ok: true, providerPaymentId: 'tx2' }], [{ ok: false, error: 'down' }, { ok: true, found: false, status: 'unknown' }]);
  const d: Deps = { repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(700000001, 700000002) };
  await saveCard(d, T, { tokenRef: 'tok' });
  w.at('2026-11-01T10:00:00Z');
  await runDue(d);
  assert.deepEqual(sp.charges.map((c) => c.uniqueIdentifier), [700000001, 700000002]);
  assert.deepEqual(w.payments.map((p) => p.status), ['failed', 'succeeded']);
});

await ok('the mock behaves like Grow: a repeated identifier is refused, and can be looked up', async () => {
  const m = createMockAdapters('https://k.test', () => 's').payments;
  const i: ChargeInput = { tokenRef: newMockToken('ok'), amount: 1, currency: 'ILS', description: 'x', idempotencyKey: 'k', uniqueIdentifier: 800000001 };
  assert.equal((await m.charge(i)).ok, true);
  assert.equal(((await m.charge(i)) as { code: string }).code, 'duplicate');
  assert.deepEqual(await m.lookup!(i.tokenRef, 800000001), { ok: true, found: true, status: 'paid', providerPaymentId: (await m.lookup!(i.tokenRef, 800000001) as { providerPaymentId: string }).providerPaymentId });
});

// ── consent, routes, migration ───────────────────────────────────────────────
await ok('the consent tick: her price glued to the shekel, Grow named, monthly until she cancels; required in the UI and on the server', () => {
  const t = billingConsentTextHe(349);
  assert.ok(t.includes('₪349') && !/₪ \d/.test(t));
  assert.ok(t.includes('Grow') && t.includes('בכל חודש') && t.includes('עד שאבטל'));
  const card = src('app/BillingCard.jsx');
  assert.ok(card.includes('data-testid="billing-consent"') && card.includes('disabled={busy || !consentOk}'));
  const route = src('app/api/billing/card/route.ts');
  assert.ok(route.includes("body.consent !== true") && route.includes("'consent-required'"));
  assert.ok(route.indexOf("from('billing_card_consents').insert") < route.indexOf('createCardSession('), 'stored before the card page opens');
});

await ok('the Grow callback for billing: live only, Grow\'s addresses, a signed session for one business, approve with the BILLING keys', () => {
  const r = src('app/api/billing/grow-notify/route.ts');
  assert.ok(r.indexOf("b.mode !== 'live'") < r.indexOf('ipAllowed(') && r.indexOf('ipAllowed(') < r.indexOf('verifyCardSession('));
  assert.ok(r.includes('n.tenantRef !== tenantRefOf(tenantId)'));
  assert.ok(r.includes('growBillingCreds(env)') && !/GROW_API_KEY|growCredentials\(/.test(r));
  assert.ok(!r.includes('requireActiveTenant'), 'billing works while blocked');
});

await ok('the migration: identifier unique and in range, the two new statuses, consents readable by her and written only by the server, not gated', () => {
  const sql = src('supabase/migrations/add_kalmea_billing_grow.sql');
  assert.ok(sql.includes('add column if not exists unique_identifier bigint'));
  assert.ok(sql.includes("check (status in ('succeeded', 'failed', 'pending', 'unknown'))"));
  assert.ok(sql.includes('billing_payments_unique_identifier_key') && sql.includes('unique_identifier >= 100000000 and unique_identifier < 4294967295'));
  assert.ok(sql.includes('revoke all on public.billing_card_consents from anon, authenticated') && sql.includes('grant select on public.billing_card_consents to authenticated'));
  assert.ok(!/is_tenant_active/.test(sql), 'billing stays reachable for a blocked business');
});

console.log(`billing grow: ${n} ok`);
