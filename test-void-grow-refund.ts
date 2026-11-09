// Void a Grow-paid sale in the till, and give the money back through Grow (lib/grow/voidRefund.ts, app/api/grow/void-refund).
// A fetch stub stands in for Grow and an in-memory repo for the database: nothing reaches Grow or Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLiveOps } from './lib/grow/ops.ts';
import type { TokenCreds } from './lib/grow/tokenFlow.ts';
import { refundVoidedGrowReceipt, VOID_REFUND_CLAIM, VOID_REFUND_HE } from './lib/grow/voidRefund.ts';
import type { VoidRefundPayment, VoidRefundRepo, VoidRefundDeps } from './lib/grow/voidRefund.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CREDS: TokenCreds = { apiKey: 'key-test', pageCode: 'page-test', apiBase: 'https://grow.stub/api/light/server/1.0', env: 'sandbox' };

type Call = { url: string; fields: Record<string, string> };
/** A stand-in for global fetch that answers like Grow's refundTransaction. */
function stubFetch(answer: (call: Call) => unknown | 'throw') {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const fields: Record<string, string> = {};
    (init?.body as FormData).forEach((v, k) => { fields[k] = String(v); });
    const call = { url: String(input), fields };
    calls.push(call);
    const a = answer(call);
    if (a === 'throw') throw new Error('network down');
    return new Response(JSON.stringify(a), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const GROW_OK = { status: 1, err: '', data: { refundId: 'rf-555' } };
const GROW_NO = { status: 0, err: { id: 400, message: 'refund not allowed' }, data: null };

function world(opts: { payment?: Partial<VoidRefundPayment>; voided?: boolean } = {}) {
  const payments = new Map<string, VoidRefundPayment & Record<string, unknown>>();
  const p = { id: 'pay-1', tenant_id: T1, status: 'paid', amount: 1, description: 'טיפול פנים', receipt_id: R1, transaction_id: 'tx-1', transaction_token: 'tt-1', error: null, ...opts.payment };
  payments.set(p.id, p);
  // Another business's Grow sale, on its own receipt.
  payments.set('pay-2', { id: 'pay-2', tenant_id: T2, status: 'paid', amount: 50, description: 'גבות', receipt_id: R2, transaction_id: 'tx-2', transaction_token: 'tt-2', error: null });
  const voids = new Set<string>(opts.voided === false ? [] : [`${T1}:${R1}`, `${T2}:${R2}`]);
  const notes = new Map<string, string>();
  const alerts: { source: string; message: string; details?: Record<string, unknown> | null }[] = [];
  const repo: VoidRefundRepo = {
    async findPaymentByReceipt(t, r) { return [...payments.values()].find((x) => x.tenant_id === t && x.receipt_id === r) || null; },
    async isVoided(t, r) { return voids.has(`${t}:${r}`); },
    async claim(t, id) {
      const x = payments.get(id);
      if (!x || x.tenant_id !== t || x.status !== 'paid' || x.error === VOID_REFUND_CLAIM) return 'busy';
      x.error = VOID_REFUND_CLAIM; return 'claimed';
    },
    async release(t, id, prior) { const x = payments.get(id); if (x && x.tenant_id === t && x.error === VOID_REFUND_CLAIM) x.error = prior === VOID_REFUND_CLAIM ? null : prior; },
    async markRefunded(t, id, ref, at) { const x = payments.get(id); if (x && x.tenant_id === t) Object.assign(x, { status: 'refunded', error: null, refund_ref: ref, refunded_at: at }); },
    async appendReceiptNote(t, r, line) { const k = `${t}:${r}`; const prev = notes.get(k) || 'שולם דרך Grow'; const note = `${prev} · ${line}`; notes.set(k, note); return note; },
  };
  const deps = (over: Partial<VoidRefundDeps> = {}): VoidRefundDeps => ({
    repo, ops: createLiveOps(CREDS), userId: 'grow-user-1',
    alert: async (source, message, details) => { alerts.push({ source, message, details }); },
    now: () => new Date('2026-11-09T10:00:00Z'), ...over,
  });
  return { payments, voids, notes, alerts, repo, deps };
}

// ── Grow's refund call itself ─────────────────────────────────────────────────
await ok('refundTransaction: the fields sent, the full amount with two decimals, no pageCode, Grow refund id read back', async () => {
  const f = stubFetch(() => GROW_OK);
  try {
    const r = await createLiveOps(CREDS).refund({ userId: 'u9', transactionId: 'tx-9', transactionToken: 'tt-9', amount: 1, idempotencyKey: 'void:x' });
    assert.deepEqual(r, { ok: true, refundId: 'rf-555' });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, 'https://grow.stub/api/light/server/1.0/refundTransaction');
    assert.deepEqual(f.calls[0].fields, { apiKey: 'key-test', userId: 'u9', transactionId: 'tx-9', refundSum: '1.00', transactionToken: 'tt-9' });
  } finally { f.restore(); }
});

await ok('refundTransaction: a refusal is "declined" with Grow\'s error id, a dropped connection is "unreachable"', async () => {
  let f = stubFetch(() => GROW_NO);
  try {
    const r = await createLiveOps(CREDS).refund({ userId: 'u9', transactionId: 'tx-9', transactionToken: 'tt-9', amount: 5, idempotencyKey: 'k' });
    assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.code, 'declined'); assert.equal(r.errId, 400); }
  } finally { f.restore(); }
  f = stubFetch(() => 'throw');
  try {
    const r = await createLiveOps(CREDS).refund({ userId: 'u9', transactionId: 'tx-9', transactionToken: 'tt-9', amount: 5, idempotencyKey: 'k' });
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'unreachable');
  } finally { f.restore(); }
});

