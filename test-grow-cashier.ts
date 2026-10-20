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
  registerConfig, getLinkError, GETLINK_ERRORS, growBusinessNumber, israeliIdValid, GROW_REGISTER_TEST_URL,
} from './lib/grow/registration.ts';
import { growRegisterFrameOrigin, buildCsp } from './lib/securityHeaders.ts';
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

await ok('mock registration answers with our stand-in form; its lead id is the tracking code; a bad code is refused', async () => {
  const ops = createMockRegistration('https://k.test/');
  const r = await ops.createLink({ trackingCode: 'a'.repeat(24), businessNumber: '308577139', phone: '0501234567' });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.url, `https://k.test/api/grow/mock-register?c=${'a'.repeat(24)}`); assert.equal(r.encryptedLead, 'a'.repeat(24)); }
  assert.equal((await ops.createLink({ trackingCode: 'xyz', businessNumber: '308577139', phone: '1' })).ok, false);
});

await ok('registration is live whenever its test (or live) key is set; the mock only in mock mode on a configured platform', () => {
  assert.notEqual(registrationOps({}, 'mock', true, 'https://k.test'), null);
  assert.equal(registrationOps({}, 'mock', true, 'https://k.test')!.kind, 'mock');
  assert.equal(registrationOps({}, 'live', true, 'https://k.test'), null);
  assert.equal(registrationOps({}, 'mock', false, 'https://k.test'), null);
  assert.equal(registrationOps({ GROW_REGISTER_API_KEY_TEST: 'k' }, 'live', false, 'https://k.test')!.kind, 'live');
  // live needs its own key AND its own URL (Grow gives it separately); no test default leaks into live
  assert.equal(registerConfig({ GROW_REGISTER_ENV: 'live', GROW_REGISTER_API_KEY_TEST: 'k' }), null);
  assert.equal(registerConfig({ GROW_REGISTER_ENV: 'live', GROW_REGISTER_API_KEY_LIVE: 'k' }), null);
  const live = registerConfig({ GROW_REGISTER_ENV: 'live', GROW_REGISTER_API_KEY_LIVE: 'k', GROW_REGISTER_URL_LIVE: 'https://register.example/GetLink' })!;
  assert.equal(live.isDirectDebit, 0);
  const test = registerConfig({ GROW_REGISTER_API_KEY_TEST: 'k' })!;
  assert.deepEqual([test.url, test.marketer, test.priceQuote, test.isDirectDebit], [GROW_REGISTER_TEST_URL, 'b4f38969f705', '1997', 1]);
  assert.equal(registerConfig({ GROW_REGISTER_API_KEY_TEST: 'k', GROW_REGISTER_URL_TEST: 'http://insecure' }), null);
});

await ok("GetLink: JSON body per Grow's spec, x-api-key and a User-Agent header, encrypted_lead kept", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ status: 1, err: '', data: { url: 'https://reg.grow.test/f/1', encrypted_lead: 'LEAD9==' } })); }) as unknown as typeof fetch;
  const cfg = registerConfig({ GROW_REGISTER_API_KEY_TEST: 'K' })!;
  const r = await createLiveRegistration(cfg, f).createLink({ trackingCode: 'a'.repeat(24), businessNumber: '308577139', phone: '0542845655' });
  assert.deepEqual(r, { ok: true, url: 'https://reg.grow.test/f/1', encryptedLead: 'LEAD9==' });
  assert.equal(calls[0].url, 'https://devregisterapi.meshulam.co.il/GetLink');
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h['x-api-key'], 'K');
  assert.match(h['User-Agent'], /\S/);
  assert.equal(h['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    marketer: 'b4f38969f705', business_number: '308577139', phone: '0542845655', price_quote: '1997', is_direct_debit: 1, website: '', is_send_sms: 1,
  });
  // unreachable: plain Hebrew, never a throw
  const down = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  const d = await createLiveRegistration(cfg, down).createLink({ trackingCode: 'a'.repeat(24), businessNumber: '308577139', phone: '0542845655' });
  assert.equal(d.ok === false && d.code, 'unreachable');
});

