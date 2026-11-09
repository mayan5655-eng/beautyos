// The payment page inside WhatsApp / Instagram / Facebook (2026-11-09: the owner's ₪1 link from WhatsApp on iPhone showed "not completed"
// with no Grow window). UA classes, the fallback decision, the diagnostics payload (no PII), the token-bound rate-limited endpoint, and
// what createPaymentProcess's answer is reduced to. Fake fetch and in-memory repos: nothing reaches Grow or a database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uaClass, isInApp, osOf, fallbackDecision, androidIntentUrl, buildDiagPayload, cleanDiagBody, sdkFailureText, safeHostedUrl } from './lib/grow/walletDiag.js';
import { recordWalletDiag, sessionReportOf, reportWalletSession } from './lib/grow/walletDiagServer.ts';
import { startWalletSession } from './lib/grow/wallet.ts';
import type { GrowPayment } from './lib/grow/service.ts';
import { hit, RATE_POLICIES } from './lib/rateLimit.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

const UA = {
  waIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.21.79',
  waAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 WhatsApp/2.24.21',
  igIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; he_IL)',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0;]',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  criOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  chrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
const HOSTED = 'https://secure.meshulam.co.il/s/abc123';

await ok('user-agent classes: WhatsApp, Instagram, Facebook in-app on both phones; Safari; Chrome; web views; other', () => {
  assert.equal(uaClass(UA.waIos), 'whatsapp');
  assert.equal(uaClass(UA.waAndroid), 'whatsapp');
  assert.equal(uaClass(UA.igIos), 'instagram');
  assert.equal(uaClass(UA.fbIos), 'facebook');
  assert.equal(uaClass(UA.fbAndroid), 'facebook');
  assert.equal(uaClass(UA.safari), 'ios-safari');
  assert.equal(uaClass(UA.criOS), 'ios-other');
  assert.equal(uaClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'), 'ios-webview', 'an unnamed iOS app web view');
  assert.ok(isInApp('ios-webview'));
  assert.equal(uaClass(UA.chrome), 'android-chrome');
  assert.equal(uaClass(UA.webview), 'android-webview');
  assert.equal(uaClass(UA.desktop), 'other');
  assert.equal(uaClass(''), 'other');
  for (const k of ['waIos', 'waAndroid', 'igIos', 'fbIos', 'fbAndroid', 'webview'] as const) assert.ok(isInApp(uaClass(UA[k])), k);
  for (const k of ['safari', 'chrome', 'desktop'] as const) assert.ok(!isInApp(uaClass(UA[k])), k);
  assert.equal(osOf(UA.waIos), 'ios'); assert.equal(osOf(UA.waAndroid), 'android'); assert.equal(osOf(UA.desktop), 'other');
});

await ok('fallback: in-app with a hosted url goes there before the wallet; without one the wallet is tried first', () => {
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'whatsapp', hostedUrl: HOSTED }), { action: 'hosted', url: HOSTED });
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'whatsapp', hostedUrl: '' }), { action: 'sdk' });
  assert.deepEqual(fallbackDecision({ when: 'before', cls: 'ios-safari', hostedUrl: HOSTED }), { action: 'sdk' }, 'a real browser keeps the wallet');
});

await ok('fallback: an SDK failure before the wallet opened goes to the hosted url, in any browser', () => {
  for (const cls of ['whatsapp', 'ios-safari', 'android-chrome', 'other']) {
    assert.deepEqual(fallbackDecision({ when: 'failed', cls, hostedUrl: HOSTED, opened: false }), { action: 'hosted', url: HOSTED }, cls);
  }
});

await ok('fallback: no url in an in-app browser -> the open-in-browser prompt (iOS / Android); in a real browser -> Grow\'s message', () => {
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'whatsapp', hostedUrl: '', os: 'ios' }), { action: 'browser', os: 'ios' });
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'facebook', hostedUrl: '', os: 'android' }), { action: 'browser', os: 'android' });
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'ios-other', hostedUrl: '', os: 'ios' }), { action: 'browser', os: 'ios' });
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'ios-safari', hostedUrl: '' }), { action: 'message' });
});

