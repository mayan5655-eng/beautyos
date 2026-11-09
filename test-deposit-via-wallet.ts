// Booking deposits through the wallet page when Grow gave no card (redirect) page code.
//
// Grow live issued a WALLET page code and a TOKEN page code; the card redirect page code (GROW_PAGE_CODE) may never come. Without it a
// booking deposit is a Kalmea /pay/<token> link (card, Bit, Apple Pay, Google Pay in Grow's SDK), exactly like the cashier and payment
// requests. With GROW_PAGE_CODE set, the redirect path is unchanged. What must hold either way: the 30-minute hold, the policy consent,
// the amount from the stored snapshot, approveTransaction with the page code the client paid on, one open link per deposit, no
// payment after the hold ran out.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGrow } from './lib/grow/adapter.ts';
import { growPlatformStatus, growCredentials } from './lib/grow/config.ts';
import { applyNotification, approveTransaction } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';
import { recordConsentAndStart, freshDepositLink, depositHoldOpen } from './lib/grow/cancelFees.ts';
import type { CancelRepo, ConsentRow, CardConsentRow, ApptRow, PaymentRow, Deps } from './lib/grow/cancelFees.ts';
import type { GrowOps } from './lib/grow/ops.ts';
import { depositsOnWallet, approveCredsFor, opensOnWallet, startWalletSession, payContextOf, visitWhenHe, DEPOSIT_HOLD_OVER_HE } from './lib/grow/wallet.ts';
import type { WalletCreds } from './lib/grow/wallet.ts';
import { sanitizePolicy, DEFAULT_POLICY, DEPOSIT_HOLD_MINUTES } from './lib/cancellationPolicy.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TENANT = '22222222-2222-2222-2222-222222222222';
const ORIGIN = 'https://preview.kalmea.test';
// Production shape of what Grow sent: platform key, wallet page code, token key and token page code. Fake values.
const WALLET_ONLY = { GROW_MODE: 'live', GROW_ENV: 'production', GROW_API_KEY: 'PLATFORMKEY', GROW_WALLET_PAGE_CODE: 'WALLETPAGE', GROW_TOKEN_API_KEY: 'TOKENKEY', GROW_TOKEN_PAGE_CODE: 'TOKENPAGE' };
const WITH_CARD = { ...WALLET_ONLY, GROW_PAGE_CODE: 'CARDPAGE' };

