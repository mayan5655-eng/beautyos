// Grow clearing for cosmeticians, the rest of it (feat/grow-cashier): payment methods by page code, payment requests
// (deposit / full) and the Grow registration link. Fake fetch and in-memory repos only: nothing reaches Grow or a database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pageCodesFromEnv, availableMethods, pageCodeFor, pageCodeForTypeId, methodProblem, isPayMethod, BIT_MAX_SUM, METHOD_LABEL_HE,
} from './lib/grow/methods.ts';
import { createCharge, approveTransaction } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';
import { readNotification } from './lib/grow/payload.ts';
import { resolveGrow } from './lib/grow/adapter.ts';
import {
  newTrackingCode, createMockRegistration, readRegisterResponse, registrationOps, registrationStatusOf, createLiveRegistration,
} from './lib/grow/registration.ts';
import {
  requestDescription, isDepositRequest, isPaymentRequest, requestMessageHe, requestWaLink, isRequestKind, REQUEST_DEPOSIT_PREFIX,
} from './lib/grow/paymentRequest.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

// ── payment methods: one Grow page code each ─────────────────────────────────
await ok('page codes come from the environment only; a method appears only when its code is set', () => {
  const codes = pageCodesFromEnv({ GROW_PAGE_CODE: 'CARD', GROW_PAGE_CODE_BIT: 'BIT', GROW_PAGE_CODE_APPLE_PAY: '  ' });
  assert.deepEqual(codes, { card: 'CARD', bit: 'BIT' });
  assert.deepEqual(availableMethods(codes), ['card', 'bit']);
  assert.deepEqual(availableMethods({}), []);
  assert.equal(pageCodeFor('bit', codes, 'X'), 'BIT');
  assert.equal(pageCodeFor('apple_pay', codes, 'X'), 'CARD', 'an unset method falls back to the card page');
  assert.equal(pageCodeFor('evil', codes, 'X'), 'CARD');
  assert.equal(isPayMethod('google_pay'), true);
  assert.equal(isPayMethod('cash'), false);
  assert.equal(METHOD_LABEL_HE.bit, 'ביט');
});

await ok("Grow's own limits are said in Hebrew before asking: Bit up to 5,000", () => {
  assert.equal(methodProblem('bit', BIT_MAX_SUM), '');
  assert.match(methodProblem('bit', BIT_MAX_SUM + 1), /ביט/);
  assert.equal(methodProblem('card', 20000), '');
});

await ok('approveTransaction is sent with the page code of the method the client paid with (transactionTypeId)', async () => {
  const codes = { card: 'CARD', bit: 'BIT', apple_pay: 'APPLE' };
  assert.equal(pageCodeForTypeId('6', codes, 'CARD'), 'BIT');
  assert.equal(pageCodeForTypeId('13', codes, 'CARD'), 'APPLE');
  assert.equal(pageCodeForTypeId('14', codes, 'CARD'), 'CARD', 'Google Pay not configured -> the default page');
  assert.equal(pageCodeForTypeId(undefined, codes, 'CARD'), 'CARD');
  const forms: FormData[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => { forms.push(init.body as FormData); return new Response('{"status":1}'); }) as unknown as typeof fetch;
  const n6 = readNotification({ data: { processId: '1', transactionId: '2', sum: '50', statusCode: '2', transactionTypeId: '6' } })!;
  await approveTransaction(n6, { apiKey: 'K', pageCode: 'CARD', apiBase: 'https://g.test', pageCodes: codes }, fetchImpl);
  assert.equal(forms[0].get('pageCode'), 'BIT');
  assert.equal(forms[0].get('apiKey'), 'K', 'apiKey is a body field');
});

