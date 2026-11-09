// findOpenAttempt fails closed (2026-11-08). It used to return null on ANY read error, and attempt() reads null as "no earlier unanswered
// charge", so a transient database error could become a second real Grow charge for a period whose first charge was still unsettled.
// Now a read error throws: the daily run skips that business, raises a 'billing:run' money alert, and the next run retries.
//
// The REAL supabaseBillingRepo.findOpenAttempt runs here, against a fake Supabase client that reads an in-memory ledger (or answers with
// an error). Everything else is the in-memory repo from test-billing-grow.ts. No network, no real charge.
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runDue } from './lib/billing/service.ts';
import type { BillingRepo, Subscription, PaymentRecord, TenantRow, Deps } from './lib/billing/service.ts';
import { supabaseBillingRepo } from './lib/billing/repo.ts';
import { createMockAdapters } from './lib/billing/adapter.ts';
import type { PaymentsAdapter, ChargeInput, ChargeResult, LookupResult } from './lib/billing/adapter.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

type PgErr = { code?: string; message: string } | null;

/** A fake supabase-js client for billing_payments reads only: eq / in / order / limit over `rows`, or `failWith()` when it is set. */
function fakeDb(rows: PaymentRecord[], failWith: () => PgErr) {
  const reads: string[] = [];
  const db = {
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let lim = Infinity;
      let desc = false;
      const q = {
        select() { return q; },
        eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return q; },
        in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return q; },
        order(_c: string, o: { ascending: boolean }) { desc = !o.ascending; return q; },
        limit(k: number) { lim = k; return q; },
        then(res: (v: { data: unknown; error: PgErr }) => unknown, rej?: (e: unknown) => unknown) {
          reads.push(table);
          const error = failWith();
          if (error) return Promise.resolve({ data: null, error }).then(res, rej);
          let out = rows.filter((r) => filters.every((f) => f(r as unknown as Record<string, unknown>)));
          if (desc) out = [...out].reverse(); // rows are kept in insert order, the same order as created_at here
          return Promise.resolve({ data: out.slice(0, lim).map((r) => ({ ...r })), error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, reads };
}

function world(start: string) {
  let now = new Date(start);
  const tenants = new Map<string, TenantRow>();
  const subs = new Map<string, Subscription>();
  const payments: PaymentRecord[] = [];
  let seq = 0;
  let readError: PgErr = null;
  const fake = fakeDb(payments, () => readError);
  const real = supabaseBillingRepo(fake.db);
  const repo: BillingRepo = {
    async getSub(t) { const s = [...subs.values()].find((x) => x.tenant_id === t); return s ? { ...s } : null; },
    async listSubs() { return [...subs.values()].map((s) => ({ ...s })); },
    async insertSub(row) { const s = { id: `s${++seq}`, ...row } as Subscription; subs.set(s.id, s); return { ...s }; },
    async updateSub(id, patch) { Object.assign(subs.get(id)!, patch); },
    async claimAttempt(id, previous, at) { const s = subs.get(id)!; if ((s.last_attempt_at ?? null) !== previous) return false; s.last_attempt_at = at; return true; },
    async hasSucceeded(subId, period) { return payments.some((p) => p.subscription_id === subId && p.period_start === period && p.status === 'succeeded'); },
    findOpenAttempt: real.findOpenAttempt, // the production code under test
    async insertPayment(row) { const p = { id: `p${++seq}`, created_at: now.toISOString(), ...row } as PaymentRecord; payments.push(p); return { ...p }; },
    async updatePayment(id, patch) { Object.assign(payments.find((p) => p.id === id)!, patch); },
    async pendingInvoices() { return []; },
    async getTenant(id) { return tenants.get(id) || null; },
    async setPlanStatus(id, st) { tenants.get(id)!.plan_status = st; },
  };
  return { repo, real, tenants, subs, payments, reads: fake.reads, failReads: (e: PgErr) => { readError = e; }, at: (iso: string) => { now = new Date(iso); }, now: () => now };
}

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

/** Collects console.error lines while fn runs (the run-failed line and the money alert's own log line, off Vercel). */
async function errorsDuring(fn: () => Promise<unknown>) {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.error = orig; }
  return lines;
}

const transient: PgErr = { code: '08006', message: 'connection failure' };

function activeDue(w: ReturnType<typeof world>, tenantId: string) {
  w.tenants.set(tenantId, { id: tenantId, name: 'סטודיו', plan_status: 'active', trial_ends_at: null, plan_price: 349 });
  return w.repo.insertSub({ tenant_id: tenantId, price: 349, currency: 'ILS', status: 'active', next_charge_at: '2026-11-08T00:00:00.000Z', token_ref: 'tok', card_last4: '4242', card_brand: 'visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null } as unknown as Omit<Subscription, 'id'>);
}

await ok('the repo: a read error throws (with the reason), a healthy read with nothing open is null', async () => {
  const w = world('2026-11-08T06:00:00Z');
  w.failReads(transient);
  await assert.rejects(() => w.real.findOpenAttempt!('s1', '2026-11-08'), /findOpenAttempt: connection failure/);
  // A missing column is not "none" either: kind / status / period_start predate every open-attempt row, so it can only mean drift.
  w.failReads({ code: '42703', message: 'column billing_payments.kind does not exist' });
  await assert.rejects(() => w.real.findOpenAttempt!('s1', null), /findOpenAttempt/);
  w.failReads(null);
  assert.equal(await w.real.findOpenAttempt!('s1', '2026-11-08'), null);
});

await ok('a read error on findOpenAttempt: no Grow charge, no payment row, a billing:run alert; the next healthy run charges once', async () => {
  const T = '33333333-3333-3333-3333-333333333301';
  const w = world('2026-11-08T06:00:00Z');
  const sub = await activeDue(w, T);
  const sp = scripted([{ ok: true, providerPaymentId: 'tx1' }, { ok: true, providerPaymentId: 'tx-second' }]);
  const d: Deps = { repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(400000001, 400000002) };

  w.failReads(transient);
  let sum!: Awaited<ReturnType<typeof runDue>>;
  const errs = await errorsDuring(async () => { sum = await runDue(d); });
  assert.equal(sp.charges.length, 0, 'Grow was not called');
  assert.equal(w.payments.length, 0, 'no ledger row was written');
  assert.equal(sum.charged, 0); assert.equal(sum.failed, 0);
  assert.equal(w.subs.get(sub.id)!.last_attempt_at, null, 'the attempt was not claimed, so the next run may try');
  assert.equal(w.subs.get(sub.id)!.status, 'active', 'a read error is not a failed card: no past-due, no retry counter');
  assert.ok(errs.some((l) => l.includes('[billing] run failed for tenant') && l.includes(T) && l.includes('findOpenAttempt')), 'the run logs the tenant and why');
  assert.ok(errs.some((l) => l.includes('[money-alert] billing:run')), 'a money alert is raised');

  w.failReads(null);
  w.at('2026-11-09T06:00:00Z');
  const sum2 = await runDue(d);
  assert.equal(sum2.charged, 1);
  assert.equal(sp.charges.length, 1, 'exactly one charge');
  assert.equal(sp.charges[0].uniqueIdentifier, 400000001);
  assert.deepEqual(w.payments.map((p) => [p.status, p.period_start]), [['succeeded', '2026-11-08']]);
  assert.equal(w.subs.get(sub.id)!.next_charge_at, '2026-12-08T00:00:00.000Z');

  const sum3 = await runDue(d);
  assert.equal(sum3.charged, 0); assert.equal(sp.charges.length, 1, 'a third run does not charge the same month again');
});

await ok('the dangerous case: an unsettled charge exists and the read fails -> nothing; healthy -> it is looked up, never re-charged', async () => {
  const T = '33333333-3333-3333-3333-333333333302';
  const w = world('2026-11-08T06:00:00Z');
  const sub = await activeDue(w, T);
  // Yesterday's attempt for this month: Grow never answered.
  w.payments.push({ id: 'p-open', tenant_id: T, subscription_id: sub.id, kind: 'subscription', status: 'unknown', unique_identifier: 400000099, amount: 349, currency: 'ILS', period_start: '2026-11-08', period_end: '2026-12-08', attempt: 1, provider: 'card', provider_payment_id: null, error: 'unreachable: waiting for the provider', invoice_status: 'none', invoice_number: null, invoice_url: null, note: null, created_at: '2026-11-07T06:00:00.000Z' });
  // Grow actually took the money for that identifier.
  const sp = scripted([{ ok: true, providerPaymentId: 'tx-double' }], [{ ok: true, found: true, status: 'paid', providerPaymentId: 'tx-open' }]);
  const d: Deps = { repo: w.repo, payments: sp.payments, invoicing, now: w.now, newIdentifier: ids(400000003) };

  w.failReads(transient);
  const errs = await errorsDuring(() => runDue(d));
  assert.equal(sp.charges.length, 0, 'no second charge while the first is unsettled and unreadable');
  assert.equal(sp.looked.length, 0);
  assert.equal(w.payments.length, 1, 'no new ledger row');
  assert.ok(errs.some((l) => l.includes('[money-alert] billing:run')));

  w.failReads(null);
  w.at('2026-11-09T06:00:00Z');
  const sum = await runDue(d);
  assert.equal(sp.charges.length, 0, 'still never charged again');
  assert.deepEqual(sp.looked, [400000099], 'the open identifier was looked up');
  assert.equal(sum.charged, 1);
  assert.deepEqual(w.payments.map((p) => [p.id, p.status, p.provider_payment_id]), [['p-open', 'succeeded', 'tx-open']]);
});

console.log(`billing open-attempt fail-closed: ${n} ok`);
