// The card-and-Bit wallet inside WhatsApp / Instagram / Facebook (GROW_INAPP_WALLET=1, default off). Apple Pay and Google Pay cannot run
// in those web views, so with the flag on the wallet is opened there with transactionTypes 1 (card) and 6 (Bit) only, and shown on the page
// instead of the open-in-browser fallback. The server believes the page's hint only when it is exactly `true`; the limit only removes
// methods. Fake fetch and an in-memory repo: nothing reaches Grow or a database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProcessFields } from './lib/grow/payload.ts';
import { startWalletSession, inAppLimitFor, inAppWalletEnabled, INAPP_TRANSACTION_TYPES } from './lib/grow/wallet.ts';
import type { WalletCreds } from './lib/grow/wallet.ts';
import type { GrowPayment } from './lib/grow/service.ts';
import { fallbackDecision, wantsInAppWallet, uaClass } from './lib/grow/walletDiag.js';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

const TOKEN = 'e'.repeat(48);
const HOSTED = 'https://secure.meshulam.co.il/s/abc123';
const UA = {
  waIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.21.79',
  igIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; he_IL)',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0;]',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
const ON = { GROW_INAPP_WALLET: '1' };
const OFF = { GROW_INAPP_WALLET: '' };
const JUNK: unknown[] = ['true', 'TRUE', '1', 1, 'yes', {}, [], [true], { inApp: true }, null, undefined, false, 0, NaN, 'false', ' true'];

function session() {
  const row: GrowPayment & Record<string, unknown> = {
    id: 'pay1aaaaaaaaaaaaaaaaaaaaaaaaaaaaa', tenant_id: '22222222-2222-2222-2222-222222222222', status: 'created', amount: 1,
    description: 'בקשת תשלום', client_name: 'דנה כהן', payer_phone: '0501234567', notify_token: TOKEN, process_id: null,
    appointment_id: null, created_at: '2026-11-10T10:00:00Z',
  } as unknown as GrowPayment & Record<string, unknown>;
  const sent: FormData[] = [];
  const creds: WalletCreds = { apiKey: 'k1', pageCode: 'wp1', apiBase: 'https://sandbox.invalid/api', env: 'sandbox', sdkEnv: 'DEV' };
  const deps = {
    repo: { findByToken: async (t: string) => (t === TOKEN ? row : null), updatePayment: async (_id: string, patch: Record<string, unknown>) => { Object.assign(row, patch); } },
    creds, appUrl: 'https://kalmea.app', userIdFor: async () => 'owner-uid', now: () => new Date('2026-11-10T11:00:00Z'),
    fetchImpl: (async (_u: unknown, init?: RequestInit) => { sent.push(init!.body as FormData); return new Response(JSON.stringify({ status: 1, data: { processId: 7, authCode: 'ac' } })); }) as typeof fetch,
  };
  return { sent, deps };
}
const typeFields = (f: FormData) => [...f.keys()].filter((k) => k.startsWith('transactionTypes')).map((k) => [k, String(f.get(k))]);

await ok('flag off: no transactionTypes fields whatever the page says, and the in-app fallback is unchanged', async () => {
  assert.equal(inAppWalletEnabled(OFF), false);
  assert.equal(inAppWalletEnabled({}), false);
  for (const v of ['0', 'true', 'on', 'yes', ' 2']) assert.equal(inAppWalletEnabled({ GROW_INAPP_WALLET: v }), false, `"${v}" is not the flag`);
  assert.equal(inAppLimitFor(OFF, true), false, 'the hint alone never limits anything');
  assert.equal(inAppLimitFor({}, true), false);
  const s = session();
  const r = await startWalletSession(TOKEN, { ...s.deps, cardAndBitOnly: inAppLimitFor(OFF, true) });
  assert.ok(r.ok && r.limited === false);
  assert.deepEqual(typeFields(s.sent[0]), []);
  // Today's fallback, exactly: in-app with a hosted page goes there first; a failed wallet in-app asks for the phone's browser.
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'whatsapp', hostedUrl: HOSTED }), { action: 'hosted', url: HOSTED });
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'whatsapp', hostedUrl: '', os: 'ios' }), { action: 'browser', os: 'ios' });
  assert.equal(wantsInAppWallet(false, 'whatsapp'), false, 'the page sends no hint while the flag is off');
  assert.equal(wantsInAppWallet(undefined, 'whatsapp'), false);
});