// ── the void, then the refund ────────────────────────────────────────────────
await ok('a voided Grow sale is refunded in full, once: payment marked refunded with Grow\'s reference, the receipt note says so', async () => {
  const w = world({ payment: { amount: 1 } });
  const f = stubFetch(() => GROW_OK);
  try {
    const r = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(r.status, 'refunded'); assert.equal(r.refunded, true); assert.equal(r.amount, 1); assert.equal(r.refundId, 'rf-555');
    assert.equal(r.message, VOID_REFUND_HE.done(1));
    assert.match(r.message, /₪1 הוחזרו ללקוחה דרך Grow/);
    assert.equal(f.calls[0].fields.refundSum, '1.00', 'the full amount, never a part');
    assert.equal(f.calls[0].fields.transactionId, 'tx-1'); assert.equal(f.calls[0].fields.transactionToken, 'tt-1');
    const p = w.payments.get('pay-1')!;
    assert.equal(p.status, 'refunded'); assert.equal(p.refund_ref, 'rf-555'); assert.equal(p.refunded_at, '2026-11-09T10:00:00.000Z'); assert.equal(p.error, null);
    assert.match(String(r.note), /שולם דרך Grow · ₪1 הוחזרו ללקוחה דרך Grow ב-2026-11-09/, 'appended, not replaced');
    assert.equal(w.alerts.length, 0, 'a success raises nothing');
    // The same void again (a second tap, a retry): already refunded, Grow is not called a second time.
    const again = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(again.status, 'already_refunded'); assert.equal(again.refunded, false);
    assert.equal(f.calls.length, 1, 'never refunded twice');
  } finally { f.restore(); }
});

await ok('two taps at the same moment: one Grow call, the other is told a refund is already on its way', async () => {
  const w = world();
  let release: () => void = () => {};
  const gate = new Promise<void>((res) => { release = res; });
  const ops = { calls: 0, async refund() { ops.calls++; await gate; return { ok: true as const, refundId: 'rf-1' }; } };
  const a = refundVoidedGrowReceipt(w.deps({ ops }), { tenantId: T1, receiptId: R1 });
  await new Promise((r) => setTimeout(r, 5));
  const b = await refundVoidedGrowReceipt(w.deps({ ops }), { tenantId: T1, receiptId: R1 });
  release();
  const ra = await a;
  assert.equal(ra.status, 'refunded'); assert.equal(b.status, 'in_progress'); assert.equal(ops.calls, 1);
  assert.match(b.message, /לא נשלח החזר נוסף/);
});