function memoryRepo() {
  const payments = new Map<string, GrowPayment & Record<string, unknown>>();
  let seq = 0;
  const repo: GrowRepo = {
    async insertPayment(row) { const p = { id: `p${++seq}`, process_id: null, receipt_id: null, ...row } as GrowPayment & Record<string, unknown>; payments.set(p.id, p); return p; },
    async updatePayment(id, patch) { Object.assign(payments.get(id)!, patch); },
    async markPaid() { return null; },
    async findByToken() { return null; },
    async insertReceipt() { return { id: 'r1' }; },
    async setReceiptDocument() {},
  };
  return { repo, payments };
}
const okFetch = (forms: FormData[]) => (async (_url: string, init: RequestInit) => {
  forms.push(init.body as FormData);
  return new Response(JSON.stringify({ status: 1, err: '', data: { processId: 11, processToken: 't', url: 'https://pay.test/p' } }), { status: 200 });
}) as unknown as typeof fetch;
const creds = { apiKey: 'KEY', pageCode: 'CARD', apiBase: 'https://grow.test/api', pageCodes: { card: 'CARD', bit: 'BIT', google_pay: 'GPAY' } };

await ok('createCharge opens the page of the chosen method; card when none is chosen', async () => {
  const m = memoryRepo(); const forms: FormData[] = [];
  const d = { repo: m.repo, creds, fetchImpl: okFetch(forms), appUrl: 'https://k.test', newToken: () => 'a'.repeat(48) };
  const base = { tenantId: 't1', userId: 'her1', description: 'טיפול', clientName: 'דנה כהן', phone: '0501234567' };
  assert.equal((await createCharge({ ...base, amount: 100, method: 'bit' }, d)).ok, true);
  assert.equal(forms[0].get('pageCode'), 'BIT');
  assert.equal((await createCharge({ ...base, amount: 100 }, d)).ok, true);
  assert.equal(forms[1].get('pageCode'), 'CARD');
  assert.equal((await createCharge({ ...base, amount: 100, method: 'google_pay' }, d)).ok, true);
  assert.equal(forms[2].get('pageCode'), 'GPAY');
  assert.equal(forms[2].get('userId'), 'her1', 'always HER account');
});

await ok('Bit above 5,000 is refused before Grow is asked and before anything is recorded', async () => {
  const m = memoryRepo(); const forms: FormData[] = [];
  const r = await createCharge({ tenantId: 't1', userId: 'u', amount: 6000, description: 'x', clientName: 'דנה כהן', phone: '0501234567', method: 'bit' },
    { repo: m.repo, creds, fetchImpl: okFetch(forms), appUrl: 'https://k.test', newToken: () => 'b'.repeat(48) });
  assert.equal(r.ok, false);
  assert.equal(forms.length, 0);
  assert.equal(m.payments.size, 0);
});