await ok('fallback: once the wallet was on screen, a failure is the client\'s (a decline): a message, never a redirect', () => {
  assert.deepEqual(fallbackDecision({ when: 'failed', cls: 'whatsapp', hostedUrl: HOSTED, opened: true }), { action: 'message' });
});

await ok('hosted url: Grow hosts over https only, never anywhere else', () => {
  assert.equal(safeHostedUrl(HOSTED), HOSTED);
  assert.equal(safeHostedUrl('https://pay.grow.link/x'), 'https://pay.grow.link/x');
  for (const bad of ['http://secure.meshulam.co.il/x', 'https://evil.com/meshulam.co.il', 'https://meshulam.co.il.evil.com/', 'javascript:alert(1)', '', null, 42]) {
    assert.equal(safeHostedUrl(bad), '', String(bad));
    assert.deepEqual(fallbackDecision({ when: 'before', cls: 'whatsapp', hostedUrl: bad }), { action: 'sdk' });
  }
});

await ok('Android: the intent link opens the same page in Chrome, with the page itself as the fallback', () => {
  const u = androidIntentUrl('https://kalmea.app/pay/abc');
  assert.equal(u, `intent://kalmea.app/pay/abc#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent('https://kalmea.app/pay/abc')};end`);
  assert.equal(androidIntentUrl('javascript:x'), '');
});

await ok('Grow\'s failure text is read from every shape the SDK uses; empty only when Grow said nothing', () => {
  assert.equal(sdkFailureText({ message: 'Invalid auth code' }), 'Invalid auth code');
  assert.equal(sdkFailureText({ data: { message: 'Session expired' } }), 'Session expired');
  assert.equal(sdkFailureText({ error: { description: 'blocked' } }), 'blocked');
  assert.equal(sdkFailureText('plain'), 'plain');
  assert.equal(sdkFailureText({ status: 0 }), '');
  assert.equal(sdkFailureText(null), '');
});

const TOKEN = 'ab'.repeat(24);
await ok('diagnostics payload: only the listed fields, UA reduced to a class, phone / email / card numbers masked', () => {
  const p = buildDiagPayload({
    token: TOKEN, event: 'onFailure', sdkLoaded: true, sdkEnv: 'PRODUCTION', ua: UA.waIos, phase: 'browser',
    raw: { message: 'Card 4580458045804580 for dana@example.com 050-1234567 refused', code: 12, status: '0', fullName: 'Dana Levi', phone: '0501234567', authCode: 'SECRET' },
  });
  assert.deepEqual(Object.keys(p).sort(), ['code', 'event', 'message', 'phase', 'sdkEnv', 'sdkLoaded', 'status', 't', 'ua']);
  assert.equal(p.ua, 'whatsapp');
  assert.equal(p.code, '12'); assert.equal(p.status, '0');
  const s = JSON.stringify(p);
  for (const leak of ['4580458045804580', 'dana@example.com', '050-1234567', '0501234567', 'Dana', 'SECRET', 'iPhone OS', 'Mozilla']) assert.ok(!s.includes(leak), leak);
  assert.match(p.message, /\[number\].*\[email\].*\[number\]/);
  assert.equal(buildDiagPayload({ token: TOKEN, event: 'weird', raw: null, ua: '' }).event, 'other');
  // the server re-cleans whatever arrives
  const c = cleanDiagBody({ event: 'onError', message: 'x'.repeat(900) + ' 0501234567', ua: 'Mozilla/5.0 iPhone', name: 'Dana', phone: '050', sdkLoaded: 'yes' });
  assert.deepEqual(Object.keys(c).sort(), ['code', 'event', 'message', 'phase', 'sdkEnv', 'sdkLoaded', 'status', 'ua']);
  assert.equal(c.ua, 'other'); assert.equal(c.sdkLoaded, false); assert.ok(c.message.length <= 200);
});