await ok('Grow refuses: the void stands, the claim is released (the earlier error marker back), moneyAlert, Hebrew points to Grow\'s dashboard', async () => {
  const w = world({ payment: { error: 'second_tx:tx-x' } });
  const f = stubFetch(() => GROW_NO);
  try {
    const r = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(r.status, 'failed'); assert.equal(r.refunded, false); assert.equal(r.reason, 'declined');
    assert.match(r.message, /^התשלום בוטל אצלך, אבל ההחזר ב-Grow לא בוצע/);
    assert.match(r.message, /צריך להחזיר את הכסף ללקוחה מלוח הבקרה של Grow\./);
    assert.ok(w.voids.has(`${T1}:${R1}`), 'the void is untouched');
    const p = w.payments.get('pay-1')!;
    assert.equal(p.status, 'paid'); assert.equal(p.error, 'second_tx:tx-x', 'the claim is released and the marker it covered is back');
    assert.equal(w.alerts.length, 1); assert.equal(w.alerts[0].source, 'grow:void-refund');
    assert.equal(w.alerts[0].details?.errId, 400); assert.equal(w.alerts[0].details?.paymentId, 'pay-1');
    assert.match(String(r.note), /ההחזר דרך Grow לא בוצע ב-2026-11-09, להחזיר בלוח הבקרה של Grow/, 'the outcome is recorded on the receipt');
  } finally { f.restore(); }
});

await ok('no answer from Grow: the claim is KEPT (no second refund can follow), moneyAlert, she is told to check Grow\'s dashboard', async () => {
  const w = world();
  const f = stubFetch(() => 'throw');
  try {
    const r = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(r.status, 'unknown'); assert.equal(r.message, VOID_REFUND_HE.unknown);
    assert.equal(w.payments.get('pay-1')!.error, VOID_REFUND_CLAIM, 'still claimed');
    assert.equal(w.alerts.length, 1); assert.match(w.alerts[0].message, /outcome unknown/);
    const retry = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(retry.status, 'in_progress'); assert.equal(f.calls.length, 1, 'a retry does not call Grow again');
    assert.equal(w.alerts.length, 2, 'the retry is logged too');
  } finally { f.restore(); }
});

await ok('nothing is refunded before the void exists', async () => {
  const w = world({ voided: false });
  const f = stubFetch(() => GROW_OK);
  try {
    const r = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(r.status, 'not_voided'); assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

await ok('another business\'s receipt: not found in her tenant, Grow never called, logged', async () => {
  const w = world();
  const f = stubFetch(() => GROW_OK);
  try {
    // T1 asks for T2's receipt (T2 has voided it, T1 has not): refused as not voided.
    const r = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R2 });
    assert.equal(r.status, 'not_voided');
    // Even with a void row under T1, the payment is looked up with T1 and is not there.
    w.voids.add(`${T1}:${R2}`);
    const r2 = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R2 });
    assert.equal(r2.status, 'failed'); assert.equal(r2.reason, 'no_payment');
    assert.equal(f.calls.length, 0); assert.equal(w.payments.get('pay-2')!.status, 'paid');
    assert.equal(w.alerts.at(-1)?.details?.reason, 'no_payment');
  } finally { f.restore(); }
});

