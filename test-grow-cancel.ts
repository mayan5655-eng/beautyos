// Cancellation fees and deposits on top of the Grow card payments, in MOCK mode, end to end with an in-memory database and a fake clock:
//   saved_card: consent -> token -> late cancel -> pending question -> "yes" -> charged, receipt, reports; "waive" -> no charge
//   deposit:    pay -> attend -> deducted at the cashier; no-show / late cancel -> kept; timely cancel -> refunded or kept as credit
//   mode off:   nothing changes
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGrow, mockNotification } from './lib/grow/adapter.ts';
import { applyNotificationByProcess, approveTransaction } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';
import { createMockOps, newMockCardToken } from './lib/grow/ops.ts';
import type { GrowOps } from './lib/grow/ops.ts';
import {
  activePolicy, recordConsentAndStart, saveToken, detect, decide, retryRefund, depositForCashier, applyDeposit, feeQuestion,
} from './lib/grow/cancelFees.ts';
import type { CancelRepo, ConsentRow, FeeItem, TokenRow, ApptRow, PaymentRow, Deps, FeeStatus } from './lib/grow/cancelFees.ts';
import { sanitizePolicy, feeAmount, classify, defaultPolicyText, snapshotOf, DEFAULT_POLICY, feeQuestionHe } from './lib/cancellationPolicy.ts';
import type { CancelPolicy } from './lib/cancellationPolicy.ts';
import { monthSummary, liveReceipts } from './lib/till.ts';
import { signGrowSession, verifyGrowSession } from './lib/grow/mockSession.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TENANT = '11111111-1111-1111-1111-111111111111';
const ORIGIN = 'https://preview.kalmea.test';
const HOUR = 3600 * 1000;