// ── a small world: one deposit-mode business, one held booking ─────────────────
function world(env: Record<string, string>) {
  let now = new Date('2026-11-10T08:00:00Z');
  const grow = resolveGrow(env, ORIGIN);
  const payments = new Map<string, GrowPayment & Record<string, unknown>>();
  const consents: ConsentRow[] = [];
  const cardConsents: CardConsentRow[] = [];
  const appts = new Map<string, ApptRow>();
  const growCalls: { url: string; form: FormData }[] = [];
  let seq = 0;
  const policy = sanitizePolicy({ ...DEFAULT_POLICY, mode: 'deposit', deposit: { type: 'fixed', value: 80 }, text: '' });
  const growRepo: GrowRepo = {
    async insertPayment(row) { const p = { id: `p${++seq}`, process_id: null, receipt_id: null, created_at: now.toISOString(), ...row } as GrowPayment & Record<string, unknown>; payments.set(p.id, p); return p; },
    async updatePayment(id, patch) { Object.assign(payments.get(id)!, patch); },
    async markPaid(id, patch) { const p = payments.get(id)!; if (p.status !== 'created') return null; Object.assign(p, patch); return p; },
    async findByToken(t) { return [...payments.values()].find((p) => p.notify_token === t) || null; },
    async findByProcessId(pid) { const m = [...payments.values()].filter((p) => p.process_id === pid); return m.length === 1 ? m[0] : null; },
    async insertReceipt() { return { id: `r${++seq}` }; },
    async setReceiptDocument() {},
  };
  const asRow = (p: GrowPayment & Record<string, unknown>): PaymentRow => ({ id: p.id, tenant_id: p.tenant_id, status: p.status, amount: Number(p.amount), transaction_id: null, receipt_id: p.receipt_id, appointment_id: p.appointment_id, notify_token: p.notify_token, created_at: p.created_at || null });
  const repo = {
    async getAccount() { return { user_id: 'GROWUSER', enabled: true }; },
    async getPolicy() { return policy; },
    async getAppointment(_t: string, id: string) { return appts.get(id) || null; },
    async getConsent(_t: string, id: string) { return consents.find((c) => c.appointment_id === id) || null; },
    async insertConsent(row: Omit<ConsentRow, 'id' | 'deposit_applied_receipt_id'>) { const c = { id: `c${++seq}`, deposit_applied_receipt_id: null, ...row } as ConsentRow; consents.push(c); return c; },
    async updateConsent(id: string, patch: Partial<ConsentRow>) { Object.assign(consents.find((c) => c.id === id)!, patch); },
    async insertCardConsent(row: Omit<CardConsentRow, 'id'>) { const c = { id: `cc${++seq}`, ...row } as CardConsentRow; cardConsents.push(c); return c; },
    async getDepositPayment(_t: string, apptId: string) { const p = [...payments.values()].filter((x) => x.appointment_id === apptId && x.kind === 'deposit').pop(); return p ? asRow(p) : null; },
  } as unknown as CancelRepo;
  // Grow, as far as these flows reach it: a redirect page answers with a URL, the wallet page with an authCode, approve with status 1.
  const fetchImpl = (async (u: string, init: RequestInit) => {
    const form = init.body as FormData;
    growCalls.push({ url: String(u), form });
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
    if (String(u).endsWith('/createPaymentProcess')) {
      return form.get('pageCode') === 'WALLETPAGE'
        ? json({ status: 1, data: { authCode: 'AUTH123', processId: `proc${++seq}`, processToken: 'pt' } })
        : json({ status: 1, data: { processId: `proc${++seq}`, processToken: 'pt', url: 'https://secure.meshulam.co.il/pay/abc' } });
    }
    return json({ status: 1, data: {} });
  }) as unknown as typeof fetch;
  const noOps = {} as GrowOps;
  const deps = (): Deps => ({
    repo, grow: growRepo, ops: noOps, now: () => now, depositWallet: grow.depositWallet === true,
    chargeDeps: { repo: growRepo, creds: (grow.creds || { apiKey: 'x', pageCode: 'x', apiBase: 'https://x' }), fetchImpl, appUrl: ORIGIN, newToken: () => (++seq).toString(16).padStart(48, 'a') },
  });
  const book = async (id: string) => {
    appts.set(id, { id, tenant_id: TENANT, client_id: 'cl1', client_phone: '0501234567', name: 'דנה', service: 'טיפול פנים', date: '2026-11-11', start_minute: 630, hour: 10, price: 300, confirmation_status: 'pending' });
    return recordConsentAndStart(deps(), { tenantId: TENANT, appointmentId: id, clientId: 'cl1', clientName: 'דנה', phone: '0501234567', servicePrice: 300, serviceName: 'טיפול פנים', policy, returnUrl: `${ORIGIN}/book?t=${TENANT}`, cardConsentText: 'אני מאשרת לשמור את פרטי האשראי' });
  };
  return { grow, payments, consents, cardConsents, appts, growCalls, fetchImpl, deps, book, growRepo, at: (iso: string) => { now = new Date(iso); }, now: () => now };
}

// ── configuration ──────────────────────────────────────────────────────────────
await ok('wallet only (no GROW_PAGE_CODE): the platform counts as configured and deposits open on the wallet', () => {
  const s = growPlatformStatus(WALLET_ONLY);
  assert.equal(s.configured, true, 'GROW_PAGE_CODE is optional when the wallet page is set');
  assert.equal(s.cardPage, false);
  assert.equal(growCredentials(WALLET_ONLY), null, 'no card page credentials without GROW_PAGE_CODE');
  const g = resolveGrow(WALLET_ONLY, ORIGIN);
  assert.equal(g.configured, true);
  assert.equal(g.depositWallet, true);
  assert.equal(g.wallet?.pageCode, 'WALLETPAGE');
  assert.equal(depositsOnWallet(WALLET_ONLY), true);
  // Neither page: still not configured, and the operator is told which one is missing.
  const none = growPlatformStatus({ GROW_API_KEY: 'k' });
  assert.equal(none.configured, false);
  assert.deepEqual(none.missing, ['GROW_PAGE_CODE or GROW_WALLET_PAGE_CODE']);
});

