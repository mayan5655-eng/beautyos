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
import { readCardTokenNotification } from './lib/grow/tokenFlow.ts';
import type { GrowOps } from './lib/grow/ops.ts';
import {
  activePolicy, recordConsentAndStart, saveToken, onDepositCardToken, detect, decide, retryRefund, depositForCashier, applyDeposit, feeQuestion, releaseExpiredHolds, onDepositPaid, requestDepositForAppointment,
} from './lib/grow/cancelFees.ts';
import type { CancelRepo, ConsentRow, CardConsentRow, FeeItem, TokenRow, ApptRow, PaymentRow, Deps, FeeStatus } from './lib/grow/cancelFees.ts';
import type { LedgerRow } from './lib/grow/tokenCharge.ts';
import { sanitizePolicy, feeAmount, classify, defaultPolicyText, snapshotOf, DEFAULT_POLICY, feeQuestionHe, DEPOSIT_HOLD_MINUTES, policyAppliesToService } from './lib/cancellationPolicy.ts';
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
  const cardConsents: CardConsentRow[] = [];
  const ledger: LedgerRow[] = [];
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
    async insertCardConsent(row) { const c = { id: `cc${++seq}`, ...row } as CardConsentRow; cardConsents.push(c); return c; },
    async findCardConsentByProcess(pid) { return cardConsents.find((c) => c.process_id === pid) || null; },
    async updateCardConsent(id, patch) { Object.assign(cardConsents.find((c) => c.id === id)!, patch); },
    async getCardConsent(_t, a) { return cardConsents.find((c) => c.appointment_id === a) || null; },
    async insertCharge(row) { if (ledger.some((l) => l.unique_identifier === row.unique_identifier)) return null; const l = { id: `l${++seq}`, status: 'initiated', grow_error_id: null, error: null, transaction_id: null, transaction_token: null, asmachta: null, looked_up: false, ...row } as LedgerRow; ledger.push(l); return l; },
    async updateCharge(id, patch) { Object.assign(ledger.find((l) => l.id === id)!, patch); },
    async listExpiredHolds(nowIso, tenantId) { return consents.filter((c) => c.status === 'awaiting_deposit' && !!c.hold_expires_at && c.hold_expires_at < nowIso && (!tenantId || c.tenant_id === tenantId)); },
    async releaseAppointment(_t, id) { const a = appts.get(id); if (!a || a.confirmation_status !== 'pending') return false; a.confirmation_status = 'cancelled'; return true; },
    async holdAppointment(_t, id) { const a = appts.get(id); if (!a || a.confirmation_status === 'cancelled') return false; a.confirmation_status = 'pending'; return true; },
    async confirmAppointment(_t, id) { const a = appts.get(id); if (!a) return false; if (a.confirmation_status === 'pending' || a.confirmation_status === 'confirmed') { a.confirmation_status = 'confirmed'; return true; } return false; },
    async restoreAppointment(_t, id) {
      const a = appts.get(id); if (!a) return 'missing'; if (a.confirmation_status !== 'cancelled') return 'restored';
      const s = Number(a.start_minute), e = s + 60;
      const clash = [...appts.values()].some((o) => o.id !== id && o.date === a.date && o.confirmation_status !== 'cancelled' && Number(o.start_minute) < e && s < Number(o.start_minute) + 60);
      if (clash) return 'slot-taken'; a.confirmation_status = 'confirmed'; return 'restored';
    },
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
    lookupToken: (i) => (opsOverride.lookupToken || baseOps.lookupToken)(i),
    async refund(i) { calls.refund++; return (opsOverride.refund || baseOps.refund)(i); },
  };
  const deps = (): Deps => ({
    repo, grow: growRepo, ops, now: () => now,
    seal: { encrypt: (s: string) => 'sealed:' + s.split('').reverse().join(''), decrypt: (s: string) => s.slice(7).split('').reverse().join('') },
    newChargeId: () => 100000000 + Math.floor(Math.random() * 4000000000),
    chargeDeps: { repo: growRepo, creds: grow.creds!, fetchImpl: grow.fetchImpl, appUrl: ORIGIN, newToken: () => Math.random().toString(36).slice(2).padEnd(24, 'x') + Date.now().toString(36) },
  });

  return {
    repo, deps, appts, consents, tokens, cardConsents, ledger, fees, credits, payments, receipts, voids, calls, growRepo, grow,
    setPolicy: (p: Partial<CancelPolicy>) => { policy = sanitizePolicy({ ...DEFAULT_POLICY, ...p, text: '' }); return policy; },
    clearPolicy: () => { policy = null; },
    setAccount: (a: typeof account) => { account = a; },
    overrideOps: (o: Partial<GrowOps>) => { opsOverride = o; },
    at: (iso: string) => { now = new Date(iso); },
    now: () => now,
    addAppt: (id: string, over: Partial<ApptRow> = {}) => { const a: ApptRow = { id, tenant_id: TENANT, client_id: 'c-dana', client_phone: '0501234567', name: 'דנה', service: 'טיפול פנים', date: '2026-11-11', start_minute: 600, hour: 10, price: 200, confirmation_status: 'confirmed', ...over }; appts.set(id, a); return a; },
    cancel: (id: string) => { appts.get(id)!.confirmation_status = 'cancelled'; },
    noShow: (id: string) => { appts.get(id)!.confirmation_status = 'no_show'; },
  };
}