// ── the world ────────────────────────────────────────────────────────────────
function world(startIso = '2026-11-10T06:00:00Z') {
  let now = new Date(startIso);
  const appts = new Map<string, ApptRow>();
  const consents: ConsentRow[] = [];
  const tokens: TokenRow[] = [];
  const fees: FeeItem[] = [];
  const credits: { id: number; tenant_id: string; client_id: string; amount: number; used_at: string | null; source: string }[] = [];
  const payments = new Map<string, GrowPayment & Record<string, unknown>>();
  const receipts: Record<string, unknown>[] = [];
  const voids: { receipt_id: string; reason: string }[] = [];
  let policy: CancelPolicy | null = null;
  let account: { user_id: string; enabled: boolean } | null = { user_id: 'GROWUSER1', enabled: true };
  let seq = 0;
  const calls = { chargeToken: 0, refund: 0 };

  const growRepo: GrowRepo = {
    async insertPayment(row) { const p = { id: `p${++seq}`, process_id: null, receipt_id: null, ...row } as GrowPayment & Record<string, unknown>; payments.set(p.id, p); return p; },
    async updatePayment(id, patch) { Object.assign(payments.get(id)!, patch); },
    async markPaid(id, patch) { const p = payments.get(id)!; if (p.status !== 'created') return null; Object.assign(p, patch); return p; },
    async findByToken(t) { return [...payments.values()].find((p) => p.notify_token === t) || null; },
    async findByProcessId(pid) { const m = [...payments.values()].filter((p) => p.process_id === pid); return m.length === 1 ? m[0] : null; },
    async insertReceipt(row) { receipts.push({ ...row, id: `r${receipts.length + 1}`, created_at: now.toISOString() }); return { id: `r${receipts.length}` }; },
    async setReceiptDocument(id, url, number) { Object.assign(receipts.find((x) => x.id === id)!, { legal_status: 'issued', legal_provider: 'grow', legal_doc_url: url, ...(number ? { legal_doc_number: number } : {}) }); },
  };

  const repo: CancelRepo = {
    async getAccount() { return account; },
    async getPolicy() { return policy; },
    async savePolicy(_t, p) { policy = p; },
    async getAppointment(_t, id) { return appts.get(id) || null; },
    async getConsent(_t, id) { return consents.find((c) => c.appointment_id === id) || null; },
    async insertConsent(row) { const c = { id: `c${++seq}`, deposit_applied_receipt_id: null, ...row } as ConsentRow; consents.push(c); return c; },
    async updateConsent(id, patch) { Object.assign(consents.find((c) => c.id === id)!, patch); },
    async insertToken(row) { const t = { id: `t${++seq}`, ...row } as TokenRow; tokens.push(t); return t; },
    async getToken(id) { return tokens.find((t) => t.id === id) || null; },
    async insertFeeIfAbsent(row) { if (fees.some((f) => f.appointment_id === row.appointment_id && f.kind === row.kind)) return null; const f = { id: `f${++seq}`, created_at: now.toISOString(), grow_payment_id: null, receipt_id: null, error: null, ...row } as FeeItem; fees.push(f); return f; },
    async getFee(_t, id) { return fees.find((f) => f.id === id) || null; },
    async transitionFee(_t, id, from, patch) { const f = fees.find((x) => x.id === id); if (!f || !from.includes(f.status)) return null; Object.assign(f, patch); return f; },
    async listFees(_t, f) { return fees.filter((x) => (!f.status || f.status.includes(x.status)) && (!f.appointmentId || x.appointment_id === f.appointmentId) && (!f.clientId || x.client_id === f.clientId)); },
    async getDepositPayment(_t, apptId) { const p = [...payments.values()].filter((x) => x.appointment_id === apptId && x.kind === 'deposit').pop(); return p ? ({ id: p.id, tenant_id: p.tenant_id, status: p.status, amount: Number(p.amount), transaction_id: (p.transaction_id as string) || null, receipt_id: p.receipt_id, appointment_id: p.appointment_id } as PaymentRow) : null; },
    async getPayment(_t, id) { const p = payments.get(id); return p ? ({ id: p.id, tenant_id: p.tenant_id, status: p.status, amount: Number(p.amount), transaction_id: (p.transaction_id as string) || null, receipt_id: p.receipt_id, appointment_id: p.appointment_id } as PaymentRow) : null; },
    async markRefunded(id, ref) { Object.assign(payments.get(id)!, { status: 'refunded', refund_ref: ref }); },
    async voidReceipt(_t, receiptId, reason) { voids.push({ receipt_id: receiptId, reason }); },
    async addCredit(row) { credits.push({ id: ++seq, used_at: null, ...row } as never); },
    async creditBalance(_t, clientId) { return credits.filter((c) => c.client_id === clientId && !c.used_at).reduce((s, c) => s + c.amount, 0); },
    async useCredit(_t, clientId, amount) {
      let left = amount, used = 0;
      for (const c of credits.filter((x) => x.client_id === clientId && !x.used_at)) {
        if (left <= 0) break;
        if (c.amount > left) { credits.push({ id: ++seq, tenant_id: TENANT, client_id: clientId, amount: left, used_at: 'now', source: 'split_used' }); c.amount -= left; used += left; left = 0; }
        else { c.used_at = 'now'; used += c.amount; left -= c.amount; }
      }
      return used;
    },
  };

  const grow = resolveGrow({}, ORIGIN);
  const baseOps = grow.ops as GrowOps;
  let opsOverride: Partial<GrowOps> = {};
  const ops: GrowOps = {
    createTokenSession: (i) => (opsOverride.createTokenSession || baseOps.createTokenSession)(i),
    async chargeToken(i) { calls.chargeToken++; return (opsOverride.chargeToken || baseOps.chargeToken)(i); },
    async refund(i) { calls.refund++; return (opsOverride.refund || baseOps.refund)(i); },
  };
  const deps = (): Deps => ({
    repo, grow: growRepo, ops, now: () => now,
    chargeDeps: { repo: growRepo, creds: grow.creds!, fetchImpl: grow.fetchImpl, appUrl: ORIGIN, newToken: () => Math.random().toString(36).slice(2).padEnd(24, 'x') + Date.now().toString(36) },
  });

  return {
    repo, deps, appts, consents, tokens, fees, credits, payments, receipts, voids, calls, growRepo, grow,
    setPolicy: (p: Partial<CancelPolicy>) => { policy = sanitizePolicy({ ...DEFAULT_POLICY, ...p, text: '' }); return policy; },
    clearPolicy: () => { policy = null; },
    setAccount: (a: typeof account) => { account = a; },
    overrideOps: (o: Partial<GrowOps>) => { opsOverride = o; },
    at: (iso: string) => { now = new Date(iso); },
    now: () => now,
    addAppt: (id: string, over: Partial<ApptRow> = {}) => { const a: ApptRow = { id, tenant_id: TENANT, client_id: 'c-dana', name: 'דנה', service: 'טיפול פנים', date: '2026-11-11', start_minute: 600, hour: 10, price: 200, confirmation_status: 'confirmed', ...over }; appts.set(id, a); return a; },
    cancel: (id: string) => { appts.get(id)!.confirmation_status = 'cancelled'; },
    noShow: (id: string) => { appts.get(id)!.confirmation_status = 'no_show'; },
  };
}