await ok('with GROW_PAGE_CODE, or in mock mode, deposits keep the redirect page', () => {
  const g = resolveGrow(WITH_CARD, ORIGIN);
  assert.equal(g.depositWallet, false);
  assert.equal(g.creds?.pageCode, 'CARDPAGE');
  assert.equal(growPlatformStatus(WITH_CARD).cardPage, true);
  assert.equal(depositsOnWallet({}), false, 'mock mode has no wallet');
  assert.equal(resolveGrow({}, ORIGIN).depositWallet, undefined);
  // A page code without the platform key it belongs to could not open a page: the wallet serves deposits.
  assert.equal(depositsOnWallet({ ...WALLET_ONLY, GROW_API_KEY: 'k', GROW_PAGE_CODE: '' }), true);
});

// ── the deposit ────────────────────────────────────────────────────────────────
await ok('wallet only: a booking deposit creates a wallet charge and returns /pay/<token>; Grow is not asked yet', async () => {
  const w = world(WALLET_ONLY);
  const r = await w.book('a1');
  assert.equal(r.step.kind, 'deposit');
  const pay = [...w.payments.values()][0];
  assert.equal(r.step.url, `${ORIGIN}/pay/${pay.notify_token}`);
  assert.equal(w.growCalls.length, 0, 'createPaymentProcess runs only when the client opens the page');
  assert.equal(pay.kind, 'deposit');
  assert.equal(pay.status, 'created');
  assert.equal(Number(pay.amount), 80, 'the amount is the policy snapshot, never the browser');
  assert.equal(pay.description, 'מקדמה לטיפול פנים');
  assert.equal(pay.appointment_id, 'a1');
  // The hold and the consent stand exactly as on the redirect path.
  const c = w.consents[0];
  assert.equal(c.mode, 'deposit');
  assert.equal(c.status, 'awaiting_deposit');
  assert.equal(new Date(c.hold_expires_at!).getTime() - w.now().getTime(), DEPOSIT_HOLD_MINUTES * 60000);
  assert.equal(c.snapshot.deposit_amount, 80);
  // The wallet keeps no card, so no card-save consent is recorded for it.
  assert.equal(w.cardConsents.length, 0);
});

await ok('with GROW_PAGE_CODE: the redirect path is unchanged (card page, charge and save, Grow URL)', async () => {
  const w = world(WITH_CARD);
  const r = await w.book('a1');
  assert.equal(r.step.url, 'https://secure.meshulam.co.il/pay/abc');
  assert.equal(w.growCalls.length, 1);
  assert.equal(w.growCalls[0].form.get('pageCode'), 'CARDPAGE');
  assert.equal(w.growCalls[0].form.get('saveCardToken'), '1', 'the card page still keeps the card when she ticked');
  assert.equal(w.cardConsents.length, 1);
  assert.equal(w.consents[0].status, 'awaiting_deposit');
});

await ok('a fresh deposit press hands back the SAME open wallet link (two open links could both be paid)', async () => {
  const w = world(WALLET_ONLY);
  const first = await w.book('a1');
  w.at('2026-11-10T08:12:00Z');
  const again = await freshDepositLink(w.deps(), { tenantId: TENANT, appointmentId: 'a1', returnUrl: `${ORIGIN}/book?t=${TENANT}` });
  assert.ok(again.ok);
  assert.equal(again.ok && again.url, first.step.url);
  assert.equal(w.payments.size, 1, 'no second payment row');
  // After the hold: no new link.
  w.at('2026-11-10T08:31:00Z');
  const late = await freshDepositLink(w.deps(), { tenantId: TENANT, appointmentId: 'a1', returnUrl: '' });
  assert.equal(late.ok, false);
  assert.equal(!late.ok && late.code, 'expired');
});