const book = async (w: ReturnType<typeof world>, id: string, policy: CancelPolicy, over: Partial<ApptRow> = {}) => {
  // The booking route inserts a deposit-mode booking as PENDING (a held slot); any other mode as confirmed.
  const held = policy.mode === 'deposit' && feeAmount(policy.deposit, Number(over.price ?? 200)) > 0;
  const a = w.addAppt(id, { confirmation_status: held ? 'pending' : 'confirmed', ...over });
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

await ok('saved_card: the charge goes through the ledger (identifier saved first), and the stored token is sealed', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  assert.equal(w.tokens[0].token_encrypted, true); assert.ok(w.tokens[0].token_ref.startsWith('sealed:'), 'the token is not stored in the clear');
  assert.equal(w.cardConsents.length, 1, 'the consent with its exact words is stored'); assert.ok(w.cardConsents[0].consent_text.length > 60); assert.equal(w.cardConsents[0].client_id, 'c-dana');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  if (r.status !== 'pending') throw new Error('expected a pending item');
  assert.equal((await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })).ok, true);
  assert.equal(w.ledger.length, 1); assert.equal(w.ledger[0].status, 'succeeded'); assert.ok(Number.isInteger(w.ledger[0].unique_identifier)); assert.equal(w.ledger[0].client_id, 'c-dana');
});

await ok('saved_card: a card saved for one client is never charged for another client\'s appointment (checked on the server)', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  if (r.status !== 'pending') throw new Error('expected a pending item');
  w.appts.get('a1')!.client_id = 'c-someone-else';
  const d = await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' });
  assert.equal(d.ok, false); assert.equal((d as { code: string }).code, 'no-card');
  assert.equal(w.calls.chargeToken, 0, 'Grow was never called'); assert.equal(w.ledger.length, 0); assert.equal(w.fees[0].status, 'pending', 'the question is still there');
});

await ok('saved_card: error 1010 is not retried; the fee stays "charging" so a second tap cannot charge twice', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  w.overrideOps({ chargeToken: async () => ({ ok: false, code: 'duplicate', errId: 1010, error: 'dup' }), lookupToken: async () => ({ ok: true, found: false, status: 'unknown' }) });
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  if (r.status !== 'pending') throw new Error('expected a pending item');
  const d = await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' });
  assert.equal(d.ok, false); assert.match((d as { error: string }).error, /Grow/);
  assert.equal(w.calls.chargeToken, 1, 'one attempt'); assert.equal(w.ledger[0].status, 'unknown'); assert.equal(w.fees[0].status, 'charging');
  assert.equal((await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })).ok, false, 'a second tap finds it already claimed');
  assert.equal(w.calls.chargeToken, 1);
});