await ok('mock mode offers every method; live offers only the configured ones; production has a documented base', () => {
  const mock = resolveGrow({}, 'https://k.test');
  assert.deepEqual(availableMethods(mock.creds!.pageCodes!), ['card', 'bit', 'apple_pay', 'google_pay']);
  const live = resolveGrow({ GROW_MODE: 'live', GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p', GROW_PAGE_CODE_BIT: 'b' }, 'https://k.test');
  assert.deepEqual(availableMethods(live.creds!.pageCodes!), ['card', 'bit']);
  const prod = resolveGrow({ GROW_MODE: 'live', GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p', GROW_ENV: 'production' }, 'https://k.test');
  assert.equal(prod.creds!.apiBase, 'https://secure.meshulam.co.il/api/light/server/1.0');
  assert.equal(resolveGrow({ VERCEL_ENV: 'production' }).configured, false, 'mock never runs on production');
});

// ── payment requests ─────────────────────────────────────────────────────────
await ok('a request is a deposit or the full amount; its description marks it for the list and the deposit credit', () => {
  assert.equal(isRequestKind('deposit'), true);
  assert.equal(isRequestKind('half'), false);
  assert.equal(requestDescription('full'), 'בקשת תשלום');
  assert.equal(requestDescription('deposit', 'פנים <b>"חמישי"</b>'), `${REQUEST_DEPOSIT_PREFIX} · פנים b חמישי /b`);
  assert.ok(requestDescription('full', 'א'.repeat(100)).length <= 'בקשת תשלום · '.length + 40);
  assert.equal(isDepositRequest(requestDescription('deposit')), true);
  assert.equal(isDepositRequest(requestDescription('full')), false);
  assert.equal(isDepositRequest('מקדמה לטיפול פנים'), false, 'a booking deposit is not a request deposit');
  assert.equal(isPaymentRequest(requestDescription('full', 'x')), true);
  assert.equal(isPaymentRequest('טיפול פנים'), false);
});

await ok('the message she sends: warm, her client\'s first name, the shekel glued to the number, the link', () => {
  const m = requestMessageHe({ clientName: 'דנה כהן', businessName: 'סטודיו רונית', amount: 100, kind: 'deposit', url: 'https://pay.test/p' });
  assert.ok(m.startsWith('היי דנה 🌸'));
  assert.ok(m.includes('מקדמה של ₪100'));
  assert.ok(!/₪ \d/.test(m));
  assert.ok(m.includes('https://pay.test/p'));
  assert.ok(requestMessageHe({ amount: 49.5, kind: 'full', url: 'https://x.test' }).includes('תשלום של ₪49.5'));
  assert.ok(requestWaLink('050-123-4567', 'שלום')!.startsWith('https://wa.me/972501234567?text='));
  assert.equal(requestWaLink('12', 'x'), null);
});

await ok('the request route reads the client from HER list on the server and sends nothing itself', () => {
  const r = src('app/api/grow/payment-request/route.ts');
  assert.ok(r.includes(".from('clients').select('id, name, phone').eq('tenant_id', c.tenantId).eq('id', clientId)"));
  assert.ok(!/b\.phone|b\.clientName/.test(r), 'name and phone never come from the browser');
  assert.ok(!/sendWhatsApp/.test(r));
  assert.ok(r.includes("appointmentId: null"), 'a request deposit never confirms or touches a booking');
});

await ok('a paid request deposit becomes client credit, before the booking-deposit path', () => {
  const h = src('app/api/grow/_cancel.ts');
  const i = h.indexOf('isDepositRequest(p.description)');
  assert.ok(i > 0 && i < h.indexOf("if (!/^מקדמה/.test(p.description || '')) return;"));
  assert.ok(h.includes("source: 'deposit_request'"));
});

// ── Grow registration (GetLink) ──────────────────────────────────────────────
await ok('the tracking code is ours: 24 hex characters, never short', () => {
  assert.equal(newTrackingCode(() => 'ABCDEF0123456789abcdef0123456789'), 'abcdef0123456789abcdef01');
  assert.throws(() => newTrackingCode(() => 'abc'));
});

await ok('mock registration answers with our stand-in form and a lead id; a bad code is refused', async () => {
  const ops = createMockRegistration('https://k.test/');
  const r = await ops.createLink({ trackingCode: 'a'.repeat(24), businessName: 'x', fullName: 'דנה כהן', phone: '0501234567', notifyUrl: '', returnUrl: '' });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.url, `https://k.test/api/grow/mock-register?c=${'a'.repeat(24)}`); assert.match(String(r.encryptedLead), /^mocklead_/); }
  assert.equal((await ops.createLink({ trackingCode: 'xyz', businessName: 'x', fullName: 'a b', phone: '1', notifyUrl: '', returnUrl: '' })).ok, false);
});

await ok('live registration exists only with GROW_REGISTRATION_PATH (the spec is not public yet), and only on a configured platform', () => {
  const c = { apiKey: 'k', apiBase: 'https://g.test/api' };
  assert.notEqual(registrationOps({}, 'mock', true, c, 'https://k.test'), null);
  assert.equal(registrationOps({}, 'live', true, c, 'https://k.test'), null);
  assert.notEqual(registrationOps({ GROW_REGISTRATION_PATH: 'getLink' }, 'live', true, c, 'https://k.test'), null);
  assert.equal(registrationOps({ GROW_REGISTRATION_PATH: 'getLink' }, 'live', false, c, 'https://k.test'), null);
});

await ok('live registration: apiKey in the body, the answer read defensively, https only', async () => {
  const forms: FormData[] = [];
  const f = (async (_u: string, init: RequestInit) => { forms.push(init.body as FormData); return new Response(JSON.stringify({ status: 1, data: { url: 'https://grow.test/reg/1', encrypted_lead: 'LEAD9' } })); }) as unknown as typeof fetch;
  const ops = createLiveRegistration({ apiKey: 'K', apiBase: 'https://g.test/api', path: 'getLink' }, f);
  const r = await ops.createLink({ trackingCode: 'a'.repeat(24), businessName: 'b', fullName: 'דנה כהן', phone: '0501234567', notifyUrl: 'https://k/api/grow/webhook', returnUrl: 'https://k/' });
  assert.deepEqual(r, { ok: true, url: 'https://grow.test/reg/1', encryptedLead: 'LEAD9' });
  assert.equal(forms[0].get('apiKey'), 'K');
  assert.equal(readRegisterResponse({ status: 1, data: { url: 'http://insecure' } }).ok, false);
  assert.equal(readRegisterResponse({ status: 0, err: { message: 'no' } }).ok, false);
  assert.equal(readRegisterResponse(null).ok, false);
});

await ok('a registration update means approved, rejected or still waiting', () => {
  const u = (o: Partial<{ userId: string | null; status: string; trackingStatusMessage: string; trackingStatusId: string; err: string }>) =>
    registrationStatusOf({ userId: null, status: '', trackingStatusMessage: '', trackingStatusId: '', err: '', ...o });
  assert.equal(u({ userId: 'u123' }), 'approved');
  assert.equal(u({ trackingStatusMessage: 'הבקשה נדחתה' }), 'rejected');
  assert.equal(u({ userId: 'u123', status: 'rejected' }), 'rejected', 'an explicit refusal wins');
  assert.equal(u({ trackingStatusMessage: 'בבדיקה' }), 'waiting');
});

await ok('the register route: signed-in only, never for a connected or demo business, tracking code from the server', () => {
  const r = src('app/api/grow/register/route.ts');
  assert.ok(r.includes('await caller()'));
  assert.ok(r.includes('isDemoTenantId(c.tenantId)'));
  assert.ok(r.includes("'already-connected'"));
  assert.ok(r.includes("newTrackingCode(() => randomBytes(12).toString('hex'))"));
  assert.ok(!/b\.trackingCode|b\.tenantId/.test(r));
});

await ok('the mock registration page cannot exist next to real payments', () => {
  const r = src('app/api/grow/mock-register/route.ts');
  assert.ok(r.includes("grow.mode !== 'mock' || !grow.configured"));
  assert.ok(r.includes('applyOnboarding('), 'the same handler the real webhook uses');
});

// ── credentials and migration ────────────────────────────────────────────────
await ok('credentials live in the environment only', () => {
  for (const f of ['lib/grow/methods.ts', 'lib/grow/registration.ts', 'lib/grow/config.ts', 'app/api/grow/register/route.ts', 'app/api/grow/payment-request/route.ts']) {
    const t = src(f);
    assert.ok(!/apiKey\s*[:=]\s*['"][A-Za-z0-9]{8,}/.test(t), `${f} carries no literal key`);
  }
});

await ok('the migration keeps the onboarding tables server-only and puts them in the trial gate', () => {
  const sql = src('supabase/migrations/add_grow_cashier.sql');
  for (const c of ['status', 'status_message', 'encrypted_lead', 'link_url', 'updated_at']) assert.ok(sql.includes(`add column if not exists ${c} `), c);
  assert.ok(sql.includes("check (status in ('waiting', 'approved', 'rejected'))"));
  assert.ok(sql.includes('revoke all on public.grow_onboarding_pending from anon, authenticated'));
  assert.ok(sql.includes("array['grow_onboarding_pending', 'grow_onboarding_updates']"));
  assert.ok(sql.includes('public.is_tenant_active()'));
});

console.log(`grow cashier: ${n} ok`);
