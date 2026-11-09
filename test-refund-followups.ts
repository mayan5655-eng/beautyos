// Follow-ups to the till's refund on void (lib/grow/refundFollowups.ts): the refund state in the till history, stuck refunds alerted from
// the Grow ops cron, and an alert when the refund is asked for while Grow is off for the business. In-memory repos and stubs only:
// nothing reaches Grow or Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  refundStateOf, refundStatesFor, stateFromVoidRefundAnswer, alertStuckRefunds, recordHiddenVoidRefund,
  REFUND_STATE_HE, REFUND_STUCK_HE, REFUND_STUCK_MS, MAX_STATE_IDS,
} from './lib/grow/refundFollowups.ts';
import type { RefundStatesRepo, StuckRefund } from './lib/grow/refundFollowups.ts';
import { refundVoidedGrowReceipt, VOID_REFUND_CLAIM, VOID_REFUND_FAILED_NOTE } from './lib/grow/voidRefund.ts';
import type { VoidRefundPayment, VoidRefundRepo } from './lib/grow/voidRefund.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const R = (c: string) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
const NOW = new Date('2026-11-09T10:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString();
const pay = (o: Partial<VoidRefundPayment>): VoidRefundPayment => ({ id: 'p', tenant_id: T1, status: 'paid', amount: 100, description: 'טיפול פנים', receipt_id: R('a'), error: null, updated_at: ago(5), ...o });
const FAILED_LINE = `${VOID_REFUND_FAILED_NOTE} ב-2026-11-09, להחזיר בלוח הבקרה של Grow`;

// ── 1. The refund state ──────────────────────────────────────────────────────
await ok('state: refunded (status, or the pre-migration error marker), with its time', () => {
  assert.deepEqual(refundStateOf(pay({ status: 'refunded', refunded_at: '2026-11-09T09:00:00Z' }), '', NOW), { state: 'refunded', refundedAt: '2026-11-09T09:00:00Z' });
  assert.equal(refundStateOf(pay({ status: 'paid', error: 'refunded' }), '', NOW)?.state, 'refunded');
  // A later successful retry wins over the earlier "not done" line on the note.
  assert.equal(refundStateOf(pay({ status: 'refunded' }), `שולם · ${FAILED_LINE}`, NOW)?.state, 'refunded');
});

await ok('state: in progress while claimed, stuck only after an hour', () => {
  assert.deepEqual(refundStateOf(pay({ error: VOID_REFUND_CLAIM, updated_at: ago(30) }), '', NOW), { state: 'in_progress', stuck: false });
  assert.deepEqual(refundStateOf(pay({ error: VOID_REFUND_CLAIM, updated_at: ago(61) }), FAILED_LINE, NOW), { state: 'in_progress', stuck: true });
  assert.equal(refundStateOf(pay({ error: VOID_REFUND_CLAIM, updated_at: null }), '', NOW)?.stuck, false, 'no time: never claimed stuck');
});

await ok('state: failed only when the receipt says the refund was not done; retry offered only when it can work', () => {
  assert.deepEqual(refundStateOf(pay({}), `שולם דרך Grow · ${FAILED_LINE}`, NOW), { state: 'failed', canRetry: true });
  assert.deepEqual(refundStateOf(pay({ description: 'מקדמה לתור' }), FAILED_LINE, NOW), { state: 'failed', canRetry: false }, 'a deposit: no retry');
  assert.deepEqual(refundStateOf(pay({ status: 'pending' }), FAILED_LINE, NOW), { state: 'failed', canRetry: false });
  assert.deepEqual(refundStateOf(null, FAILED_LINE, NOW), { state: 'failed', canRetry: false }, 'no payment found: no retry');
});

await ok('state: a void she made only in her books (box unticked) is not called a failure, and offers no refund button', () => {
  assert.deepEqual(refundStateOf(pay({}), 'שולם דרך Grow', NOW), { state: 'void_only' });
  assert.equal(refundStateOf(null, '', NOW), null);
  assert.equal(refundStateOf(pay({ status: 'pending' }), '', NOW), null);
});

function statesWorld() {
  const payments: VoidRefundPayment[] = [
    pay({ id: 'p1', receipt_id: R('a'), status: 'refunded' }),
    pay({ id: 'p2', receipt_id: R('b'), error: VOID_REFUND_CLAIM, updated_at: ago(90) }),
    pay({ id: 'p3', receipt_id: R('c') }),
    pay({ id: 'p4', receipt_id: R('d') }), // not voided
    pay({ id: 'p9', tenant_id: T2, receipt_id: R('e'), status: 'refunded' }), // another business
  ];
  const voids = new Set([`${T1}:${R('a')}`, `${T1}:${R('b')}`, `${T1}:${R('c')}`, `${T2}:${R('e')}`]);
  const notes: Record<string, string> = { [`${T1}:${R('c')}`]: `שולם דרך Grow · ${FAILED_LINE}`, [`${T2}:${R('e')}`]: FAILED_LINE };
  const asked: string[][] = [];
  const repo: RefundStatesRepo = {
    async voidedOf(t, ids) { asked.push(ids); return ids.filter((id) => voids.has(`${t}:${id}`)); },
    async paymentsOf(t, ids) { return payments.filter((p) => p.tenant_id === t && ids.includes(String(p.receipt_id))); },
    async notesOf(t, ids) { const o: Record<string, string | null> = {}; for (const id of ids) if (notes[`${t}:${id}`]) o[id] = notes[`${t}:${id}`]; return o; },
  };
  return { repo, asked };
}

await ok('states: joined by receipt id AND tenant, voided receipts only', async () => {
  const w = statesWorld();
  const s = await refundStatesFor(w.repo, T1, [R('a'), R('b'), R('c'), R('d'), R('e')], NOW);
  assert.deepEqual(Object.keys(s).sort(), [R('a'), R('b'), R('c')]);
  assert.equal(s[R('a')].state, 'refunded');
  assert.deepEqual(s[R('b')], { state: 'in_progress', stuck: true });
  assert.deepEqual(s[R('c')], { state: 'failed', canRetry: true });
  assert.equal(s[R('e')], undefined, 'another business\'s voided sale never shows');
});

await ok('states: bad ids dropped, duplicates merged, at most MAX_STATE_IDS asked, nothing asked without a tenant', async () => {
  const w = statesWorld();
  assert.deepEqual(await refundStatesFor(w.repo, T1, ["x' or 1=1", '', R('a') + ',' + R('b')], NOW), {});
  assert.equal(w.asked.length, 0);
  assert.deepEqual(await refundStatesFor(w.repo, '', [R('a')], NOW), {});
  const many = Array.from({ length: 150 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
  await refundStatesFor(w.repo, T1, [...many, many[0]], NOW);
  assert.equal(w.asked[0].length, MAX_STATE_IDS);
});

await ok('the till\'s view right after the POST answered', () => {
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'refunded', refunded: true }), { state: 'refunded' });
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'already_refunded' }), { state: 'refunded' });
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'unknown' }), { state: 'in_progress' });
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'in_progress' }), { state: 'in_progress' });
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'failed', reason: 'declined' }), { state: 'failed', canRetry: true });
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'failed', reason: 'deposit' }), { state: 'failed', canRetry: false });
  assert.deepEqual(stateFromVoidRefundAnswer({ status: 'failed', hidden: true }), { state: 'failed', canRetry: false });
  assert.deepEqual(stateFromVoidRefundAnswer(null), { state: 'failed', canRetry: false });
});