await ok('saved_card: a refused charge then a retry uses a NEW identifier', async () => {
  const w = world('2026-11-11T03:00:00Z');
  const policy = w.setPolicy({ mode: 'saved_card' });
  await book(w, 'a1', policy); await saveCard(w, 'a1'); w.cancel('a1');
  let first = true;
  w.overrideOps({ chargeToken: async (i) => { if (first) { first = false; return { ok: false, code: 'declined', error: 'no funds', errId: 103 }; } return w.grow.ops!.chargeToken(i); } });
  const r = await detect(w.deps(), { tenantId: TENANT, appointmentId: 'a1', event: 'cancel', actor: 'client' });
  if (r.status !== 'pending') throw new Error('expected a pending item');
  assert.equal((await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })).ok, false);
  assert.equal(w.fees[0].status, 'pending');
  assert.equal((await decide(w.deps(), { tenantId: TENANT, feeId: r.item.id, decision: 'charge' })).ok, true);
  assert.equal(w.ledger.length, 2); assert.notEqual(w.ledger[0].unique_identifier, w.ledger[1].unique_identifier); assert.deepEqual(w.ledger.map((l) => l.status), ['failed', 'succeeded']);
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
  const afterPaid = async (pay: GrowPayment) => { if (/^מקדמה/.test(pay.description || '')) await onDepositPaid(w.deps(), { tenantId: pay.tenant_id, appointmentId: pay.appointment_id, paymentId: pay.id }); };
  const res = await applyNotificationByProcess(mockNotification(p as never, 'success'), { ...w.deps().chargeDeps, afterPaid }, (note) => approveTransaction(note, grow.creds!, grow.fetchImpl));
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
  // A clear refusal: the item is open again and ONE retry may send it.
  v.overrideOps({ refund: async () => ({ ok: false, code: 'declined', error: 'refused' }) });
  const bad = await detect(v.deps(), { tenantId: TENANT, appointmentId: 'b1', event: 'cancel', actor: 'client' });
  assert.equal(bad.status, 'refund_failed'); assert.equal(v.voids.length, 0);
  v.overrideOps({});
  const again = await retryRefund(v.deps(), TENANT, v.fees[0].id);
  assert.equal(again.ok, true); assert.equal(v.fees[0].status, 'refunded'); assert.equal(v.voids.length, 1);
  assert.equal((await retryRefund(v.deps(), TENANT, v.fees[0].id)).ok, false, 'not refunded twice');

  // No answer from Grow: the money may already be back. It is NOT retried (2026-10-20 audit: a retry refunded twice).
  const u = world('2026-11-09T06:00:00Z');
  const p3 = u.setPolicy({ mode: 'deposit', timelyCancel: 'refund' });
  await payDeposit(u, 'c1', p3); u.cancel('c1');
  let refunds = 0;
  u.overrideOps({ refund: async () => { refunds++; return { ok: false, code: 'unreachable', error: 'Grow is down' }; } });
  await detect(u.deps(), { tenantId: TENANT, appointmentId: 'c1', event: 'cancel', actor: 'client' });
  assert.equal(u.fees[0].status, 'charging'); assert.match(String(u.fees[0].error), /unknown/);
  u.overrideOps({});
  assert.equal((await retryRefund(u.deps(), TENANT, u.fees[0].id)).ok, false, 'an unknown refund is never sent again by a tap');
  assert.equal(refunds, 1);
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


// ── the 30-minute deposit hold ───────────────────────────────────────────────
const payLater = async (w: ReturnType<typeof world>, p: GrowPayment & Record<string, unknown>) => {
  const grow = w.grow;
  const afterPaid = async (pay: GrowPayment) => { if (/^מקדמה/.test(pay.description || '')) await onDepositPaid(w.deps(), { tenantId: pay.tenant_id, appointmentId: pay.appointment_id, paymentId: pay.id }); };
  return applyNotificationByProcess(mockNotification(p as never, 'success'), { ...w.deps().chargeDeps, afterPaid }, (note) => approveTransaction(note, grow.creds!, grow.fetchImpl));
};

await ok('deposit hold: booked as PENDING for 30 minutes, the slot stays blocked; unpaid -> released automatically and the slot frees up', async () => {
  assert.equal(DEPOSIT_HOLD_MINUTES, 30);
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit' });
  const { consent, step } = await book(w, 'a1', policy);
  assert.ok(step.url); assert.equal(w.appts.get('a1')!.confirmation_status, 'pending');
  assert.equal(consent.hold_expires_at, '2026-11-10T06:30:00.000Z'); assert.equal(consent.status, 'awaiting_deposit');

  w.at('2026-11-10T06:29:00Z');                                           // 29 minutes: still held
  assert.deepEqual(await releaseExpiredHolds(w.deps()), { released: 0, confirmed: 0 });
  assert.equal(w.appts.get('a1')!.confirmation_status, 'pending', 'the slot is still blocked');

  w.at('2026-11-10T06:31:00Z');                                           // 31 minutes: released
  assert.deepEqual(await releaseExpiredHolds(w.deps()), { released: 1, confirmed: 0 });
  assert.equal(w.appts.get('a1')!.confirmation_status, 'cancelled', 'cancelled, so the calendar and the availability list show the slot free');
  assert.equal(w.consents[0].status, 'hold_expired'); assert.equal(w.consents[0].hold_expires_at, null);
  assert.equal([...w.payments.values()][0].status, 'cancelled', 'the unpaid payment page is closed');
  assert.equal(w.fees.length, 0, 'no fee item, nothing to charge or refund'); assert.equal(w.calls.chargeToken, 0);
  assert.deepEqual(await releaseExpiredHolds(w.deps()), { released: 0, confirmed: 0 }, 'running it again changes nothing');
});

await ok('deposit hold: a paid deposit CONFIRMS the booking and ends the hold (a later release does nothing)', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit' });
  await book(w, 'a1', policy);
  w.at('2026-11-10T06:10:00Z');
  const p = [...w.payments.values()][0];
  assert.equal((await payLater(w, p)).status, 'paid');
  assert.equal(w.appts.get('a1')!.confirmation_status, 'confirmed'); assert.equal(w.consents[0].status, 'deposit_paid'); assert.equal(w.consents[0].hold_expires_at, null);
  w.at('2026-11-10T07:00:00Z');
  assert.deepEqual(await releaseExpiredHolds(w.deps()), { released: 0, confirmed: 0 });
  assert.equal(w.appts.get('a1')!.confirmation_status, 'confirmed');
});

