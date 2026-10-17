// Grow (Meshulam) charge flow: configuration honesty, request shape, and the callback rules - with a fake
// repo and a fake fetch, so nothing here can reach Grow or a database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { growPlatformStatus, growCredentials, GROW_SANDBOX_BASE } from './lib/grow/config.ts';
import {
  growText, growFullName, growPhone, parseChargeAmount, buildProcessFields, parseProcessResponse,
  readNotification, notificationMatches, findInvoiceUrl, maskUserId, USER_ID_RE,
} from './lib/grow/payload.ts';
import { createCharge, applyNotification, applyInvoice, approveTransaction } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

// ── configuration ──────────────────────────────────────────────────────────────
await ok('nothing configured: not connected, and the missing variables are named', () => {
  const s = growPlatformStatus({});
  assert.equal(s.configured, false);
  assert.deepEqual(s.missing, ['GROW_API_KEY', 'GROW_PAGE_CODE']);
  assert.equal(s.env, 'sandbox');
  assert.equal(growCredentials({}), null);
});

await ok('sandbox is the default base; production never guesses a base URL', () => {
  const sb = growPlatformStatus({ GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p' });
  assert.equal(sb.configured, true);
  assert.equal(sb.apiBase, GROW_SANDBOX_BASE);
  const prod = growPlatformStatus({ GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p', GROW_ENV: 'production' });
  assert.equal(prod.configured, false);
  assert.ok(prod.missing.includes('GROW_API_BASE'));
  const prodOk = growPlatformStatus({ GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p', GROW_ENV: 'production', GROW_API_BASE: 'https://api.example.test/v1/' });
  assert.equal(prodOk.configured, true);
  assert.equal(prodOk.apiBase, 'https://api.example.test/v1');
  assert.equal(growPlatformStatus({ GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p', GROW_API_BASE: 'http://insecure' }).configured, false);
});

// ── payload helpers ────────────────────────────────────────────────────────────
await ok('text and names: no special characters; two names; phones; amounts', () => {
  assert.equal(growText('טיפול פנים - 50% הנחה! (חדש)'), 'טיפול פנים 50 הנחה חדש');
  assert.equal(growFullName('מיכל'), 'מיכל לקוחה');
  assert.equal(growFullName('מיכל כהן'), 'מיכל כהן');
  assert.equal(growPhone('050-123-4567'), '0501234567');
  assert.equal(growPhone('+972501234567'), '0501234567');
  assert.equal(growPhone('03-1234567'), null);
  assert.equal(parseChargeAmount('249.999'), 250);
  for (const bad of [0, -5, 'x', 20001, null]) assert.equal(parseChargeAmount(bad), null);
  assert.ok(USER_ID_RE.test('a1b2c3d4'));
  assert.ok(!USER_ID_RE.test('a b'));
  assert.equal(maskUserId('abcdef123456'), 'ab••••56');
});

await ok('the process fields use Grow\'s names and carry her userId', () => {
  const f = Object.fromEntries(buildProcessFields({
    userId: 'u123', pageCode: 'pc', sum: 249, description: 'פנים!', fullName: 'דנה', phone: '0501234567',
    successUrl: 'https://x.test/ok', cancelUrl: 'https://x.test/no', notifyUrl: 'https://x.test/n?t=abc', paymentRef: 'pay-1',
  }));
  assert.equal(f.userId, 'u123');
  assert.equal(f.sum, '249.00');
  assert.equal(f.description, 'פנים');
  assert.equal(f['pageField[fullName]'], 'דנה לקוחה');
  assert.equal(f['pageField[phone]'], '0501234567');
  assert.equal(f.cField1, 'pay1');
  assert.equal(f.notifyUrl, 'https://x.test/n?t=abc');
});

await ok('the create answer: only status 1 with an https page url counts', () => {
  assert.deepEqual(parseProcessResponse({ status: 1, err: '', data: { processId: 5632, processToken: 't', url: 'https://pay.test/p' } }), { ok: true, processId: '5632', url: 'https://pay.test/p' });
  assert.equal(parseProcessResponse({ status: 0, err: { id: 1, message: 'bad user' } }).ok, false);
  assert.equal(parseProcessResponse({ status: 1, data: { processId: 1, url: 'http://insecure' } }).ok, false);
  assert.equal(parseProcessResponse(null).ok, false);
});

await ok('the callback is read from form fields or nested data, and matched against what we created', () => {
  const nested = readNotification({ status: '1', data: { processId: '5632', transactionId: '77', sum: '249', statusCode: '2', asmachta: '987', customFields: { cField1: 'pay-1' } } })!;
  assert.equal(nested.paid, true);
  assert.equal(nested.paymentRef, 'pay-1');
  const form = readNotification({ 'data[processId]': '5632', 'data[transactionId]': '77', 'data[sum]': '249.00', 'data[statusCode]': '2' })!;
  assert.equal(form.sum, 249);
  assert.equal(notificationMatches(form, { processId: '5632', amount: 249 }), true);
  assert.equal(notificationMatches(form, { processId: '9999', amount: 249 }), false);
  assert.equal(notificationMatches(form, { processId: '5632', amount: 100 }), false);
  assert.equal(readNotification({ data: { sum: '1' } }), null);
  assert.equal(readNotification({ data: { processId: '1', transactionId: '2', sum: '5', statusCode: '1' } })!.paid, false);
});

await ok('the invoice link is found wherever it sits; http and junk are not', () => {
  assert.equal(findInvoiceUrl({ data: { invoice: { link: 'https://docs.test/inv/1' } } }), 'https://docs.test/inv/1');
  assert.equal(findInvoiceUrl({ url: 'http://nope' }), null);
  assert.equal(findInvoiceUrl(null), null);
});

// ── the flow, against an in-memory repo ───────────────────────────────────────
function memoryRepo() {
  const payments = new Map<string, GrowPayment & Record<string, unknown>>();
  const receipts: Record<string, unknown>[] = [];
  const docs: Record<string, string> = {};
  let seq = 0;
  const repo: GrowRepo = {
    async insertPayment(row) { const p = { id: `p${++seq}`, process_id: null, receipt_id: null, ...row } as GrowPayment & Record<string, unknown>; payments.set(p.id, p); return p; },
    async updatePayment(id, patch) { Object.assign(payments.get(id)!, patch); },
    async markPaid(id, patch) { const p = payments.get(id)!; if (p.status !== 'created') return null; Object.assign(p, patch); return p; },
    async findByToken(t) { return [...payments.values()].find((p) => p.notify_token === t) || null; },
    async insertReceipt(row) { receipts.push(row); return { id: `r${receipts.length}` }; },
    async setReceiptDocument(id, url) { docs[id] = url; },
  };
  return { repo, payments, receipts, docs };
}
const creds = { apiKey: 'KEY', pageCode: 'PAGE', apiBase: 'https://grow.test/api' };
const okFetch = (calls: { url: string; headers: Record<string, string>; form: FormData }[]) => (async (url: string, init: RequestInit) => {
  calls.push({ url, headers: init.headers as Record<string, string>, form: init.body as FormData });
  return new Response(JSON.stringify({ status: 1, err: '', data: { processId: 5632, processToken: 'tok', url: 'https://pay.test/page' } }), { status: 200 });
}) as unknown as typeof fetch;

await ok('createCharge: writes the row first, asks Grow for HER userId with the platform key, returns the page', async () => {
  const m = memoryRepo();
  const calls: { url: string; headers: Record<string, string>; form: FormData }[] = [];
  const r = await createCharge(
    { tenantId: 't1', userId: 'her-user-1', amount: 249, description: 'טיפול פנים', clientName: 'דנה כהן', phone: '0501234567', clientId: 'c9' },
    { repo: m.repo, creds, fetchImpl: okFetch(calls), appUrl: 'https://kalmea.test', newToken: () => 'a'.repeat(48) },
  );
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://grow.test/api/createPaymentProcess');
  assert.equal(calls[0].headers['x-api-key'], 'KEY');
  assert.equal(calls[0].form.get('userId'), 'her-user-1', 'the charge is for HER account');
  assert.equal(calls[0].form.get('pageCode'), 'PAGE');
  assert.equal(calls[0].form.get('notifyUrl'), `https://kalmea.test/api/grow/notify?t=${'a'.repeat(48)}`);
  const p = [...m.payments.values()][0];
  assert.equal(p.status, 'created');
  assert.equal(p.process_id, '5632');
  assert.equal(Number(p.amount), 249);
});

await ok('createCharge: bad amount / phone never reach Grow; a Grow refusal marks the payment failed', async () => {
  const m = memoryRepo();
  const calls: unknown[] = [];
  const spy = (async () => { calls.push(1); return new Response('{}'); }) as unknown as typeof fetch;
  const d = { repo: m.repo, creds, fetchImpl: spy, appUrl: 'https://k.test', newToken: () => 'b'.repeat(48) };
  const base = { tenantId: 't1', userId: 'u', description: 'x', clientName: 'דנה כהן' };
  assert.equal((await createCharge({ ...base, amount: 0, phone: '0501234567' }, d)).ok, false);
  assert.equal((await createCharge({ ...base, amount: 100, phone: '12' }, d)).ok, false);
  assert.equal(calls.length, 0);
  assert.equal(m.payments.size, 0, 'nothing is even recorded for a request that is refused up front');
  const refused = await createCharge({ ...base, amount: 100, phone: '0501234567' }, d);
  assert.equal(refused.ok, false);
  assert.equal([...m.payments.values()][0].status, 'failed');
});

async function paidSetup() {
  const m = memoryRepo();
  const calls: { url: string; headers: Record<string, string>; form: FormData }[] = [];
  await createCharge(
    { tenantId: 't1', userId: 'u', amount: 249, description: 'טיפול פנים', clientName: 'דנה כהן', phone: '0501234567', clientId: 'c9', appointmentId: 'a4' },
    { repo: m.repo, creds, fetchImpl: okFetch(calls), appUrl: 'https://k.test', newToken: () => 'c'.repeat(48) },
  );
  const d = { repo: m.repo, creds, appUrl: 'https://k.test', newToken: () => 'x' };
  return { m, d, token: 'c'.repeat(48) };
}
const paidBody = { data: { processId: '5632', transactionId: '77', transactionToken: 'tt', sum: '249', statusCode: '2', asmachta: '987' } };

await ok('a paid callback: payment paid, ONE receipt with the card method, Grow acknowledged', async () => {
  const { m, d, token } = await paidSetup();
  let approved = 0;
  const r = await applyNotification(paidBody, token, d, async () => { approved++; });
  assert.equal(r.status, 'paid');
  const p = [...m.payments.values()][0];
  assert.equal(p.status, 'paid');
  assert.equal(p.transaction_id, '77');
  assert.equal(m.receipts.length, 1);
  assert.equal(m.receipts[0].payment_method, 'אשראי');
  assert.equal(m.receipts[0].amount, 249);
  assert.equal(m.receipts[0].tenant_id, 't1');
  assert.equal(m.receipts[0].appointment_id, 'a4');
  assert.equal(p.receipt_id, 'r1');
  assert.equal(approved, 1);
});

await ok('a duplicate callback creates no second receipt', async () => {
  const { m, d, token } = await paidSetup();
  await applyNotification(paidBody, token, d);
  const again = await applyNotification(paidBody, token, d);
  assert.equal(again.status, 'already');
  assert.equal(m.receipts.length, 1);
});

await ok('a forged callback changes nothing: wrong token, wrong process, wrong amount, not paid', async () => {
  const { m, d, token } = await paidSetup();
  assert.equal((await applyNotification(paidBody, 'z'.repeat(48), d)).status, 'unknown-token');
  assert.equal((await applyNotification({ data: { ...paidBody.data, processId: '1' } }, token, d)).status, 'mismatch');
  assert.equal((await applyNotification({ data: { ...paidBody.data, sum: '1' } }, token, d)).status, 'mismatch');
  assert.equal((await applyNotification({ data: { ...paidBody.data, statusCode: '1' } }, token, d)).status, 'not-paid');
  assert.equal([...m.payments.values()][0].status, 'created');
  assert.equal(m.receipts.length, 0);
});

await ok('a callback that died after "paid" but before the receipt is finished by the next one', async () => {
  const { m, d, token } = await paidSetup();
  const realInsert = m.repo.insertReceipt;
  let failOnce = true;
  m.repo.insertReceipt = async (row) => { if (failOnce) { failOnce = false; throw new Error('db down'); } return realInsert(row); };
  const first = await applyNotification(paidBody, token, d);
  assert.equal(first.status, 'paid');
  assert.equal((first as { receiptId: string | null }).receiptId, null);
  assert.equal(m.receipts.length, 0);
  // Not at once: Grow delivers to two URLs at nearly the same moment, so a second callback inside two minutes is
  // the sibling of a first one that is still working, not a retry of a dead one.
  const tooSoon = await applyNotification(paidBody, token, d);
  assert.equal(tooSoon.status, 'already');
  assert.equal(m.receipts.length, 0);
  const later = { ...d, now: () => new Date(Date.now() + 3 * 60_000) };
  const second = await applyNotification(paidBody, token, later);
  assert.equal(second.status, 'paid');
  assert.equal(m.receipts.length, 1);
});

await ok('the invoice webhook stores Grow\'s legal document on the payment and the receipt', async () => {
  const { m, d, token } = await paidSetup();
  await applyNotification(paidBody, token, d);
  const r = await applyInvoice({ invoice: { link: 'https://docs.test/inv/9' } }, token, d);
  assert.equal(r.status, 'stored');
  assert.equal([...m.payments.values()][0].invoice_url, 'https://docs.test/inv/9');
  assert.equal(m.docs.r1, 'https://docs.test/inv/9');
  assert.equal((await applyInvoice({}, token, d)).status, 'no-url');
  assert.equal((await applyInvoice({}, 'nope', d)).status, 'unknown-token');
});

await ok('approveTransaction echoes Grow\'s own fields with the platform key', async () => {
  const calls: { url: string; headers: Record<string, string>; form: FormData }[] = [];
  const nn = readNotification(paidBody)!;
  await approveTransaction(nn, creds, okFetch(calls));
  assert.equal(calls[0].url, 'https://grow.test/api/approveTransaction');
  assert.equal(calls[0].form.get('transactionId'), '77');
  assert.equal(calls[0].form.get('pageCode'), 'PAGE');
  assert.equal(calls[0].headers['x-api-key'], 'KEY');
});

// ── the routes keep their guards (source-level: they need a database to run) ───────────
await ok('the charge route refuses the demo, an unconfigured platform and a disconnected business before Grow', () => {
  const src = readFileSync('app/api/grow/charge/route.ts', 'utf8').split('\r\n').join('\n');
  const demo = src.indexOf('isDemoTenantId(c.tenantId)');
  const cfg = src.indexOf('growCredentials()');
  const acct = src.indexOf("from('grow_accounts')");
  const create = src.indexOf('createCharge(');
  assert.ok(demo > -1 && cfg > demo && acct > cfg && create > acct, 'demo -> platform keys -> her account -> charge');
  assert.match(src, /acc\.data\.enabled !== true/);
});

await ok('the notify route has no session requirement and no way to read a payment without the secret', () => {
  const src = readFileSync('app/api/grow/notify/route.ts', 'utf8');
  assert.match(src, /searchParams\.get\('t'\)/);
  assert.doesNotMatch(src, /createSession|auth\.getUser/);
});

console.log(`${n} passed`);
