// Grow's payment request (CreatePaymentLink, lib/grow/paymentLink.ts): off by default, the credentials, the fields Grow asks for, the
// session, and the callback matched by paymentLinkProcessId and approved with the payment-request page code. Fake fetch and an in-memory
// repo: nothing reaches Grow or a database. NOT run against Grow's sandbox (docs/GROW_SETUP.md "Payment request").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paymentLinkCredentials, paymentLinkEnabled, buildPaymentLinkFields, startPaymentLink, vatTypeOf, safeLinkUrl, isPaymentLinkProcess } from './lib/grow/paymentLink.ts';
import { applyNotification, createCharge } from './lib/grow/service.ts';
import type { GrowPayment } from './lib/grow/service.ts';
import { approveCredsFor, paymentMethodLabel } from './lib/grow/wallet.ts';
import { readNotification } from './lib/grow/payload.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

const TEST = { GROW_PAYMENT_LINK: '1', GROW_TOKEN_USER_ID_TEST: 'u1', GROW_PAYMENT_LINK_PAGE_CODE_TEST: 'plc1' };
const T1 = '11111111-1111-1111-1111-111111111111';
const TOKEN = 'b'.repeat(48);

function memory(now = () => new Date('2026-11-23T10:00:00Z')) {
  const rows = new Map<string, GrowPayment & Record<string, unknown>>();
  let seq = 0;
  const receipts: Record<string, unknown>[] = [];
  const repo = {
    async insertPayment(row: Record<string, unknown>) { const p = { id: `id${++seq}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, process_id: null, receipt_id: null, created_at: now().toISOString(), ...row } as GrowPayment & Record<string, unknown>; rows.set(p.id, p); return p; },
    async updatePayment(id: string, patch: Record<string, unknown>) { Object.assign(rows.get(id)!, patch); },
    async markPaid(id: string, patch: Record<string, unknown>) { const p = rows.get(id); if (!p || p.status !== 'created') return null; Object.assign(p, patch); return p; },
    async findByToken(t: string) { return [...rows.values()].find((p) => p.notify_token === t) || null; },
    async findByProcessId(pid: string) { return [...rows.values()].find((p) => p.process_id === pid) || null; },
    async insertReceipt(row: Record<string, unknown>) { receipts.push(row); return { id: `r${receipts.length}` }; },
    async setReceiptDocument() {},
  };
  return { rows, repo, receipts, now };
}

async function makePayment(m: ReturnType<typeof memory>, amount = 150) {
  const r = await createCharge({ tenantId: T1, userId: 'u', amount, description: 'טיפול פנים', clientName: 'דנה', phone: '0501234567', wallet: true },
    { repo: m.repo as never, creds: { apiKey: 'k', pageCode: 'p', apiBase: 'https://x.invalid' }, appUrl: 'https://kalmea.app', newToken: () => TOKEN });
  assert.ok(r.ok);
  return [...m.rows.values()][0];
}

const growAnswer = (body: unknown, calls: { url: string; form: FormData }[] = []) => (async (url: string, init: { body: FormData }) => {
  calls.push({ url: String(url), form: init.body });
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;

const LINK_OK = { status: 1, err: '', data: { paymentLinkProcessId: 6652, paymentLinkProcessToken: 'secret', url: 'https://sandbox.meshulam.co.il/payment_link?l=abc' } };

await ok('off by default; sandbox needs the page code and the test userId; production needs its own base', () => {
  assert.equal(paymentLinkEnabled({}), false);
  assert.equal(paymentLinkCredentials({ ...TEST, GROW_PAYMENT_LINK: '' }), null, 'flag off: nothing');
  const s = paymentLinkCredentials(TEST)!;
  assert.equal(s.env, 'sandbox'); assert.equal(s.pageCode, 'plc1'); assert.equal(s.userIdOverride, 'u1');
  assert.equal(s.linkBase, 'https://sandboxapi.grow.link/api/light/server/1.1');
  assert.equal(s.apiBase, 'https://sandbox.meshulam.co.il/api/light/server/1.0', 'approve stays on the 1.0 base');
  assert.equal(paymentLinkCredentials({ ...TEST, GROW_PAYMENT_LINK_PAGE_CODE_TEST: '' }), null);
  assert.equal(paymentLinkCredentials({ GROW_PAYMENT_LINK: '1', GROW_ENV: 'production', GROW_API_KEY: 'k', GROW_PAYMENT_LINK_PAGE_CODE: 'p' }), null, 'no guessed production base');
  const p = paymentLinkCredentials({ GROW_PAYMENT_LINK: '1', GROW_ENV: 'production', GROW_API_KEY: 'k', GROW_PAYMENT_LINK_PAGE_CODE: 'p', GROW_PAYMENT_LINK_API_BASE: 'https://api.grow.link/api/light/server/1.1/' })!;
  assert.equal(p.env, 'production'); assert.equal(p.userIdOverride, undefined); assert.equal(p.linkBase, 'https://api.grow.link/api/light/server/1.1');
  assert.equal(paymentLinkCredentials({ ...TEST, GROW_PAYMENT_LINK_API_BASE: 'http://sandboxapi.grow.link' }), null, 'never an insecure base');
});

await ok('VAT type from her registration only; Grow hosts only for the address the client is sent to', () => {
  assert.equal(vatTypeOf('exempt'), 3); assert.equal(vatTypeOf('licensed'), 1); assert.equal(vatTypeOf(''), null); assert.equal(vatTypeOf(undefined), null);
  assert.ok(safeLinkUrl('https://sandbox.meshulam.co.il/payment_link?l=a'));
  assert.ok(safeLinkUrl('https://pay.grow.link/x'));
  assert.equal(safeLinkUrl('http://sandbox.meshulam.co.il/x'), '');
  assert.equal(safeLinkUrl('https://evil.example/meshulam.co.il'), '');
  assert.equal(safeLinkUrl('https://meshulam.co.il.evil.example/'), '');
});

await ok('the fields: one product at the amount, one payment, her VAT type, secret callback URLs, no special characters', () => {
  const f = new Map(buildPaymentLinkFields({ userId: 'u', pageCode: 'pc', apiKey: 'ak', sum: 150, title: 'טיפול פנים!', fullName: 'דנה', phone: '0501234567', vatType: 3,
    successUrl: 'https://kalmea.app/pay/t?paid=1', notifyUrl: 'https://kalmea.app/api/grow/notify?t=t', invoiceNotifyUrl: 'https://kalmea.app/api/grow/invoice?t=t', paymentRef: 'a-b', tenantRef: T1 }));
  assert.equal(f.get('apiKey'), 'ak'); assert.equal(f.get('userId'), 'u'); assert.equal(f.get('pageCode'), 'pc');
  assert.equal(f.get('isActive'), '1'); assert.equal(f.get('chargeType'), '1'); assert.equal(f.get('paymentTypes[0][payments][paymentsPaymentNum]'), '1');
  assert.equal(f.get('products[data][0][price]'), '150.00'); assert.equal(f.get('products[data][0][vatType]'), '3'); assert.equal(f.get('products[data][0][quantity]'), '1');
  assert.equal(f.get('title'), 'טיפול פנים'); assert.equal(f.get('pageFieldSettings[phone][value]'), '0501234567');
  assert.ok(String(f.get('pageFieldSettings[fullName][value]')).trim().split(/\s+/).length >= 2, 'a full name has two names');
  assert.equal(f.get('cField1'), 'ab'); assert.equal(f.get('cField2'), T1.replace(/-/g, ''));
  assert.match(String(f.get('notifyUrl')), /\/api\/grow\/notify\?t=/); assert.match(String(f.get('invoiceNotifyUrl')), /\/api\/grow\/invoice\?t=/);
});

await ok('a session: CreatePaymentLink on the 1.1 base, the link stored as pl<id>, the client gets Grow\'s url', async () => {
  const m = memory(); const p = await makePayment(m);
  const calls: { url: string; form: FormData }[] = [];
  const r = await startPaymentLink(TOKEN, { repo: m.repo, creds: paymentLinkCredentials(TEST)!, appUrl: 'https://kalmea.app', userIdFor: async () => null, taxStatusFor: async () => 'exempt', fetchImpl: growAnswer(LINK_OK, calls), now: m.now });
  assert.deepEqual(r, { ok: true, url: LINK_OK.data.url });
  assert.equal(calls[0].url, 'https://sandboxapi.grow.link/api/light/server/1.1/CreatePaymentLink');
  assert.equal(calls[0].form.get('userId'), 'u1', 'sandbox: the test business');
  assert.equal(m.rows.get(p.id)!.process_id, 'pl6652'); assert.ok(isPaymentLinkProcess('pl6652'));
});

await ok('no VAT registration: not-ready (the route keeps the wallet); an answer without a Grow url is refused', async () => {
  const m = memory(); const p = await makePayment(m);
  let calls = 0;
  const base = { repo: m.repo, creds: paymentLinkCredentials(TEST)!, appUrl: 'https://kalmea.app', userIdFor: async () => null, now: m.now };
  const r1 = await startPaymentLink(TOKEN, { ...base, taxStatusFor: async () => null, fetchImpl: (async () => { calls++; return new Response('{}'); }) as unknown as typeof fetch });
  assert.equal(r1.ok, false); assert.equal(!r1.ok && r1.code, 'not-ready'); assert.equal(calls, 0, 'Grow is not asked');
  const bad = { status: 1, data: { paymentLinkProcessId: 7, url: 'https://evil.example/pay' } };
  const r2 = await startPaymentLink(TOKEN, { ...base, taxStatusFor: async () => 'licensed', fetchImpl: growAnswer(bad) });
  assert.equal(!r2.ok && r2.code, 'grow-refused'); assert.equal(m.rows.get(p.id)!.process_id, null);
});

// Grow's documented callback for CreatePaymentLink (developers.grow.business > Payment Link > Server-to-Server Callback), as form fields.
const callback = (sum = '150', linkId = '6652', typeId = '1') => ({
  'data[status]': 'שולם', 'data[statusCode]': '2', 'data[transactionTypeId]': typeId, 'data[paymentType]': '2', 'data[sum]': sum,
  'data[paymentsNum]': '0', 'data[allPaymentsNum]': '1', 'data[paymentDate]': ' 05/6/25', 'data[transactionId]': '421100',
  'data[transactionToken]': 'tt', 'data[paymentLinkProcessId]': linkId, 'data[paymentLinkProcessToken]': 'x', 'data[asmachta]': '117128222',
  'data[processId]': ' 512895', 'data[processToken]': ' y', 'data[customFields]': ' Array',
});

await ok('the callback is matched by paymentLinkProcessId and the amount, recorded once, approved with the payment-request page code', async () => {
  const m = memory(); const p = await makePayment(m);
  m.rows.get(p.id)!.process_id = 'pl6652';
  assert.equal(readNotification(callback())!.paymentLinkProcessId, '6652');
  const approved: { pageCode: string; apiBase: string }[] = [];
  const link = paymentLinkCredentials(TEST)!;
  const deps = { repo: m.repo as never, creds: { apiKey: 'k', pageCode: 'card', apiBase: 'https://x.invalid' }, appUrl: 'https://kalmea.app', newToken: () => 'z' };
  const r = await applyNotification(callback(), TOKEN, deps, async (_n, pp) => { const c = approveCredsFor(pp, { creds: deps.creds, paymentLink: link })!; approved.push(c); });
  assert.equal(r.status, 'paid'); assert.equal(m.receipts.length, 1);
  assert.equal(approved[0].pageCode, 'plc1'); assert.equal(approved[0].apiBase, 'https://sandbox.meshulam.co.il/api/light/server/1.0');
  const again = await applyNotification(callback(), TOKEN, deps);
  assert.notEqual(again.status, 'mismatch'); assert.equal(m.receipts.length, 1, 'a second callback adds nothing');
});

await ok('a different amount or another link id is a mismatch; PayBox is named PayBox', async () => {
  const m = memory(); const p = await makePayment(m);
  m.rows.get(p.id)!.process_id = 'pl6652';
  const deps = { repo: m.repo as never, creds: { apiKey: 'k', pageCode: 'card', apiBase: 'https://x.invalid' }, appUrl: 'https://kalmea.app', newToken: () => 'z' };
  assert.equal((await applyNotification(callback('10'), TOKEN, deps)).status, 'mismatch');
  assert.equal((await applyNotification(callback('150', '9999'), TOKEN, deps)).status, 'mismatch');
  assert.equal(m.rows.get(p.id)!.status, 'created');
  assert.equal(paymentMethodLabel('5'), 'PayBox');
  // Without payment-request credentials a pl payment is never approved with another page code.
  assert.equal(approveCredsFor({ appointment_id: null, description: 'x', process_id: 'pl1' }, { creds: deps.creds }), null);
});

await ok('wiring: the route tries the payment request first and keeps the wallet when it is not ready; the page follows the link', () => {
  const route = src('app/api/grow/wallet/route.ts');
  assert.match(route, /const linkCreds = paymentLinkCredentials\(process\.env\);/);
  assert.match(route, /if \(l\.code !== 'not-ready'\)/);
  assert.ok(route.indexOf('startPaymentLink(') < route.indexOf('startWalletSession(token'), 'payment request before the wallet');
  assert.match(src('app/pay/[token]/PayClient.jsx'), /j\.linkUrl[\s\S]{0,200}window\.location\.assign\(j\.linkUrl\)/);
  assert.match(src('app/api/grow/notify/route.ts'), /paymentLink: paymentLinkCredentials\(process\.env\) \}/);
  // Grow asked: no Get Transaction Info / Get Payment Process Info in the app.
  for (const f of ['lib/grow/paymentLink.ts', 'lib/grow/wallet.ts', 'lib/grow/service.ts', 'app/api/grow/wallet/route.ts', 'app/api/grow/notify/route.ts']) {
    assert.doesNotMatch(src(f).replace(/^\s*\/\/.*$/gm, ''), /getTransactionInfo|getPaymentProcessInfo/i, f);
  }
  assert.match(src('.env.example'), /^GROW_PAYMENT_LINK=$/m, 'off by default');
});

console.log(`grow payment link: ${n} ok`);