await ok('deposit hold: paid just before the end but not yet processed -> confirmed by the release run, not released', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit' });
  await book(w, 'a1', policy);
  const p = [...w.payments.values()][0];
  Object.assign(p, { status: 'paid', transaction_id: 'tx1' });            // the callback has not run its confirm step yet
  w.at('2026-11-10T06:31:00Z');
  assert.deepEqual(await releaseExpiredHolds(w.deps()), { released: 0, confirmed: 1 });
  assert.equal(w.appts.get('a1')!.confirmation_status, 'confirmed');
});

await ok('deposit hold: paid AFTER the release -> the booking is restored if the slot is still free; if it was taken the deposit is refunded automatically', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit' });
  await book(w, 'a1', policy);
  const p = [...w.payments.values()][0];
  w.at('2026-11-10T06:45:00Z'); await releaseExpiredHolds(w.deps());
  assert.equal(w.appts.get('a1')!.confirmation_status, 'cancelled');
  // the unpaid page was closed, but Grow reports the payment anyway (she paid in the last minute)
  Object.assign(p, { status: 'created' });
  assert.equal((await payLater(w, p)).status, 'paid');
  assert.equal(w.appts.get('a1')!.confirmation_status, 'confirmed', 'restored'); assert.equal(w.consents[0].status, 'deposit_paid');

  const v = world('2026-11-10T06:00:00Z');
  const p2 = v.setPolicy({ mode: 'deposit' });
  await book(v, 'b1', p2);
  const pay2 = [...v.payments.values()][0];
  v.at('2026-11-10T06:45:00Z'); await releaseExpiredHolds(v.deps());
  v.addAppt('other', { client_id: 'c-other', name: 'מישהי אחרת', confirmation_status: 'confirmed' });   // someone else took the same slot
  Object.assign(pay2, { status: 'created' });
  assert.equal((await payLater(v, pay2)).status, 'paid');
  assert.equal(v.appts.get('b1')!.confirmation_status, 'cancelled', 'the slot is not hers any more');
  assert.equal(v.calls.refund, 1); assert.equal(v.fees[0].kind, 'deposit_return'); assert.equal(v.fees[0].status, 'refunded'); assert.equal(v.voids.length, 1, 'her deposit went back and the receipt left the books');
});

await ok('deposit hold: other modes and a zero deposit are never held; a release run for one business leaves the others alone', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const sc = w.setPolicy({ mode: 'saved_card' });
  const { consent } = await book(w, 'a1', sc);
  assert.equal(consent.hold_expires_at, null); assert.equal(w.appts.get('a1')!.confirmation_status, 'confirmed');
  const zero = w.setPolicy({ mode: 'deposit', deposit: { type: 'percent', value: 0 } });
  const z = await book(w, 'a2', zero, { price: 0 });
  assert.equal(z.consent.hold_expires_at, null); assert.equal(w.appts.get('a2')!.confirmation_status, 'confirmed', 'no real deposit: nothing to hold for');
  w.at('2026-11-10T09:00:00Z');
  assert.deepEqual(await releaseExpiredHolds(w.deps(), '99999999-9999-9999-9999-999999999999'), { released: 0, confirmed: 0 });
});


// ── deposit per service ──────────────────────────────────────────────────────
await ok('per service: deposit mode covers only the services marked "requires deposit"; saved-card mode covers all; off covers none', () => {
  assert.equal(policyAppliesToService('deposit', { requires_deposit: true }), true);
  assert.equal(policyAppliesToService('deposit', { requires_deposit: false }), false);
  assert.equal(policyAppliesToService('deposit', {}), false, 'default off');
  assert.equal(policyAppliesToService('deposit', null), false);
  assert.equal(policyAppliesToService('saved_card', {}), true);
  assert.equal(policyAppliesToService('off', { requires_deposit: true }), false);
});