await ok('retry: a declined refund then retried through the same lib refunds once, and a second retry sends nothing', async () => {
  const p = pay({ id: 'p1', transaction_id: 'tx', transaction_token: 'tt' });
  let note = 'שולם דרך Grow';
  const repo: VoidRefundRepo = {
    async findPaymentByReceipt() { return p; },
    async isVoided() { return true; },
    async claim() { if (p.status !== 'paid' || p.error === VOID_REFUND_CLAIM) return 'busy'; p.error = VOID_REFUND_CLAIM; return 'claimed'; },
    async release(_t, _id, prior) { if (p.error === VOID_REFUND_CLAIM) p.error = prior; },
    async markRefunded(_t, _id, ref, at) { Object.assign(p, { status: 'refunded', error: null, refund_ref: ref, refunded_at: at }); },
    async appendReceiptNote(_t, _r, line) { note = `${note} · ${line}`; return note; },
  };
  const calls: string[] = [];
  let answer: 'no' | 'yes' = 'no';
  const ops = { refund: async (a: { idempotencyKey?: string }) => { calls.push(String(a.idempotencyKey)); return answer === 'yes' ? { ok: true as const, refundId: 'rf-1' } : { ok: false as const, code: 'declined' as const, error: 'no' }; } };
  const deps = { repo, ops, userId: 'u', alert: async () => {}, now: () => NOW };
  const first = await refundVoidedGrowReceipt(deps, { tenantId: T1, receiptId: R('a') });
  assert.equal(first.status, 'failed');
  assert.deepEqual(refundStateOf(p, note, NOW), { state: 'failed', canRetry: true }, 'the history shows "failed" with a retry');
  answer = 'yes';
  const second = await refundVoidedGrowReceipt(deps, { tenantId: T1, receiptId: R('a') });
  assert.equal(second.status, 'refunded');
  assert.equal(refundStateOf(p, note, NOW)?.state, 'refunded');
  const third = await refundVoidedGrowReceipt(deps, { tenantId: T1, receiptId: R('a') });
  assert.equal(third.status, 'already_refunded');
  assert.deepEqual(calls, ['void:p1', 'void:p1'], 'the same idempotency key, and no call once refunded');
});