const book = async (w: ReturnType<typeof world>, id: string, policy: CancelPolicy, over: Partial<ApptRow> = {}) => {
  const a = w.addAppt(id, over);
  return recordConsentAndStart(w.deps(), { tenantId: TENANT, appointmentId: id, clientId: a.client_id, clientName: a.name || '', phone: '0501234567', servicePrice: Number(a.price), serviceName: a.service || '', policy, returnUrl: `${ORIGIN}/book?t=${TENANT}` });
};
const saveCard = (w: ReturnType<typeof world>, id: string, kind: 'ok' | 'decline' = 'ok') => saveToken(w.deps(), { tenantId: TENANT, appointmentId: id, tokenRef: newMockCardToken(kind), last4: '4242', brand: 'Visa' });

// ── policy rules (pure) ──────────────────────────────────────────────────────
await ok('policy: defaults are off, fields are clamped, fees are fixed or percent of the price, the text is generated and editable', () => {
  assert.equal(sanitizePolicy(undefined).mode, 'off'); assert.equal(sanitizePolicy({ mode: 'nonsense' }).mode, 'off');
  const p = sanitizePolicy({ mode: 'saved_card', windowHours: 999, lateFee: { type: 'percent', value: 500 }, noShowFee: { type: 'fixed', value: 99999 } });
  assert.equal(p.windowHours, 24, 'an out-of-range window falls back to the default 24'); assert.equal(p.lateFee.value, 100); assert.equal(p.noShowFee.value, 5000);
  assert.equal(sanitizePolicy({ mode: 'saved_card' }).windowHours, 24);
  assert.equal(feeAmount({ type: 'percent', value: 50 }, 200), 100); assert.equal(feeAmount({ type: 'fixed', value: 80 }, 200), 80);
  assert.equal(feeAmount({ type: 'percent', value: 50 }, 0), 0, 'a percent of an unknown price asks for nothing');
  assert.ok(/24 שעות/.test(p.text) && /₪5000/.test(p.text) && !/—/.test(p.text), 'default text names the numbers and has no em dash');
  assert.equal(sanitizePolicy({ mode: 'saved_card', text: 'הנוסח שלי' }).text, 'הנוסח שלי', 'her own text is kept');
  assert.ok(/מקדמה של ₪100/.test(defaultPolicyText({ ...DEFAULT_POLICY, mode: 'deposit' })));
  assert.equal(classify('cancel', 300, 24), 'late'); assert.equal(classify('cancel', 24 * 60, 24), 'timely'); assert.equal(classify('cancel', null, 24), 'timely'); assert.equal(classify('no_show', -60, 24), 'no_show');
  assert.equal(feeQuestionHe('late_cancel', 100, 'דנה'), 'לגבות ₪100 מדנה על ביטול מאוחר?');
});

await ok('the mock card page token is signed, expires and names only its own booking', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const tok = signGrowSession(TENANT, 'a-1', 1_000);
  assert.deepEqual(verifyGrowSession(tok, 2_000), { tenantId: TENANT, appointmentId: 'a-1' });
  assert.equal(verifyGrowSession(tok, 1_000 + 61 * 60 * 1000), null); assert.equal(verifyGrowSession(tok.replace('a-1', 'a-2'), 2_000), null); assert.equal(verifyGrowSession('', 0), null);
});