await ok('per service: the booking route and the page apply the policy only to a marked service; any other service books as today', () => {
  const route = read('app/api/book-appointment/route.js');
  assert.ok(/if \(policy && !policyAppliesToService\(policy\.mode, svcRow\)\) policy = null;/.test(route), 'an unmarked service drops the policy before the tick, the consent and the hold');
  assert.ok(route.indexOf('policyAppliesToService(policy.mode, svcRow)') < route.indexOf('policy && acceptedPolicy !== true'), 'before the tick is required');
  assert.ok(/\.select\("\*"\)\s+\.eq\("tenant_id", activeTenantId\)\s+\.eq\("name", service\)/.test(route), 'the service row is read whole, so a missing requires_deposit column cannot break booking');
  const page = read('app/BookingPage.jsx');
  assert.ok(/needsPolicy = !!growPolicy && policyAppliesToService\(growPolicy\.mode, selectedService\)/.test(page) && /needsPolicy && !policyOk/.test(page) && /\{needsPolicy && \(/.test(page) && /acceptedPolicy: needsPolicy/.test(page));
});

await ok('per service: the toggle is in the services settings (default off, degrades without the column), and the migration adds the column', () => {
  const app = read('app/beautyos.jsx');
  assert.ok(/SERVICE_FIELDS = \[[^\]]*"requires_deposit"\]/.test(app));
  assert.ok(/<ServiceDepositToggle checked=\{svc\.requires_deposit===true\}/.test(app), 'off unless true');
  assert.ok(/const \{ field, requires_deposit, \.\.\.reduced \} = row;/.test(app) && /"requires_deposit" in patch/.test(app) && /const \{ field, requires_deposit, \.\.\.reduced \} = patch;/.test(app), 'a service save still works before the migration');
  assert.ok(/!state\.connected|!connected\) return null/.test(read('app/ServiceDepositToggle.jsx')), 'visible only when connected to Grow');
  assert.ok(/alter table public\.service_prices add column if not exists requires_deposit boolean not null default false/.test(read('supabase/migrations/add_grow_cancellation.sql')));
});

await ok('manual booking: "request deposit?" is pre-set from the service; on -> the 30-minute pending hold and the Grow link; the same rules apply afterwards', async () => {
  const w = world('2026-11-10T06:00:00Z');
  w.setPolicy({ mode: 'deposit', deposit: { type: 'fixed', value: 100 } });
  w.addAppt('m1');                                                        // she booked it by hand: confirmed
  const r = await requestDepositForAppointment(w.deps(), { tenantId: TENANT, appointmentId: 'm1', returnUrl: `${ORIGIN}/book?t=${TENANT}` });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.amount, 100); assert.equal(r.minutes, 30); assert.equal(r.phone, '0501234567'); assert.ok(r.url.startsWith(ORIGIN), 'the Grow payment link');
  assert.equal(w.appts.get('m1')!.confirmation_status, 'pending', 'held');
  assert.equal(w.consents[0].snapshot.via, 'owner'); assert.equal(w.consents[0].hold_expires_at, '2026-11-10T06:30:00.000Z');
  const p = [...w.payments.values()][0];
  assert.equal(p.kind, 'deposit'); assert.equal(Number(p.amount), 100);
  assert.equal((await requestDepositForAppointment(w.deps(), { tenantId: TENANT, appointmentId: 'm1', returnUrl: ORIGIN })).ok, false, 'asked once');
  // unpaid -> released
  w.at('2026-11-10T06:31:00Z');
  assert.deepEqual(await releaseExpiredHolds(w.deps()), { released: 1, confirmed: 0 });
  assert.equal(w.appts.get('m1')!.confirmation_status, 'cancelled');

  // paid in time -> confirmed, and a later timely cancel refunds like any deposit
  const v = world('2026-11-09T06:00:00Z');
  v.setPolicy({ mode: 'deposit', timelyCancel: 'refund' });
  v.addAppt('m2');
  const r2 = await requestDepositForAppointment(v.deps(), { tenantId: TENANT, appointmentId: 'm2', returnUrl: ORIGIN });
  assert.equal(r2.ok, true);
  const p2 = [...v.payments.values()][0];
  assert.equal((await payLater(v, p2)).status, 'paid');
  assert.equal(v.appts.get('m2')!.confirmation_status, 'confirmed');
  v.cancel('m2');
  assert.equal((await detect(v.deps(), { tenantId: TENANT, appointmentId: 'm2', event: 'cancel', actor: 'client' })).status, 'refunded');
});