await ok('Hebrew copy: the three states as asked, feminine, no em dashes', () => {
  assert.equal(REFUND_STATE_HE.refunded, 'הוחזר ב-Grow');
  assert.equal(REFUND_STATE_HE.in_progress, 'ההחזר בתהליך');
  assert.equal(REFUND_STATE_HE.failed, 'ההחזר נכשל, להחזיר בלוח הבקרה של Grow');
  for (const s of [...Object.values(REFUND_STATE_HE), REFUND_STUCK_HE, 'לנסות שוב להחזיר ב-Grow']) assert.doesNotMatch(s, /—|–/);
});

// ── 2. Stuck refunds ─────────────────────────────────────────────────────────
type A = { source: string; message: string; details?: Record<string, unknown> | null; opts?: { key?: string; severity?: string } };
const alertsInto = (into: A[]) => async (source: string, message: string, details?: Record<string, unknown> | null, opts?: { key?: string; severity?: 'warning' | 'error' }) => { into.push({ source, message, details, opts }); };
const at = (iso: string) => new Date(iso);

await ok('stuck: scanned only in the :00-:04 window of each hour, with a cutoff of one hour', async () => {
  const asked: string[] = [];
  const load = async (iso: string) => { asked.push(iso); return []; };
  assert.equal((await alertStuckRefunds(load, alertsInto([]), at('2026-11-09T10:05:00Z'))).scanned, false);
  assert.equal(asked.length, 0, 'no database read on the other eleven runs of the hour');
  assert.equal((await alertStuckRefunds(load, alertsInto([]), at('2026-11-09T10:00:00Z'))).scanned, true);
  assert.equal(asked[0], new Date(at('2026-11-09T10:00:00Z').getTime() - REFUND_STUCK_MS).toISOString());
});

await ok('stuck: an error once when a refund first crosses the hour (grow:refund-stuck, ids only)', async () => {
  const now = at('2026-11-09T10:00:00Z');
  const rows: StuckRefund[] = [
    { id: 'p1', tenant_id: T1, receipt_id: R('a'), updated_at: new Date(now.getTime() - 70 * 60000).toISOString() },
    { id: 'p2', tenant_id: T2, receipt_id: null, updated_at: new Date(now.getTime() - 5 * 3600000).toISOString() },
  ];
  const got: A[] = [];
  const r = await alertStuckRefunds(async () => rows, alertsInto(got), now);
  assert.deepEqual(r, { scanned: true, stuck: 2, alerted: 1 });
  assert.equal(got[0].source, 'grow:refund-stuck');
  assert.equal(got[0].opts?.severity, 'error');
  assert.deepEqual(got[0].details, { tenantId: T1, paymentId: 'p1', receiptId: R('a'), ageMin: 70 });
  assert.equal(got[0].opts?.key, 'p1:first');
});

await ok('stuck: a daily warning reminder at 06:00 UTC for every refund still stuck', async () => {
  const now = at('2026-11-09T06:02:00Z');
  const rows: StuckRefund[] = [
    { id: 'p1', tenant_id: T1, updated_at: new Date(now.getTime() - 66 * 60000).toISOString() },
    { id: 'p2', tenant_id: T2, updated_at: new Date(now.getTime() - 30 * 3600000).toISOString() },
  ];
  const got: A[] = [];
  await alertStuckRefunds(async () => rows, alertsInto(got), now);
  assert.equal(got.length, 2);
  assert.equal(got.find((g) => g.details?.paymentId === 'p2')?.opts?.severity, 'warning');
  assert.equal(got.find((g) => g.details?.paymentId === 'p2')?.opts?.key, 'p2:2026-11-09');
});

await ok('stuck: wired into the existing 5-minute Grow cron, before the "Grow off" skip, never throwing', () => {
  const r = src('app/api/grow/release-holds/route.ts');
  const check = r.indexOf('const stuckRefunds = await checkStuckRefunds();');
  assert.ok(check > 0 && check < r.indexOf("if (!growUiEnabled()) return"), 'runs even while the Grow screens are off');
  assert.match(r, /alertStuckRefunds\(supabaseStuckRefunds\(admin\(\)\), moneyAlert, new Date\(\)\)/);
  assert.match(r, /isAuthorizedCron\(request\)/);
  const lib = src('lib/grow/refundFollowups.ts');
  assert.match(lib, /\.eq\('status', 'paid'\)\.eq\('error', VOID_REFUND_CLAIM\)\.lt\('updated_at', olderThanIso\)/);
  assert.ok(JSON.parse(src('vercel.json')).crons.some((c: { path: string }) => c.path === '/api/grow/release-holds'), 'no new cron');
});