// ── mode off ─────────────────────────────────────────────────────────────────
await ok('mode off (or no policy, or Grow not connected): no policy applies, no consent, no fee items, nothing charged', async () => {
  const w = world();
  assert.equal(await activePolicy(w.deps(), TENANT), null, 'no policy stored');
  w.setPolicy({ mode: 'off' }); assert.equal(await activePolicy(w.deps(), TENANT), null);
  w.setPolicy({ mode: 'saved_card' }); w.setAccount(null); assert.equal(await activePolicy(w.deps(), TENANT), null, 'not connected to Grow');
  w.setAccount({ user_id: 'G', enabled: false }); assert.equal(await activePolicy(w.deps(), TENANT), null, 'Grow switched off');
  w.setAccount({ user_id: 'G', enabled: true }); assert.ok(await activePolicy(w.deps(), TENANT));
  // an appointment that was booked without a consent never produces a fee
  w.addAppt('a-plain', { confirmation_status: 'cancelled' });
  assert.equal((await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a-plain', event: 'cancel', actor: 'client' })).status, 'no-policy');
  assert.equal(w.fees.length, 0); assert.equal(w.calls.chargeToken, 0);
});

// ── saved_card ───────────────────────────────────────────────────────────────
await ok('saved_card: consent snapshot -> hosted card page -> token (no card number) -> late cancel -> pending question -> YES -> charged, receipt, reports', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card', windowHours: 24, lateFee: { type: 'percent', value: 50 }, noShowFee: { type: 'percent', value: 100 } });
  const { consent, step } = await book(w, 'a1', policy);
  assert.equal(step.kind, 'saved_card'); assert.ok(step.url && step.url.startsWith(`${ORIGIN}/api/grow/mock-token?s=`), 'the hosted card page');
  assert.equal(consent.mode, 'saved_card'); assert.ok(consent.consented_at);
  assert.equal(consent.snapshot.policy_text, policy.text); assert.equal(consent.snapshot.window_hours, 24);
  assert.equal(consent.snapshot.late_fee_amount, 100); assert.equal(consent.snapshot.noshow_fee_amount, 200); assert.equal(consent.snapshot.service_price, 200);
  assert.equal(w.calls.chargeToken, 0, 'booking charges nothing');

  assert.equal((await saveCard(w, 'a1')).ok, true);
  assert.equal(w.tokens.length, 1); assert.equal(w.tokens[0].card_last4, '4242');
  assert.ok(!Object.keys(w.tokens[0]).some((k) => /number|pan|cvv|exp/i.test(k)), 'a token reference and the last four digits, never a card number');
  assert.equal(w.consents[0].status, 'card_saved');

  // the day before at 06:00 she cancelled at 05:00 on the day: 5 hours before the 10:00 slot
  w.at('2026-11-11T05:00:00Z'); w.at('2026-11-11T03:00:00Z'); // Israel is UTC+2 in November: 03:00Z = 05:00 local, 5 hours before 10:00
  w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  assert.equal(r.status, 'pending');
  if (r.status !== 'pending') return;
  assert.equal(r.item.amount, 100); assert.equal(r.item.kind, 'late_cancel'); assert.equal(feeQuestion(r.item), 'לגבות ₪100 מדנה על ביטול מאוחר?');
  assert.equal(w.calls.chargeToken, 0, 'detection never charges'); assert.equal(w.payments.size, 0); assert.equal(w.receipts.length, 0);

  const d = await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' });
  assert.equal(d.ok, true);
  assert.equal(w.calls.chargeToken, 1);
  const pay = [...w.payments.values()][0];
  assert.equal(pay.status, 'paid'); assert.equal(pay.kind, 'fee'); assert.equal(Number(pay.amount), 100); assert.ok(pay.transaction_id); assert.equal(pay.appointment_id, 'a1');
  assert.equal(w.receipts.length, 1);
  const rc = w.receipts[0];
  assert.equal(rc.amount, 100); assert.equal(rc.payment_method, 'אשראי'); assert.equal(rc.legal_provider, 'grow'); assert.equal(rc.client_id, 'c-dana'); assert.equal(rc.legal_status, 'issued'); assert.ok(String(rc.legal_doc_url).startsWith('https://') && rc.legal_doc_number, 'Grow issues the receipt: its link and number are stored');
  assert.equal(w.fees[0].status, 'charged'); assert.equal(w.fees[0].receipt_id, 'r1');
  const sum = monthSummary(liveReceipts(w.receipts as never[], []), 10, 2026);
  assert.equal(sum.total, 100); assert.deepEqual(sum.byMethod.map((b) => [b.method, b.total]), [['אשראי', 100]]);
});

await ok('saved_card: the same question cannot charge twice (a second tap, a second device, a repeated detection)', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  assert.equal(r.status, 'pending');
  assert.equal((await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'owner' })).status, 'exists', 'detecting again adds nothing');
  if (r.status !== 'pending') return;
  const [a, b] = await Promise.all([decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' }), decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, 'exactly one tap charges');
  assert.equal(w.calls.chargeToken, 1); assert.equal(w.receipts.length, 1);
  assert.equal((await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })).ok, false);
});