await ok('the wallet page never opens a deposit whose hold ran out; inside the hold it opens with the wallet page code', async () => {
  const w = world(WALLET_ONLY);
  const r = await w.book('a1');
  const token = r.step.url!.split('/pay/')[1];
  const holdOpen = async (p: GrowPayment) => depositHoldOpen(w.consents.find((c) => c.appointment_id === p.appointment_id) || null, w.now());
  const sessionDeps = { repo: w.growRepo, creds: w.grow.wallet as WalletCreds, appUrl: ORIGIN, fetchImpl: w.fetchImpl, userIdFor: async () => 'GROWUSER', now: w.now, holdOpen };
  w.at('2026-11-10T08:31:00Z');
  const closed = await startWalletSession(token, sessionDeps);
  assert.equal(closed.ok, false);
  assert.equal(!closed.ok && closed.code, 'expired');
  assert.equal(!closed.ok && closed.message, DEPOSIT_HOLD_OVER_HE);
  assert.equal(w.growCalls.length, 0, 'Grow is not asked for a released slot');
  w.at('2026-11-10T08:20:00Z');
  const open = await startWalletSession(token, sessionDeps);
  assert.ok(open.ok);
  assert.equal(open.ok && open.authCode, 'AUTH123');
  assert.equal(w.growCalls[0].form.get('pageCode'), 'WALLETPAGE');
  assert.equal(w.growCalls[0].form.get('sum'), '80.00');
  assert.equal(w.growCalls[0].form.get('notifyUrl'), `${ORIGIN}/api/grow/notify?t=${token}`);
  // A deposit already paid is never reopened.
  assert.equal(depositHoldOpen({ mode: 'deposit', status: 'deposit_paid', hold_expires_at: null }, w.now()), false);
  assert.equal(depositHoldOpen(null, w.now()), false);
});

await ok('approve uses the wallet page code for a wallet deposit, the card page code for a redirect one; a second callback approves nothing', async () => {
  const w = world(WALLET_ONLY);
  const r = await w.book('a1');
  const token = r.step.url!.split('/pay/')[1];
  const p = [...w.payments.values()][0];
  p.process_id = 'procW';
  assert.equal(opensOnWallet(p, true, true), true);
  assert.equal(opensOnWallet(p, true, false), false);
  assert.equal(approveCredsFor(p, w.grow)?.pageCode, 'WALLETPAGE');
  assert.equal(approveCredsFor(p, resolveGrow(WITH_CARD, ORIGIN))?.pageCode, 'CARDPAGE');
  const forms: FormData[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => { forms.push(init.body as FormData); return new Response('{"status":1}'); }) as unknown as typeof fetch;
  const approve = (nn: Parameters<typeof approveTransaction>[0], pay: GrowPayment) => approveTransaction(nn, approveCredsFor(pay, w.grow)!, fetchImpl);
  const deps = { repo: w.growRepo, creds: { apiKey: 'x', pageCode: 'x', apiBase: 'https://x' }, appUrl: ORIGIN, newToken: () => 'z'.repeat(48) };
  const raw = { 'data[processId]': 'procW', 'data[transactionId]': '77', 'data[sum]': '80', 'data[statusCode]': '2', 'data[transactionTypeId]': '6' };
  // A wrong amount is refused, nothing approved.
  const bad = await applyNotification({ ...raw, 'data[sum]': '1' }, token, deps, approve);
  assert.notEqual(bad.status, 'paid');
  assert.equal(forms.length, 0);
  const first = await applyNotification(raw, token, deps, approve);
  assert.equal(first.status, 'paid');
  assert.equal(forms.length, 1);
  assert.equal(forms[0].get('pageCode'), 'WALLETPAGE', 'a Bit deposit on the wallet is approved with the wallet page code');
  assert.equal(forms[0].get('apiKey'), 'PLATFORMKEY');
  const second = await applyNotification(raw, token, deps, approve);
  assert.equal(second.status, 'already');
  assert.equal(forms.length, 1, 'no second approve, no second receipt');
});