await ok('refused without calling Grow, each with a moneyAlert and the dashboard sentence: deposit, no token, no credentials, no Grow account, not paid', async () => {
  const cases: [string, Parameters<typeof world>[0], Partial<VoidRefundDeps>][] = [
    ['deposit', { payment: { description: 'מקדמה לטיפול פנים' } }, {}],
    ['no_transaction', { payment: { transaction_token: null } }, {}],
    ['not_configured', {}, { ops: null }],
    ['no_account', {}, { userId: '' }],
    ['not_paid', { payment: { status: 'failed' } }, {}],
  ];
  const f = stubFetch(() => GROW_OK);
  try {
    for (const [reason, opts, over] of cases) {
      const w = world(opts);
      const r = await refundVoidedGrowReceipt(w.deps(over), { tenantId: T1, receiptId: R1 });
      assert.equal(r.status, 'failed', reason); assert.equal(r.reason, reason);
      assert.match(r.message, /לוח הבקרה של Grow/, reason);
      assert.equal(w.alerts.length, 1, `${reason}: alerted`);
      assert.notEqual(w.payments.get('pay-1')!.error, VOID_REFUND_CLAIM, `${reason}: never claimed`);
    }
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

await ok('a payment refunded before add_grow_wallet.sql (paid + error "refunded") is not refunded again', async () => {
  const w = world({ payment: { error: 'refunded' } });
  const f = stubFetch(() => GROW_OK);
  try {
    const r = await refundVoidedGrowReceipt(w.deps(), { tenantId: T1, receiptId: R1 });
    assert.equal(r.status, 'already_refunded'); assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

// ── wiring ───────────────────────────────────────────────────────────────────
await ok('route: signed-in caller, her tenant from the session (never the body), demo refused, moneyAlert wired', () => {
  const r = src('app/api/grow/void-refund/route.ts');
  assert.match(r, /const c = await caller\(\);/);
  assert.match(r, /isDemoTenantId\(c\.tenantId\)/);
  assert.match(r, /\{ tenantId: c\.tenantId, receiptId \}/);
  assert.doesNotMatch(r, /b\.tenant|body\.tenant|tenantId: b\./);
  assert.match(r, /alert: moneyAlert/);
  assert.match(r, /\.eq\('tenant_id', c\.tenantId\)/, 'her Grow account by her tenant');
  const lib = src('lib/grow/voidRefund.ts');
  assert.match(lib, /\.eq\('receipt_id', receiptId\)\.eq\('tenant_id', tenantId\)/, 'the payment by receipt AND tenant');
  assert.match(lib, /\.eq\('status', 'paid'\)\.or\(`error\.is\.null,error\.neq\.\$\{VOID_REFUND_CLAIM\}`\)/, 'compare-and-set claim');
  assert.equal(VOID_REFUND_CLAIM, 'refund_in_progress');
  assert.match(src('app/api/grow/refund/route.ts'), /REFUND_CLAIM = 'refund_in_progress'/, 'one claim value across both refund routes');
  for (const f of ['lib/grow/voidRefund.ts', 'app/api/grow/void-refund/route.ts']) assert.doesNotMatch(src(f), /\.delete\(/, `${f}: nothing deleted`);
});

await ok('till: the option is on by default, the void is written before the refund is asked for, and the old void-only path is kept', () => {
  const b = src('app/beautyos.jsx');
  assert.match(b, /const \[voidGrowRefund, +setVoidGrowRefund\] += useState\(true\);/);
  assert.match(b, /גם להחזיר את הכסף ללקוחה ב-Grow/);
  assert.match(b, /setVoidOpen\(true\);setVoidReason\(""\);setVoidGrowRefund\(true\);/, 'every new void starts ticked');
  const fn = b.slice(b.indexOf('const handleVoidReceipt = async'), b.indexOf('const dupPayOk = useRef(false);'));
  const ins = fn.indexOf('from("receipt_voids").insert(');
  const call = fn.indexOf('fetch("/api/grow/void-refund"');
  assert.ok(ins > 0 && call > ins, 'void first, then the refund');
  assert.match(fn, /toast\(growRefund\.message, "error"\)/, 'a failure stays on screen until tapped');
  assert.match(fn, /לבטל רק ברישום שלך\?/, 'the void-only confirmation is still there when the box is unticked');
});

await ok('copy: Hebrew, no em dashes, feminine forms', () => {
  const all = [VOID_REFUND_HE.failed('x'), VOID_REFUND_HE.unknown, VOID_REFUND_HE.already, VOID_REFUND_HE.inProgress, VOID_REFUND_HE.notVoided, VOID_REFUND_HE.done(12.5)];
  for (const s of all) { assert.doesNotMatch(s, /—|–/); assert.match(s, /[א-ת]/); }
  assert.match(VOID_REFUND_HE.unknown, /בדקי .* החזירי/);
  assert.equal(VOID_REFUND_HE.done(12.5).includes('₪12.50'), true);
  const b = src('app/beautyos.jsx');
  const label = b.slice(b.indexOf('data-testid="void-grow-refund"'), b.indexOf('</label>', b.indexOf('data-testid="void-grow-refund"')));
  assert.doesNotMatch(label, /—|–/);
});

await ok('the till: a lost or unreadable refund answer says "check Grow first", never "refund by hand"', () => {
  const page = src('app/beautyos.jsx');
  assert.match(page, /else if \(!growRefund \|\| !growRefund\.message\) growRefund = \{ refunded: false, status: "unknown", message: VOID_REFUND_HE\.unknown \}/);
  assert.doesNotMatch(page, /if \(!growRefund \|\| growRefund\.hidden \|\| !growRefund\.message\)/);
});

console.log(`\npassed ${n} failed 0`);