await ok('flag on + in-app: createPaymentProcess carries transactionTypes 1 and 6 only, and the wallet is shown on the page', async () => {
  assert.equal(inAppLimitFor(ON, true), true);
  assert.equal(inAppLimitFor({ GROW_INAPP_WALLET: ' 1 ' }, true), true);
  assert.deepEqual([...INAPP_TRANSACTION_TYPES], ['1', '6']);
  const s = session();
  const r = await startWalletSession(TOKEN, { ...s.deps, cardAndBitOnly: inAppLimitFor(ON, true) });
  assert.ok(r.ok && r.limited === true && r.authCode === 'ac');
  assert.deepEqual(typeFields(s.sent[0]), [['transactionTypes[0]', '1'], ['transactionTypes[1]', '6']]);
  assert.ok(!typeFields(s.sent[0]).some(([, v]) => v === '13' || v === '14'), 'never Apple Pay or Google Pay');
  for (const ua of [UA.waIos, UA.igIos, UA.fbAndroid]) assert.equal(wantsInAppWallet(true, uaClass(ua)), true, ua);
  // The card-and-Bit wallet is drawn here, not swapped for the hosted page; if it still fails to open, the old fallback remains.
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'whatsapp', hostedUrl: HOSTED, limited: true }), { action: 'sdk' });
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'whatsapp', hostedUrl: '', os: 'ios', limited: true }), { action: 'browser', os: 'ios' });
});

await ok('flag on + a normal browser (Safari, Chrome, desktop): no hint, no fields, nothing changes', async () => {
  for (const ua of [UA.safari, UA.chrome, UA.desktop, '']) assert.equal(wantsInAppWallet(true, uaClass(ua)), false, ua || 'empty ua');
  assert.equal(inAppLimitFor(ON, undefined), false, 'no hint in the body');
  const s = session();
  const r = await startWalletSession(TOKEN, { ...s.deps, cardAndBitOnly: inAppLimitFor(ON, undefined) });
  assert.ok(r.ok && r.limited === false);
  assert.deepEqual(typeFields(s.sent[0]), []);
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'ios-safari', hostedUrl: HOSTED }), { action: 'sdk' });
});

await ok('junk hint values are a normal browser: only the boolean true counts', async () => {
  for (const v of JUNK) assert.equal(inAppLimitFor(ON, v), false, `hint ${JSON.stringify(v)}`);
  for (const v of JUNK) assert.equal(wantsInAppWallet(v, 'whatsapp'), false, `inAppWallet ${JSON.stringify(v)}`);
  // A truthy non-boolean slipped into the deps is not a limit either.
  const s = session();
  const r = await startWalletSession(TOKEN, { ...s.deps, cardAndBitOnly: 'true' as unknown as boolean });
  assert.ok(r.ok && r.limited === false);
  assert.deepEqual(typeFields(s.sent[0]), []);
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'whatsapp', hostedUrl: HOSTED, limited: 'true' as unknown as boolean }), { action: 'hosted', url: HOSTED });
});

await ok('buildProcessFields: only known wallet type ids pass, deduplicated; none given means none sent', () => {
  const base = { userId: 'u', pageCode: 'p', sum: 1, description: 'x', fullName: 'דנה כהן', phone: '0501234567', successUrl: 'https://a/s', cancelUrl: 'https://a/c', notifyUrl: 'https://a/n', paymentRef: 'r' };
  assert.deepEqual(buildProcessFields(base).filter(([k]) => k.startsWith('transactionTypes')), []);
  const f = buildProcessFields({ ...base, transactionTypes: ['1', '6', '6', '99', 'x', '1; drop'] });
  assert.deepEqual(f.filter(([k]) => k.startsWith('transactionTypes')), [['transactionTypes[0]', '1'], ['transactionTypes[1]', '6']]);
});

await ok('wiring: the route reads the flag and the hint through inAppLimitFor only; the page sends the hint only with the flag answered on', () => {
  const route = src('app/api/grow/wallet/route.ts');
  assert.match(route, /cardAndBitOnly: inAppLimitFor\(process\.env, body\.inApp\)/);
  assert.match(route, /inAppWallet: inAppWalletEnabled\(process\.env\)/);
  assert.match(route, /limited: r\.limited/);
  const page = src('app/pay/[token]/PayClient.jsx');
  assert.match(page, /wantsInAppWallet\(info\?\.inAppWallet, uaClass\(window\.navigator\.userAgent\)\) \? \{ inApp: true \} : \{\}/);
  assert.match(page, /limited: j\.limited === true/);
  assert.match(page, /cardBit \? ['"]כרטיס אשראי או ביט\.['"] : ['"]כרטיס אשראי, ביט, Apple Pay או Google Pay\.['"]/);
  assert.ok(!/—/.test(page), 'no em dash in product copy');
  assert.match(src('.env.example'), /^GROW_INAPP_WALLET=$/m);
  assert.match(src('scripts/run-tests.mjs'), /GROW_INAPP_WALLET: ''/);
});

console.log(`\npassed ${n} failed 0`);