// ── the /pay page context ──────────────────────────────────────────────────────
await ok('the /pay page shows the booking and returns the client to her booking confirmation', () => {
  assert.equal(visitWhenHe('2026-11-10', 630), 'יום שלישי 10/11 בשעה 10:30');
  assert.equal(visitWhenHe('2026-11-10', null), 'יום שלישי 10/11');
  assert.equal(visitWhenHe('bad', 600), '');
  const dep = payContextOf({ tenant_id: TENANT, appointment_id: 'a1', description: 'מקדמה לטיפול פנים' }, { appUrl: `${ORIGIN}/`, appt: { service: 'טיפול פנים', date: '2026-11-10', start_minute: 630 } });
  assert.deepEqual(dep, { kind: 'deposit', service: 'טיפול פנים', when: 'יום שלישי 10/11 בשעה 10:30', returnUrl: `${ORIGIN}/book?t=${TENANT}&grow=paid`, returnLabel: 'חזרה לאישור התור' });
  const visit = payContextOf({ tenant_id: TENANT, appointment_id: 'a1', description: 'תשלום על תור · פנים' }, { appUrl: ORIGIN, appt: { service: 'פנים', date: '2026-11-10', hour: 9 } });
  assert.equal(visit?.kind, 'booking');
  assert.equal(visit?.when, 'יום שלישי 10/11 בשעה 09:00');
  const v = payContextOf({ tenant_id: TENANT, appointment_id: null, description: 'שובר מתנה · פנים' }, { appUrl: ORIGIN, voucherToken: 'ab'.repeat(24) });
  assert.equal(v?.returnUrl, `${ORIGIN}/v/${'ab'.repeat(24)}?b=1`);
  assert.equal(payContextOf({ tenant_id: TENANT, appointment_id: null, description: 'טיפול' }, { appUrl: ORIGIN }), null, 'a cashier charge: the page as it was');
});

// ── wiring (source pins) ───────────────────────────────────────────────────────
await ok('the routes carry it: deposits deps, the hold check on /pay, the card tick only when a card is kept, the page context', () => {
  const cancel = read('app/api/grow/_cancel.ts');
  assert.ok(/depositWallet: grow\.depositWallet === true/.test(cancel) && /walletAsCreds\(grow\.wallet\)/.test(cancel), 'deposit deps know the wallet');
  assert.ok(/depositRefundOps: grow\.depositWallet && grow\.wallet \? createLiveOps\(grow\.wallet\)/.test(cancel), 'a wallet deposit is refunded with the wallet credentials');
  const route = read('app/api/grow/wallet/route.ts');
  assert.ok(/holdOpen: holdOpenFor/.test(route) && /depositHoldOpen\(/.test(route), 'POST refuses a deposit whose hold ran out');
  assert.ok(/state = 'expired'; note = DEPOSIT_HOLD_OVER_HE/.test(route) && /context \}\)/.test(route), 'GET says so and returns the context');
  for (const f of ['app/api/grow/notify/route.ts', 'app/api/grow/webhook/route.ts']) assert.ok(read(f).includes('approveCredsFor(p, grow)'), `${f}: approve by the payment`);
  assert.ok(/cardSave: cardSave\(p\.mode\)/.test(read('app/api/grow/policy/public/route.ts')));
  assert.ok(/depositKeepsCard = !\(policyDeps && policyDeps\.depositWallet === true\)/.test(read('app/api/book-appointment/route.js')));
  const pc = read('app/pay/[token]/PayClient.jsx');
  assert.ok(/data-testid="pay-booking"/.test(pc) && /data-testid="pay-back"/.test(pc) && /window\.location\.assign\(backUrl\)/.test(pc), 'the page shows the booking and goes back to it once paid');
  const doc = read('docs/GO_LIVE_GROW.md');
  assert.ok(/GROW_PAGE_CODE` \(optional\)/.test(doc) || /optional/i.test(doc.split('GROW_PAGE_CODE')[1] || ''), 'the go-live doc says GROW_PAGE_CODE is optional');
});

console.log(`\n${n} checks passed`);