await ok('GetLink errors: every documented id in plain Hebrew; 149 offers "I have Grow"; the real 149 answer shape parses', () => {
  const real = readRegisterResponse({ status: 0, err: { id: 149, message: 'עסק קיים במשולם' }, data: '' });
  assert.equal(real.ok, false);
  if (!real.ok) { assert.equal(real.growId, '149'); assert.equal(real.kind, 'exists'); assert.match(real.messageHe, /יש לי חשבון Grow/); assert.equal(real.error, 'עסק קיים במשולם'); }
  const kinds: Record<string, string> = { '17': 'open-lead', '145': 'not-approved', '149': 'exists', '115': 'platform', '143': 'platform', '117': 'platform', '142': 'platform', '121': 'platform', '13': 'bad-phone', '120': 'bad-business-number', '165': 'general' };
  for (const [id, kind] of Object.entries(kinds)) {
    const e = getLinkError(id, '');
    assert.equal(e.kind, kind, id);
    assert.match(e.messageHe, /[א-ת]/, id);
    assert.doesNotMatch(e.messageHe, /—/, id);
    assert.ok(GETLINK_ERRORS[id], id);
  }
  assert.match(getLinkError('17', '').messageHe, /שירות הלקוחות של Grow/);
  assert.equal(getLinkError('999', 'x').kind, 'general');
  const s13 = readRegisterResponse({ status: 0, err: '13' });
  assert.equal(!s13.ok && s13.growId, '13');
  assert.equal(readRegisterResponse({ status: 1, data: { url: 'http://insecure', encrypted_lead: 'x' } }).ok, false);
  assert.equal(readRegisterResponse({ status: 1, data: { url: 'https://ok.test' } }).ok, false, 'no encrypted_lead, nothing to match the webhook by');
  assert.equal(readRegisterResponse(null).ok, false);
});

await ok('business number: digits, padded to 9, Israeli check digit', () => {
  assert.equal(growBusinessNumber('308577139'), '308577139');
  assert.equal(growBusinessNumber('30857713-9'), '308577139');
  assert.equal(growBusinessNumber('308577138'), null);
  assert.equal(growBusinessNumber('123'), null);
  assert.equal(israeliIdValid('000000018'), true);
});

await ok('a registration update means approved, rejected or still waiting', () => {
  const u = (o: Partial<{ userId: string | null; status: string; trackingStatusMessage: string; trackingStatusId: string; err: string }>) =>
    registrationStatusOf({ userId: null, status: '', trackingStatusMessage: '', trackingStatusId: '', err: '', ...o });
  assert.equal(u({ userId: 'u123' }), 'approved');
  assert.equal(u({ trackingStatusMessage: 'הבקשה נדחתה' }), 'rejected');
  assert.equal(u({ userId: 'u123', status: 'rejected' }), 'rejected', 'an explicit refusal wins');
  assert.equal(u({ trackingStatusMessage: 'בבדיקה' }), 'waiting');
});

await ok("the register route: signed-in only, never for a connected or demo business, matched by Grow's encrypted_lead only", () => {
  const r = src('app/api/grow/register/route.ts');
  assert.ok(r.includes('await caller()'));
  assert.ok(r.includes('isDemoTenantId(c.tenantId)'));
  assert.ok(r.includes("'already-connected'"));
  assert.ok(r.includes("newTrackingCode(() => randomBytes(12).toString('hex'))"));
  assert.ok(r.includes('tracking_code: r.encryptedLead'));
  assert.ok(!/b\.trackingCode|b\.tenantId|b\.encryptedLead/.test(r));
  // the log carries Grow's id and words, never her phone or business number
  for (const line of r.split('\n').filter((l) => /console\./.test(l))) assert.doesNotMatch(line, /phone|businessNumber/, line);
});

await ok("the card: Grow's form in an iframe only from its own origin and only where the CSP allows it; strict frame-src by default", () => {
  const g = src('app/GrowRegistration.jsx');
  assert.ok(g.includes("e.origin !== origin"));
  assert.ok(g.includes("d.source !== 'growRegister'"));
  assert.ok(g.includes("d.action === 'success'") && g.includes("d.action === 'close'"));
  assert.ok(g.includes('new URL(url).origin === frameOrigin'));
  assert.ok(g.includes("failure.code === 'exists'"), '149 offers the "I have Grow" door');
  assert.equal(growRegisterFrameOrigin({}), null);
  assert.equal(growRegisterFrameOrigin({ GROW_REGISTER_FRAME_ORIGIN: 'https://evil.example' }), null);
  assert.equal(growRegisterFrameOrigin({ GROW_REGISTER_FRAME_ORIGIN: 'https://*.meshulam.co.il' }), null, 'no wildcard');
  assert.equal(growRegisterFrameOrigin({ GROW_REGISTER_FRAME_ORIGIN: 'https://devregister.meshulam.co.il/' }), 'https://devregister.meshulam.co.il');
  assert.match(buildCsp({ env: {} }), /frame-src 'none'/);
  assert.match(buildCsp({ env: { GROW_REGISTER_FRAME_ORIGIN: 'https://devregister.meshulam.co.il' } }), /frame-src https:\/\/devregister\.meshulam\.co\.il;/);
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