const PAY = { id: 'pay-1', tenant_id: '22222222-2222-2222-2222-222222222222' };
function diagDeps(limitPerPayment = 3) {
  const alerts: { source: string; message: string; details: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
  const looked: string[] = [];
  const counts = new Map<string, number>();
  return {
    alerts, looked,
    deps: {
      findByToken: async (t: string) => { looked.push(t); return t === TOKEN ? PAY : null; },
      limited: (k: string) => { const c = (counts.get(k) || 0) + 1; counts.set(k, c); return c > limitPerPayment; },
      alert: async (source: string, message: string, details: Record<string, unknown>, opts: Record<string, unknown>) => { alerts.push({ source, message, details, opts }); },
    },
  };
}

await ok('endpoint: token-bound. A malformed or unknown token writes nothing; a known one writes the payment id, never the token', async () => {
  const m = diagDeps();
  assert.equal((await recordWalletDiag({ t: 'nope', event: 'onFailure' }, m.deps)).status, 404);
  assert.equal(m.looked.length, 0, 'a malformed token is not even looked up');
  assert.equal((await recordWalletDiag({ t: 'cd'.repeat(24), event: 'onFailure' }, m.deps)).status, 404);
  assert.equal(m.alerts.length, 0);
  const r = await recordWalletDiag({ ...buildDiagPayload({ token: TOKEN, event: 'onTimeout', raw: { message: 'x' }, sdkLoaded: false, sdkEnv: 'PRODUCTION', ua: UA.waIos }), tenant_id: 'OTHER-TENANT', payment_id: 'evil' }, m.deps);
  assert.equal(r.status, 200);
  assert.equal(m.alerts.length, 1);
  const a = m.alerts[0];
  assert.equal(a.source, 'grow:wallet-client'); assert.equal(a.opts.severity, 'warning');
  assert.equal(a.details.payment_id, 'pay-1', 'the payment comes from the token, never from the body');
  assert.equal(a.details.tenant_id, PAY.tenant_id);
  assert.equal(a.details.event, 'onTimeout'); assert.equal(a.details.ua, 'whatsapp'); assert.equal(a.details.sdkLoaded, false);
  assert.ok(!JSON.stringify(a).includes(TOKEN), 'the token is a bearer secret and is never written');
});

await ok('endpoint: rate-limited per payment (429 once over), and the real policy is per IP and per payment', async () => {
  const m = diagDeps(3);
  const body = buildDiagPayload({ token: TOKEN, event: 'onFailure', raw: null, ua: UA.waIos });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await recordWalletDiag(body, m.deps)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  assert.equal(m.alerts.length, 3);
  const pol = RATE_POLICIES['wallet-diag'];
  assert.ok(pol.perIp.limit <= 30 && pol.perTenant.limit <= 10);
  const key = `wallet-diag:payment:test-${Date.now()}`;
  const seen = Array.from({ length: pol.perTenant.limit + 1 }, () => hit(key, pol.perTenant).ok);
  assert.equal(seen.filter(Boolean).length, pol.perTenant.limit);
  const route = src('app/api/grow/wallet/diag/route.ts');
  assert.match(route, /checkIpLimit\(request, 'wallet-diag'\)/);
  assert.match(route, /wallet-diag:payment:\$\{paymentId\}/);
  assert.doesNotMatch(route, /tenantId|tenant_id/, 'the route never takes a tenant from the request');
});

await ok('session report: flags and Grow\'s error only; never the authCode or the url', async () => {
  const good = sessionReportOf({ status: 1, err: '', data: { authCode: 'AUTHSECRET', processId: 9, url: HOSTED } }, 200, PAY);
  assert.deepEqual({ ok: good.ok, a: good.hasAuthCode, u: good.hasUrl }, { ok: true, a: true, u: true });
  const bad = sessionReportOf({ status: 0, err: { id: 701, message: 'apiKey missing' }, data: '' }, 200, PAY, 'grow');
  assert.deepEqual({ ok: bad.ok, c: bad.errCode, m: bad.errMessage, a: bad.hasAuthCode }, { ok: false, c: '701', m: 'apiKey missing', a: false });
  const alerts: unknown[] = [];
  await reportWalletSession(good, async (...args) => { alerts.push(args); });
  const s = JSON.stringify(alerts);
  assert.ok(!s.includes('AUTHSECRET') && !s.includes(HOSTED));
  assert.match(s, /grow:wallet-session/); assert.match(s, /"severity":"warning"/); assert.match(s, /"has_url":true/);
});

function sessionDeps(answer: unknown, status = 200) {
  const p = { id: 'p1', tenant_id: PAY.tenant_id, notify_token: TOKEN, status: 'created', amount: 1, description: 'בדיקה', client_name: 'דנה', payer_phone: '0501234567', created_at: new Date().toISOString(), appointment_id: null } as unknown as GrowPayment;
  const reports: unknown[] = [];
  return {
    reports,
    deps: {
      repo: { findByToken: async (t: string) => (t === TOKEN ? p : null), updatePayment: async () => {} },
      creds: { apiKey: 'k', pageCode: 'wp', apiBase: 'https://secure.meshulam.co.il/api/light/server/1.0', env: 'production' as const, sdkEnv: 'PRODUCTION' as const },
      userIdFor: async () => 'uid',
      appUrl: 'https://kalmea.app',
      fetchImpl: (async () => new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch,
      report: (r: unknown) => { reports.push(r); },
    },
  };
}

await ok('startWalletSession keeps Grow\'s hosted url when the wallet answer carries one (Grow hosts only) and reports every answer', async () => {
  const a = sessionDeps({ status: 1, data: { authCode: 'AC', processId: 5, processToken: 'pt', url: HOSTED } });
  const r = await startWalletSession(TOKEN, a.deps);
  assert.ok(r.ok && r.hostedUrl === HOSTED);
  assert.equal(a.reports.length, 1);
  const b = sessionDeps({ status: 1, data: { authCode: 'AC', processId: 5 } });
  const r2 = await startWalletSession(TOKEN, b.deps);
  assert.ok(r2.ok && r2.hostedUrl === '', 'no url in the answer: none invented');
  const c = sessionDeps({ status: 1, data: { authCode: 'AC', processId: 5, url: 'https://evil.example/x' } });
  const r3 = await startWalletSession(TOKEN, c.deps);
  assert.ok(r3.ok && r3.hostedUrl === '');
  const d = sessionDeps({ status: 0, err: { id: 3, message: 'page code' } });
  const r4 = await startWalletSession(TOKEN, d.deps);
  assert.ok(!r4.ok);
  assert.equal((d.reports[0] as { errCode: string }).errCode, '3');
  const e = sessionDeps({}, 500);
  await startWalletSession(TOKEN, e.deps);
  assert.equal((e.reports[0] as { reason: string; httpStatus: number }).reason, 'http');
  const f = sessionDeps({ status: 1, data: { authCode: 'AC', processId: 5 } });
  f.deps.report = () => { throw new Error('db down'); };
  assert.ok((await startWalletSession(TOKEN, f.deps)).ok, 'a failing report never fails the payment');
});

await ok('the page: reports failures, falls back, never shows an empty failure; the route returns hostedUrl', () => {
  const page = src('app/pay/[token]/PayClient.jsx');
  assert.match(page, /\/api\/grow\/wallet\/diag/);
  assert.match(page, /fallbackDecision\(\{ when: 'before'/);
  assert.match(page, /fallbackDecision\(\{ when: 'failed'/);
  assert.match(page, /'sdk-load'/); assert.match(page, /'no-open'/);
  assert.match(page, /data-testid="pay-browser"/); assert.match(page, /פתיחה בספארי/); assert.match(page, /androidIntentUrl/);
  assert.match(page, /Grow השיבה/);
  assert.doesNotMatch(page, /[—]/, 'no em dashes in product copy');
  assert.match(src('app/api/grow/wallet/route.ts'), /hostedUrl: r\.hostedUrl/);
  assert.match(src('lib/grow/walletClient.js'), /'onTimeout'\)/);
});

await ok('diag body: huge strings are cut before any regex runs (no CPU burn), and the route refuses oversized bodies', () => {
  const big = 'a'.repeat(200000);
  const t0 = Date.now();
  const c = cleanDiagBody({ event: 'onFailure', message: big, code: '1'.repeat(200000), status: big, phase: big });
  assert.ok(Date.now() - t0 < 200, 'linear: done in well under 200ms');
  assert.equal(c.message.length, 200); assert.ok(c.code.length <= 40);
  const r = src('app/api/grow/wallet/diag/route.ts');
  assert.match(r, /DIAG_MAX_BYTES/); assert.match(r, /status: 413/); assert.doesNotMatch(r, /request\.json\(/);
});

console.log(`\npassed ${n} failed 0`);