// ── 3. "hidden" ─────────────────────────────────────────────────────────────
await ok('hidden: alerts with the tenant and writes "not done" on her voided receipt', async () => {
  const got: A[] = [];
  const lines: string[] = [];
  const r = await recordHiddenVoidRefund({
    isVoided: async (t, id) => t === T1 && id === R('a'),
    appendReceiptNote: async (_t, _id, line) => { lines.push(line); return `שולם · ${line}`; },
    alert: alertsInto(got), now: () => NOW,
  }, { tenantId: T1, receiptId: R('a') });
  assert.equal(got.length, 1);
  assert.equal(got[0].source, 'grow:void-refund');
  assert.deepEqual(got[0].details, { tenantId: T1, receiptId: R('a'), reason: 'hidden', voided: true });
  assert.equal(lines[0], FAILED_LINE);
  assert.match(String(r.note), /ההחזר דרך Grow לא בוצע/);
});

await ok('hidden: a receipt that is not hers or not voided still alerts, but nothing is written', async () => {
  const got: A[] = [];
  let wrote = false;
  const r = await recordHiddenVoidRefund({ isVoided: async () => false, appendReceiptNote: async () => { wrote = true; return 'x'; }, alert: alertsInto(got) }, { tenantId: T2, receiptId: R('a') });
  assert.equal(got.length, 1);
  assert.equal(wrote, false);
  assert.equal(r.note, null);
});

await ok('hidden: the route knows the tenant before answering hidden; every other Grow route keeps caller()', () => {
  const r = src('app/api/grow/void-refund/route.ts');
  const post = r.slice(r.indexOf('export async function POST'), r.indexOf('export async function GET'));
  assert.match(post, /const c = await callerTenant\(\);/);
  const hid = post.indexOf('if (c.hidden)');
  assert.ok(hid > post.indexOf('isDemoTenantId(c.tenantId)'), 'the demo is refused first');
  assert.match(post.slice(hid), /recordHiddenVoidRefund\(.*alert: moneyAlert.*\{ tenantId: c\.tenantId, receiptId \}/);
  assert.match(post.slice(hid), /hidden: true/);
  const sh = src('app/api/grow/_shared.ts');
  assert.match(sh, /export async function caller\(\) \{\n  const off = uiOff\(\);/);
  assert.match(sh, /hidden: !growUiEnabled\(process\.env, tenantId\)/);
  const get = r.slice(r.indexOf('export async function GET'));
  assert.match(get, /const c = await caller\(\);/, 'the state read stays behind the switch');
  assert.match(get, /refundStatesFor\(supabaseRefundStatesRepo\(admin\(\)\), c\.tenantId, ids, new Date\(\)\)/);
  for (const f of ['lib/grow/refundFollowups.ts', 'app/api/grow/void-refund/route.ts']) assert.doesNotMatch(src(f), /\.delete\(/);
  const lib = src('lib/grow/refundFollowups.ts');
  for (const t of ["from('receipt_voids').select('receipt_id').eq('tenant_id', tenantId)", ".eq('tenant_id', tenantId).in('receipt_id', receiptIds)", "from('receipts').select('id, note').eq('tenant_id', tenantId)"]) assert.ok(lib.includes(t), t);
});

// ── the till ────────────────────────────────────────────────────────────────
await ok('till: refund state next to the voided receipt, retry on the failed one through the same route', () => {
  const b = src('app/beautyos.jsx');
  assert.match(b, /\{voided&&growRefundLine\(r,"row"\)\}/, 'the till history row');
  assert.match(b, /\{growRefundLine\(showReceipt,"receipt"\)\}/, 'the receipt\'s void box');
  assert.match(b, /fetch\(`\/api\/grow\/void-refund\?ids=\$\{encodeURIComponent\(key\)\}`\)/);
  const retry = b.slice(b.indexOf('const retryGrowRefund = async'), b.indexOf('const growVoidOk = useRef(false);'));
  assert.match(retry, /fetch\("\/api\/grow\/void-refund", \{ method: "POST"/);
  assert.match(retry, /runOnce\("growRefundRetry"/, 'a double tap sends one request');
  assert.match(b, /st\.state==="failed"&&st\.canRetry&&<button data-testid="grow-refund-retry"/);
  assert.match(b, /retryGrowRefund\(r\);/);
});

console.log(`\n${n} refund follow-up tests passed`);