await ok('manual booking: refused without deposit mode, without a phone, or without Grow; a booking made by hand never needs the client to tick anything', async () => {
  const w = world('2026-11-10T06:00:00Z');
  w.setPolicy({ mode: 'saved_card' });
  w.addAppt('m1');
  const a = await requestDepositForAppointment(w.deps(), { tenantId: TENANT, appointmentId: 'm1', returnUrl: ORIGIN });
  assert.deepEqual([a.ok, !a.ok && a.code], [false, 'not-deposit']);
  w.setPolicy({ mode: 'deposit' }); w.addAppt('m2', { client_phone: '' });
  const b = await requestDepositForAppointment(w.deps(), { tenantId: TENANT, appointmentId: 'm2', returnUrl: ORIGIN });
  assert.deepEqual([b.ok, !b.ok && b.code], [false, 'no-phone']);
  assert.equal(w.appts.get('m2')!.confirmation_status, 'confirmed', 'a refused request leaves the booking as it was');
  w.setAccount(null);
  const c = await requestDepositForAppointment(w.deps(), { tenantId: TENANT, appointmentId: 'm1', returnUrl: ORIGIN });
  assert.equal(c.ok, false);
  const route = read('app/api/grow/deposit/request/route.ts');
  assert.ok(/caller\(\)/.test(route) && /isDemoTenantId/.test(route));
  const app = read('app/beautyos.jsx');
  assert.ok(/<ApptDepositToggle serviceName=\{newAppt\.service\} serviceRequires=\{\(services\.find/.test(app) && /!editingAppointmentId&&!apptRepeat\.on&&<ApptDepositToggle/.test(app), 'only for a new single booking');
  assert.ok(/\/api\/grow\/deposit\/request/.test(app) && /<DepositLinkSheet info=\{depositLink\}/.test(app));
  assert.ok(/wa\.me\/\$\{waDigits/.test(read('app/DepositLinkSheet.jsx')), 'a wa.me link with the Grow payment link');
});

// ── deposit mode also saves the card (charge and save) ───────────────────────
await ok('deposit + card tick: the page is a charge-and-save page; the paid callback stores a SEALED token for this booking\'s business and client; the booking status is untouched', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit', deposit: { type: 'fixed', value: 100 } });
  const a = w.addAppt('d1', { confirmation_status: 'pending' });
  const d = w.deps();
  let sent: FormData | null = null;
  const inner = d.chargeDeps.fetchImpl!;
  d.chargeDeps = { ...d.chargeDeps, fetchImpl: (async (u: RequestInfo | URL, init?: RequestInit) => { sent = init?.body as FormData; return inner(u, init); }) as typeof fetch };
  const { step } = await recordConsentAndStart(d, { tenantId: TENANT, appointmentId: 'd1', clientId: a.client_id, clientName: 'דנה כהן', phone: '0501234567', servicePrice: 200, serviceName: 'טיפול פנים', policy, returnUrl: `${ORIGIN}/book?t=${TENANT}`, cardConsentText: 'הסכמה לשמירת כרטיס' });
  assert.equal(step.kind, 'deposit'); assert.ok(step.url);
  assert.equal((sent as FormData | null)?.get('saveCardToken'), '1', 'charge and save: the page is asked to keep the token');
  assert.equal(w.cardConsents.length, 1); assert.equal(w.cardConsents[0].mode, 'charge_and_save'); assert.equal(w.cardConsents[0].consent_text, 'הסכמה לשמירת כרטיס'); assert.equal(w.cardConsents[0].client_id, 'c-dana');

  const p = [...w.payments.values()].find((x) => x.appointment_id === 'd1')!;
  const raw = { ...mockNotification(p as never, 'success'), 'data[cardToken]': 'DEPOSITTOKEN123', 'data[cardSuffix]': '4580', 'data[cardBrand]': 'Visa' };
  const afterPaid = async (pay: GrowPayment, body?: Record<string, unknown>) => {
    await onDepositPaid(w.deps(), { tenantId: pay.tenant_id, appointmentId: pay.appointment_id, paymentId: pay.id });
    const ct = body ? readCardTokenNotification(body) : null;
    if (ct) await onDepositCardToken(w.deps(), ct, pay);
  };
  const res = await applyNotificationByProcess(raw, { ...w.deps().chargeDeps, afterPaid }, async () => {});
  assert.equal(res.status, 'paid');
  assert.equal(w.tokens.length, 1); assert.equal(w.tokens[0].tenant_id, TENANT); assert.equal(w.tokens[0].client_id, 'c-dana'); assert.equal(w.tokens[0].token_encrypted, true); assert.ok(!w.tokens[0].token_ref.includes('DEPOSITTOKEN'), 'sealed');
  assert.equal(w.cardConsents[0].status, 'saved');
  assert.equal(w.consents[0].token_id, w.tokens[0].id); assert.equal(w.consents[0].status, 'deposit_paid', 'the deposit status is not overwritten by the card');
  assert.equal(w.appts.get('d1')!.confirmation_status, 'confirmed', 'the paid deposit still confirms the booking');
  const again = await onDepositCardToken(w.deps(), readCardTokenNotification(raw)!, p);
  assert.equal(again.status, 'already-saved'); assert.equal(w.tokens.length, 1);
});

await ok('deposit without the tick (a deposit she asked for herself), or a callback for a booking with no card consent: no card is saved', async () => {
  const w = world('2026-11-10T06:00:00Z');
  const policy = w.setPolicy({ mode: 'deposit', deposit: { type: 'fixed', value: 100 } });
  const a = w.addAppt('d2', { confirmation_status: 'pending' });
  const d = w.deps();
  let sent: FormData | null = null;
  const inner = d.chargeDeps.fetchImpl!;
  d.chargeDeps = { ...d.chargeDeps, fetchImpl: (async (u: RequestInfo | URL, init?: RequestInit) => { sent = init?.body as FormData; return inner(u, init); }) as typeof fetch };
  await recordConsentAndStart(d, { tenantId: TENANT, appointmentId: 'd2', clientId: a.client_id, clientName: 'דנה כהן', phone: '0501234567', servicePrice: 200, serviceName: 'טיפול פנים', policy, returnUrl: `${ORIGIN}/book?t=${TENANT}`, via: 'owner' });
  assert.equal((sent as FormData | null)?.get('saveCardToken'), null, 'her own deposit request never asks the client to keep a card');
  assert.equal(w.cardConsents.length, 0);
  const p = [...w.payments.values()].find((x) => x.appointment_id === 'd2')!;
  const r = await onDepositCardToken(w.deps(), readCardTokenNotification({ ...mockNotification(p as never, 'success'), 'data[cardToken]': 'X1' })!, p);
  assert.equal(r.status, 'unknown-process'); assert.equal(w.tokens.length, 0);
});

// ── wiring (source pins) ─────────────────────────────────────────────────────
await ok('nothing is charged without her tap: only decide() charges a token, detection never does', () => {
  const src = read('lib/grow/cancelFees.ts');
  const detectBody = src.slice(src.indexOf('export async function detect('), src.indexOf('async function returnDeposit('));
  assert.ok(!/chargeToken/.test(detectBody), 'detect() does not charge');
  assert.ok(!/ops\.chargeToken/.test(src), 'cancelFees never talks to Grow about a charge directly');
  const callers = [...src.matchAll(/chargeSavedCard\(/g)].length;
  assert.equal(callers, 1, 'one call site');
  assert.ok(src.indexOf('chargeSavedCard(') > src.indexOf('export async function decide('), 'and it is inside decide()');
  const tc = read('lib/grow/tokenCharge.ts');
  assert.equal([...tc.matchAll(/ops\.chargeToken/g)].length, 1, 'and the one Grow charge call lives in tokenCharge.ts');
  const route = read('app/api/grow/fees/decide/route.ts');
  assert.ok(/caller\(\)/.test(route) && /decision/.test(route));
});

await ok('public booking keeps working for blocked tenants and for mode off: no plan guard, silent fallbacks, the flag', () => {
  const book = read('app/api/book-appointment/route.js');
  assert.ok(!/planGuard|requireActiveTenant|is_tenant_active/.test(book), 'the public booking route has no plan guard');
  assert.ok(/policy = null;/.test(book) && /booking without it/.test(book), 'an unreadable policy means "no policy"');
  assert.ok(/policy && acceptedPolicy !== true/.test(book), 'a policy requires the tick on the server too');
  assert.ok(/growUiEnabled\(process\.env, activeTenantId\) \? cancelDeps\(\) : null/.test(book), 'behind the Grow flag');
  for (const f of ['policy/public/route.ts', 'mock-token/route.ts']) assert.ok(!/planGuard|requireActiveTenant|is_tenant_active/.test(read(`app/api/grow/${f}`)), `${f} has no plan guard`);
  const pub = read('app/api/grow/policy/public/route.ts');
  assert.ok(/if \(!growUiEnabled\(\)\) return off\(\)/.test(pub) && /acc\.data\.enabled !== true/.test(pub), 'off when the flag is off or Grow is not connected');
  assert.ok(/const card = resolveGrow\(process\.env, APP_URL\)\.configured/.test(pub), 'card: true only when her clearing is on and the deployment can charge');
  const bp = read('app/BookingPage.jsx');
  assert.ok(/j\.card === true\) setCardPay\(true\)/.test(bp) && /\{cardPay && \(/.test(bp), 'the booking page tells the client she can pay by card');
  assert.ok(/fetch\("\/api\/grow\/booking-pay"/.test(bp) && /setBookedId\(result\.appointmentId/.test(bp) && /data-testid="booking-pay-now"/.test(bp), 'after booking, a pay-by-card button opens the payment page for that appointment');
  const bpay = read('app/api/grow/booking-pay/route.ts');
  const st = read('app/api/grow/status/route.ts');
  assert.ok(!/c\.session\.from\(/.test(st) && /admin\(\)\.from\('grow_accounts'\)[^\n]*\.eq\('tenant_id', c\.tenantId\)/.test(st), 'the Grow card reads her account with the service role, scoped to her tenant');
  assert.ok(!/planGuard|requireActiveTenant|is_tenant_active/.test(bpay), 'booking-pay has no plan guard (public)');
  assert.ok(/amount: Number\(a\.price\)/.test(bpay) && /phone: a\.client_phone/.test(bpay) && !/b\.amount|b\.price|b\.phone/.test(bpay), 'amount and phone come from the appointment, never the browser');
  assert.ok(/acc\.data\.enabled !== true/.test(bpay) && /a\.self_booked !== true/.test(bpay) && /FRESH_MS/.test(bpay) && /checkIpLimit\(request, 'booking-pay'\)/.test(bpay), 'only for an enabled Grow business, a fresh self-booked appointment, rate limited');
  assert.ok(/mode !== 'mock' \|\| !grow\.configured/.test(read('app/api/grow/mock-token/route.ts')), 'the mock card page is 404 unless mock is allowed');
});

await ok('the booking page shows the policy and a required tick only when a policy is on, and the cancel link lets her cancel under a policy', () => {
  const page = read('app/BookingPage.jsx');
  assert.ok(/needsPolicy && !policyOk/.test(page) && /data-testid="grow-policy"/.test(page) && /acceptedPolicy: needsPolicy \? policyOk === true : undefined/.test(page));
  assert.ok(/needsPolicy &&\s*\(/.test(page), 'the block renders only when a policy applies to the chosen service');
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

await ok('the hold is wired: the booking route holds as pending and defers the confirmation, releases lazily, the cron and the availability route release too, a paid deposit confirms', () => {
  const book = read('app/api/book-appointment/route.js');
  assert.ok(/heldForDeposit \? "pending" : "confirmed"/.test(book), 'a held booking is inserted as pending');
  assert.ok(/if \(!heldForDeposit\) after\(/.test(book), 'the client confirmation waits for the deposit');
  assert.ok(book.indexOf('releaseExpiredHolds(policyDeps, activeTenantId)') > 0 && book.indexOf('releaseExpiredHolds(policyDeps, activeTenantId)') < book.indexOf('const [\n      { data: svcRows'), 'expired holds are released BEFORE the calendar is read');
  const cron = read('app/api/grow/release-holds/route.ts');
  assert.ok(cron.indexOf('isAuthorizedCron(request)') > 0 && cron.indexOf('isAuthorizedCron(request)') < cron.indexOf('growUiEnabled()'), 'the cron is protected');
  // Parsed, not pattern-matched: Vercel rewrites vercel.json as minified JSON inside its build, so a formatting-sensitive pin fails there.
  assert.equal(((JSON.parse(read('vercel.json')).crons || []) as { path: string; schedule: string }[]).find((c) => c.path === '/api/grow/release-holds')?.schedule, '*/5 * * * *', 'every 5 minutes');
  assert.ok(/releaseExpiredHolds\(deps, tenantId\)/.test(read('app/api/availability/route.ts')), 'availability frees an expired slot at once');
  for (const f of ['notify', 'webhook', 'mock-pay']) assert.ok(/afterPaid: afterPaidHook\(\)/.test(read(`app/api/grow/${f}/route.ts`)), `${f} confirms the booking when the deposit is paid`);
  assert.ok(/התור שמור עבורך ל-30 דקות/.test(read('app/BookingPage.jsx')), 'the client is told about the 30 minutes');
  const mig = read('supabase/migrations/add_grow_cancellation.sql');
  assert.ok(/hold_expires_at/.test(mig) && /hold_expired/.test(mig) && /add column if not exists hold_expires_at/.test(mig), 'the migration adds the hold and stays re-runnable');
});

await ok('a held booking is labelled "ממתינה למקדמה" with the minutes left, in the calendar, the today list and the appointment card', () => {
  const badge = read('app/HoldBadge.jsx');
  assert.ok(/ממתינה למקדמה/.test(badge) && /נשארו \$\{m\} דקות/.test(badge) && /נשארה דקה/.test(badge));
  const app = read('app/beautyos.jsx');
  assert.equal((app.match(/<HoldBadge /g) || []).length, 3, 'today list, calendar card and appointment card');
  const route = read('app/api/grow/holds/route.ts');
  assert.ok(/\.eq\('status', 'awaiting_deposit'\)/.test(route) && /\.gt\('hold_expires_at'/.test(route) && /caller\(\)/.test(route), 'only live holds, only hers, behind the flag');
});

await ok('the live token calls are the documented ones, checked against Grow sandbox (scripts/smoke/grow-token-sandbox.mjs)', () => {
  const live = read('lib/grow/ops.ts').split('// ── live')[1];
  for (const call of ['createPaymentProcess', 'createTransactionWithToken', 'getTokenTransactionsByExternalIdentifiers', 'refundTransaction']) assert.ok(live.includes(call), `${call} is called`);
  assert.ok(!/TODO\(grow-docs\)/.test(read('lib/grow/ops.ts')), 'no guessed field is left in the token operations');
  assert.ok(/apiKey/.test(read('lib/grow/tokenFlow.ts')) && !/x-api-key/.test(live), 'the apiKey is a body field, never a header');
});

console.log(`grow cancel: ${n} ok`);