await ok('saved_card: WAIVE -> no charge, no payment, no receipt', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  if (r.status !== 'pending') throw new Error('expected a pending item');
  const d = await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'waive' });
  assert.deepEqual(d, { ok: true, status: 'waived' });
  assert.equal(w.calls.chargeToken, 0); assert.equal(w.payments.size, 0); assert.equal(w.receipts.length, 0); assert.equal(w.fees[0].status, 'waived');
  assert.equal((await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })).ok, false, 'a waived item cannot be charged later by a stale screen');
});

await ok('saved_card: no-show uses the no-show fee; a timely cancel and a booking without a saved card ask for nothing', async () => {
  const w = world('2026-11-11T09:00:00Z');                               // 11:00 local on the day: the 10:00 slot has passed
  const policy = w.setPolicy({ mode: 'saved_card', noShowFee: { type: 'fixed', value: 150 } });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.noShow('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'no_show', actor: 'owner' });
  if (r.status !== 'pending') throw new Error('expected pending'); assert.equal(r.item.kind, 'no_show'); assert.equal(r.item.amount, 150);
  assert.equal(feeQuestion(r.item), 'לגבות ₪150 מדנה על אי הגעה?');

  const t = world('2026-11-09T06:00:00Z');                                // two days before
  const p2 = t.setPolicy({ mode: 'saved_card' });
  await book(t, 'b1', p2); await saveCard(t, 'b1'); t.cancel('b1');
  assert.equal((await detect(t.deps(), { tenantId: TENANT, appointmentId: 'b1', event: 'cancel', actor: 'client' })).status, 'timely');
  const u = world('2026-11-11T03:00:00Z');
  const p3 = u.setPolicy({ mode: 'saved_card' });
  await book(u, 'c1', p3); u.cancel('c1');                                // she never saved a card
  assert.equal((await detect(u.deps(), { tenantId: TENANT, appointmentId: 'c1', event: 'cancel', actor: 'client' })).status, 'no-card');
  assert.equal(t.fees.length + u.fees.length, 0);
});

await ok('saved_card: she cancels herself inside the window -> the question still appears (she can waive); a refused card returns the question with the error', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1', 'decline'); w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'owner' });
  if (r.status !== 'pending') throw new Error('expected pending');
  const d = await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' });
  assert.equal(d.ok, false); if (!d.ok) assert.equal(d.code, 'declined');
  assert.equal(w.fees[0].status, 'pending'); assert.ok(w.fees[0].error); assert.equal(w.receipts.length, 0);
  assert.equal([...w.payments.values()][0].status, 'failed', 'the failed attempt is on record, nothing was received');
});

await ok('the consent is a snapshot: changing the policy later does not change what an earlier booking agreed to', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card', lateFee: { type: 'fixed', value: 100 } });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  w.setPolicy({ mode: 'saved_card', lateFee: { type: 'fixed', value: 400 } });
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  if (r.status !== 'pending') throw new Error('expected pending'); assert.equal(r.item.amount, 100);
  assert.deepEqual(snapshotOf(sanitizePolicy({ mode: 'off' }), 100), null);
});

await ok('undoing a no-show or a cancel voids the question that is still waiting', async () => {
  const w = world('2026-11-11T09:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.noShow('a1');
  await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'no_show', actor: 'owner' });
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'restore', actor: 'owner' });
  assert.deepEqual(r, { status: 'restored', voided: 1 }); assert.equal(w.fees[0].status, 'voided');
});

// ── deposit ──────────────────────────────────────────────────────────────────
const payDeposit = async (w: ReturnType<typeof world>, id: string, policy: CancelPolicy) => {
  const { step } = await book(w, id, policy);
  assert.equal(step.kind, 'deposit'); assert.ok(step.url && step.url.startsWith(ORIGIN), 'the deposit page is on Grow (mock) and returns to the booking page');
  const p = [...w.payments.values()].find((x) => x.appointment_id === id)!;
  assert.equal(p.kind, 'deposit'); assert.equal(p.status, 'created'); assert.equal(Number(p.amount), 100); assert.equal(p.description, 'מקדמה לטיפול פנים');
  const grow = w.grow;
  const res = await applyNotificationByProcess(mockNotification(p as never, 'success'), w.deps().chargeDeps, (note) => approveTransaction(note, grow.creds!, grow.fetchImpl));
  assert.equal(res.status, 'paid');
  return p;
};

await ok('deposit: paid on Grow -> a receipt that does NOT mark the visit as paid -> attended: the cashier deducts it once; anything unused becomes credit', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit', deposit: { type: 'fixed', value: 100 } });
  await payDeposit(w, 'a1', policy);
  assert.equal(w.receipts.length, 1); assert.equal(w.receipts[0].amount, 100); assert.equal(w.receipts[0].appointment_id, null, 'the deposit receipt is not tied to the appointment');
  const dep = await depositForCashier(w.deps(), TENANT, 'a1');
  assert.deepEqual(dep && dep.amount, 100);
  await applyDeposit(w.deps(), { tenantId: TENANT, appointmentId: 'a1', receiptId: 'r-visit', used: 100 });
  assert.equal(await depositForCashier(w.deps(), TENANT, 'a1'), null, 'deducted once');
  assert.equal(w.credits.length, 0);

  const v = world('2026-11-10T06:00:00Z');
  const p2 = v.setPolicy({ mode: 'deposit', deposit: { type: 'fixed', value: 100 } });
  await payDeposit(v, 'a2', p2);
  await applyDeposit(v.deps(), { tenantId: TENANT, appointmentId: 'a2', receiptId: 'r-visit', used: 60 });
  assert.equal(await v.repo.creditBalance(TENANT, 'c-dana'), 40, 'the part of the deposit above the visit total is kept as credit');
});

await ok('deposit: no-show or a late cancel -> the deposit is retained, no refund, no extra charge', async () => {
  const w = world('2026-11-11T09:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit' });
  await payDeposit(w, 'a1', policy); w.noShow('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'no_show', actor: 'owner' });
  assert.equal(r.status, 'retained'); assert.equal(w.calls.refund, 0); assert.equal(w.calls.chargeToken, 0);
  assert.equal(w.fees[0].status, 'retained'); assert.equal(w.voids.length, 0, 'the deposit receipt stands');

  const v = world('2026-11-11T03:00:00Z');                               // 5 hours before the slot
  const p2 = v.setPolicy({ mode: 'deposit' });
  await payDeposit(v, 'b1', p2); v.cancel('b1');
  assert.equal((await detect(v.deps(), { tenantId: TENANT, appointmentId: 'b1', event: 'cancel', actor: 'client' })).status, 'retained');
  assert.equal(v.calls.refund, 0);
});

await ok('deposit: timely cancel -> REFUND through Grow (the deposit receipt leaves her takings); a failed refund is kept and can be retried', async () => {
  const w = world('2026-11-09T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit', timelyCancel: 'refund' });
  const p = await payDeposit(w, 'a1', policy); w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  assert.equal(r.status, 'refunded'); assert.equal(w.calls.refund, 1);
  assert.equal(w.payments.get(p.id)!.status, 'refunded');
  assert.deepEqual(w.voids.map((x) => x.receipt_id), ['r1']);
  const sum = monthSummary(liveReceipts(w.receipts as never[], w.voids as never[]), 10, 2026);
  assert.equal(sum.total, 0, 'the returned deposit is not revenue');

  const v = world('2026-11-09T06:00:00Z');
  const p2 = v.setPolicy({ mode: 'deposit', timelyCancel: 'refund' });
  await payDeposit(v, 'b1', p2); v.cancel('b1');
  v.overrideOps({ refund: async () => ({ ok: false, code: 'unreachable', error: 'Grow is down' }) });
  const bad = await detect(v.deps(), { tenantId: TENANT, appointmentId: 'b1', event: 'cancel', actor: 'client' });
  assert.equal(bad.status, 'refund_failed'); assert.equal(v.voids.length, 0);
  v.overrideOps({});
  const again = await retryRefund(v.deps(), TENANT, v.fees[0].id);
  assert.equal(again.ok, true); assert.equal(v.fees[0].status, 'refunded'); assert.equal(v.voids.length, 1);
  assert.equal((await retryRefund(v.deps(), TENANT, v.fees[0].id)).ok, false, 'not refunded twice');
});

await ok('deposit: timely cancel -> CREDIT when she chose credit; credit is used in part and the rest stays; she cancelling herself returns the deposit whatever the window', async () => {
  const w = world('2026-11-09T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit', timelyCancel: 'credit' });
  await payDeposit(w, 'a1', policy); w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  assert.equal(r.status, 'credited'); assert.equal(w.calls.refund, 0); assert.equal(await w.repo.creditBalance(TENANT, 'c-dana'), 100);
  assert.equal(await w.repo.useCredit(TENANT, 'c-dana', 30, 'r9'), 30); assert.equal(await w.repo.creditBalance(TENANT, 'c-dana'), 70);

  const v = world('2026-11-11T03:00:00Z');                               // inside the window, but SHE cancels
  const p2 = v.setPolicy({ mode: 'deposit', timelyCancel: 'refund' });
  await payDeposit(v, 'b1', p2); v.cancel('b1');
  assert.equal((await detect(v.deps(), { tenantId: TENANT, appointmentId: 'b1', event: 'cancel', actor: 'owner' })).status, 'refunded');
});

await ok('deposit: an unpaid deposit asks for nothing; the cashier deducts nothing', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit' });
  await book(w, 'a1', policy); w.cancel('a1');
  assert.equal((await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' })).status, 'no-deposit');
  assert.equal(await depositForCashier(w.deps(), TENANT, 'a1'), null);
});

await ok('a booking whose Grow page cannot be opened still stands, with the failure recorded for her', async () => {
  const w = world();
  const policy = w.setPolicy({ mode: 'saved_card' });
  w.overrideOps({ createTokenSession: async () => ({ ok: false, code: 'unreachable', error: 'down' }) });
  const { consent, step } = await book(w, 'a1', policy);
  assert.equal(step.url, null); assert.ok(step.error); assert.equal(consent.status, 'step_failed'); assert.equal(w.consents.length, 1);
});

// ── wiring (source pins) ─────────────────────────────────────────────────────
await ok('nothing is charged without her tap: only decide() charges a token, detection never does', () => {
  const src = read('lib/grow/cancelFees.ts');
  const detectBody = src.slice(src.indexOf('export async function detect('), src.indexOf('async function returnDeposit('));
  assert.ok(!/chargeToken/.test(detectBody), 'detect() does not charge');
  const callers = [...src.matchAll(/ops\.chargeToken/g)].length;
  assert.equal(callers, 1, 'one call site');
  assert.ok(src.indexOf('ops.chargeToken') > src.indexOf('export async function decide('), 'and it is inside decide()');
  const route = read('app/api/grow/fees/decide/route.ts');
  assert.ok(/caller\(\)/.test(route) && /decision/.test(route));
});

await ok('public booking keeps working for blocked tenants and for mode off: no plan guard, silent fallbacks, the flag', () => {
  const book = read('app/api/book-appointment/route.js');
  assert.ok(!/planGuard|requireActiveTenant|is_tenant_active/.test(book), 'the public booking route has no plan guard');
  assert.ok(/policy = null;/.test(book) && /booking without it/.test(book), 'an unreadable policy means "no policy"');
  assert.ok(/policy && acceptedPolicy !== true/.test(book), 'a policy requires the tick on the server too');
  assert.ok(/growUiEnabled\(\) \? cancelDeps\(\) : null/.test(book), 'behind the Grow flag');
  for (const f of ['policy/public/route.ts', 'mock-token/route.ts']) assert.ok(!/planGuard|requireActiveTenant|is_tenant_active/.test(read(`app/api/grow/${f}`)), `${f} has no plan guard`);
  const pub = read('app/api/grow/policy/public/route.ts');
  assert.ok(/if \(!growUiEnabled\(\)\) return off\(\)/.test(pub) && /acc\.data\.enabled !== true/.test(pub), 'off when the flag is off or Grow is not connected');
  assert.ok(/mode !== 'mock' \|\| !grow\.configured/.test(read('app/api/grow/mock-token/route.ts')), 'the mock card page is 404 unless mock is allowed');
});

await ok('the booking page shows the policy and a required tick only when a policy is on, and the cancel link lets her cancel under a policy', () => {
  const page = read('app/BookingPage.jsx');
  assert.ok(/growPolicy && !policyOk/.test(page) && /data-testid="grow-policy"/.test(page) && /acceptedPolicy: growPolicy \? policyOk === true : undefined/.test(page));
  assert.ok(/growPolicy &&\s*\(/.test(page), 'the block renders only when a policy is on');
  const confirm = read('app/api/confirm/route.ts');
  assert.ok(/!underPolicy/.test(confirm) && /event: 'cancel', actor: 'client'/.test(confirm), 'the client link detects the fee and is not refused inside the window');
});

await ok('the app asks after she cancels or marks a no-show; the questions show on the home screen, the appointment and the client card; the settings are inside the Grow card', () => {
  const app = read('app/beautyos.jsx');
  assert.ok(/notifyFeeDetect\(appt\.id, "cancel"\)/.test(app) && /notifyFeeDetect\(appt\.id, "no_show"\)/.test(app) && /notifyFeeDetect\(appt\.id, "restore"\)/.test(app));
  assert.ok(/<FeeQuestions variant="home"/.test(app) && /<FeeQuestions appointmentId=\{editingAppointmentId\}/.test(app) && /<FeeQuestions clientId=\{selectedClient\?\.id\}/.test(app));
  assert.ok(/<GrowCashierCredit /.test(app) && /growDepositUsed/.test(app));
  assert.ok(/<CancelPolicyCard /.test(read('app/GrowCard.jsx')), 'inside the Grow card');
  const card = read('app/CancelPolicyCard.jsx');
  assert.ok(/!state\.connected/.test(card), 'visible only when connected to Grow');
});

await ok('new tables: in the trial gate, tenant-scoped RLS, the token reference never granted to the browser, no card data, migration only adds', () => {
  const gate = read('trial-gate-policies.sql');
  const mig = read('supabase/migrations/add_grow_cancellation.sql');
  for (const t of ['grow_cancel_policies', 'appointment_policy_consents', 'grow_card_tokens', 'cancellation_fee_items', 'client_credits']) {
    assert.ok(gate.includes(`'${t}'`), `${t} is in the gate's targets`);
    assert.ok(mig.includes(`'${t}'`), `${t} is gated by the migration`);
  }
  assert.ok(/tenant_id = public\.get_user_tenant_id\(\)/.test(mig));
  const grant = mig.match(/grant select \(([^)]*)\) on public\.grow_card_tokens/);
  assert.ok(grant && !/token_ref/.test(grant[1]), 'token_ref is not granted');
  assert.ok(!/card_number|\bpan\b|cvv|cvc|exp_month|expiry/i.test(mig.replace(/^--.*$/gm, '')), 'no card data');
  assert.ok(!/drop table|truncate|delete from/i.test(mig.replace(/^--.*$/gm, '')));
  assert.ok(/unique \(appointment_id, kind\)/.test(mig), 'one fee item per appointment and kind');
});

await ok('every unverified live Grow field is marked TODO(grow-docs)', () => {
  const live = read('lib/grow/ops.ts').split('// ── live')[1];
  assert.ok((live.match(/TODO\(grow-docs\)/g) || []).length >= 8);
  for (const op of ['createTokenSession', 'chargeToken', 'refund']) assert.ok(new RegExp(`async ${op}\\(i\\) \\{\\n\\s+//[^\\n]*TODO\\(grow-docs\\)`).test(live), `${op} is flagged`);
});

console.log(`grow cancel: ${n} ok`);
