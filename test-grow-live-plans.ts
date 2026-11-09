// Grow live onboarding (feat/grow-live-plans): the plan she picks becomes GetLink's price_quote (allowlist only), live sends
// is_direct_debit 0 and never Grow's test marketer, and GROW_ENV=production points every Grow client at the secure base with
// the wallet SDK in PRODUCTION. Fake fetch and fake env values only: nothing reaches Grow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROW_PLANS, DEFAULT_GROW_PLAN, growPlanByCode, GROW_FEES_URL } from './lib/grow/plans.ts';
import { registerConfig, getLinkBody, createLiveRegistration, registrationOps, GROW_REGISTER_TEST_MARKETER } from './lib/grow/registration.ts';
import { walletCredentials } from './lib/grow/wallet.ts';
import { growPlatformStatus, GROW_PRODUCTION_BASE } from './lib/grow/config.ts';
import { tokenCredentials } from './lib/grow/tokenFlow.ts';
import { growCostLineHe, growCostDetailsHe } from './lib/growPricing.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

// Fake values, shaped like nothing real.
const LIVE = { GROW_REGISTER_ENV: 'live', GROW_REGISTER_API_KEY_LIVE: 'fake-live-key', GROW_REGISTER_URL_LIVE: 'https://register.example/GetLink', GROW_REGISTER_MARKETER: 'fake-marketer' };
const TEST = { GROW_REGISTER_API_KEY_TEST: 'fake-test-key' };
const INPUT = { trackingCode: 'a'.repeat(24), businessNumber: '308577139', phone: '0542845655' };
const SECURE = 'https://secure.meshulam.co.il/api/light/server/1.0';

await ok('plans: the three codes with their terms, monthly by default, terms link', () => {
  assert.deepEqual(GROW_PLANS.map((p) => [p.code, p.feePercent, p.monthly, p.billing]), [
    ['HHtyr57', 0.75, 69, 'monthly'],
    ['GHT57YT', 0.75, 59, 'annual'],
    ['GHT57gy', 1, 29, 'annual-upfront'],
  ]);
  assert.equal(DEFAULT_GROW_PLAN, 'HHtyr57');
  assert.equal(GROW_FEES_URL, 'https://grow.business/fees/');
  for (const p of GROW_PLANS) assert.ok(!/—/.test(p.titleHe + p.lineHe), `${p.code}: no em dash`);
});

await ok('allowlist: only an exact code is a plan', () => {
  for (const p of GROW_PLANS) assert.equal(growPlanByCode(p.code)?.code, p.code);
  for (const bad of ['', ' HHtyr57', 'HHtyr57 ', 'hhtyr57', '1997', 'HHtyr57;DROP', 'x'.repeat(500), null, undefined, 57, {}, ['HHtyr57']]) {
    assert.equal(growPlanByCode(bad), null, `refused: ${JSON.stringify(bad)}`);
  }
});

await ok('GetLink body: the chosen code as price_quote; is_direct_debit 0 live, 1 test; an unknown code never reaches Grow', () => {
  const live = registerConfig(LIVE)!;
  assert.equal(live.isDirectDebit, 0);
  assert.equal(live.marketer, 'fake-marketer');
  assert.equal(live.priceQuote, '', 'no fallback price quote live');
  for (const p of GROW_PLANS) {
    const b = getLinkBody(live, { ...INPUT, priceQuote: p.code });
    assert.deepEqual(b, { marketer: 'fake-marketer', business_number: '308577139', phone: '0542845655', price_quote: p.code, is_direct_debit: 0, website: '', is_send_sms: 1 });
  }
  assert.equal(getLinkBody(live, { ...INPUT, priceQuote: 'evil' }).price_quote, '', 'an unknown code is not sent live');
  const test = registerConfig(TEST)!;
  assert.equal(test.isDirectDebit, 1);
  assert.equal(test.marketer, GROW_REGISTER_TEST_MARKETER);
  assert.equal(getLinkBody(test, { ...INPUT, priceQuote: 'GHT57gy' }).price_quote, 'GHT57gy');
  assert.equal(getLinkBody(test, { ...INPUT, priceQuote: 'GHT57gy' }).is_direct_debit, 1);
  assert.equal(getLinkBody(test, INPUT).price_quote, '1997', 'test env keeps its fallback');
  assert.equal(getLinkBody(registerConfig({ ...TEST, GROW_REGISTER_PRICE_QUOTE: 'T1' })!, INPUT).price_quote, 'T1');
  // The live env var is ignored live: the plan she picked is the only source.
  assert.equal(registerConfig({ ...LIVE, GROW_REGISTER_PRICE_QUOTE: '1997' })!.priceQuote, '');
});

await ok('live createLink: sends the chosen plan; with no valid plan it refuses without calling Grow', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const f = (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ status: 1, err: '', data: { url: 'https://reg.grow.test/f/1', encrypted_lead: 'L' } })); }) as unknown as typeof fetch;
  const ops = createLiveRegistration(registerConfig(LIVE)!, f);
  assert.equal((await ops.createLink({ ...INPUT, priceQuote: 'GHT57YT' })).ok, true);
  assert.equal(calls[0].price_quote, 'GHT57YT');
  assert.equal(calls[0].is_direct_debit, 0);
  const r = await ops.createLink({ ...INPUT, priceQuote: 'nope' });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1, 'Grow was not called without a plan');
});

await ok('fail closed: live without GROW_REGISTER_MARKETER has no registration config (never the test marketer)', () => {
  const { GROW_REGISTER_MARKETER: _m, ...noMarketer } = LIVE;
  assert.equal(registerConfig(noMarketer), null);
  assert.equal(registerConfig({ ...noMarketer, GROW_REGISTER_MARKETER: '   ' }), null);
  assert.equal(registrationOps(noMarketer, 'live', true, 'https://k.test'), null);
  assert.equal(registerConfig(TEST)!.marketer, GROW_REGISTER_TEST_MARKETER, 'the test env keeps its marketer');
  assert.ok(!src('lib/grow/registration.ts').includes("GROW_REGISTER_MARKETER || 'b4"), 'no inline marketer default');
});

await ok('the route reads the plan, checks it against the allowlist, and passes its code as priceQuote', () => {
  const r = src('app/api/grow/register/route.ts');
  assert.match(r, /const plan = growPlanByCode\(b\.plan\);/);
  assert.match(r, /if \(!plan\) return NextResponse\.json\(\{ success: false, code: 'bad-plan'/);
  assert.match(r, /priceQuote: plan\.code/);
  const ui = src('app/GrowRegistration.jsx');
  assert.match(ui, /plan: DEFAULT_GROW_PLAN/);
  assert.match(ui, /onStart\(\{ businessNumber: bn, phone: ph, plan: form\.plan \}\)/);
  assert.match(ui, /GROW_FEES_URL/);
  assert.ok(!/HHtyr57|GHT57/.test(ui), 'the UI reads the codes from lib/grow/plans.ts');
});

await ok('GROW_ENV=production: secure base everywhere, wallet sdkEnv PRODUCTION', () => {
  const env = { GROW_ENV: 'production', GROW_API_KEY: 'fake-api', GROW_PAGE_CODE: 'fake-page', GROW_WALLET_PAGE_CODE: 'fake-wallet', GROW_TOKEN_API_KEY: 'fake-token', GROW_TOKEN_PAGE_CODE: 'fake-token-page' };
  assert.equal(GROW_PRODUCTION_BASE, SECURE);
  const s = growPlatformStatus(env);
  assert.equal(s.env, 'production'); assert.equal(s.apiBase, SECURE); assert.equal(s.configured, true);
  const w = walletCredentials(env)!;
  assert.equal(w.sdkEnv, 'PRODUCTION'); assert.equal(w.apiBase, SECURE); assert.equal(w.env, 'production'); assert.equal(w.userIdOverride, undefined);
  const t = tokenCredentials(env)!;
  assert.equal(t.apiBase, SECURE); assert.equal(t.env, 'production'); assert.equal(t.userIdOverride, undefined);
  // sandbox stays DEV
  assert.equal(walletCredentials({ GROW_TOKEN_API_KEY_TEST: 'k', GROW_WALLET_PAGE_CODE_TEST: 'w', GROW_TOKEN_USER_ID_TEST: 'u' })!.sdkEnv, 'DEV');
  // an insecure override is refused by every client
  assert.equal(walletCredentials({ ...env, GROW_API_BASE: 'http://x' }), null);
  assert.equal(tokenCredentials({ ...env, GROW_API_BASE: 'http://x' }), null);
  assert.equal(growPlatformStatus({ ...env, GROW_API_BASE: 'http://x' }).configured, false);
});

await ok('cost line: the same three plans, from the same constants', () => {
  const line = growCostLineHe();
  for (const p of GROW_PLANS) assert.ok(line.includes(`₪${p.monthly} לחודש + ${p.feePercent}%`), `line has ${p.code}`);
  const d = growCostDetailsHe().join('\n');
  for (const p of GROW_PLANS) assert.ok(d.includes(p.titleHe), `details name ${p.code}`);
  assert.ok(!/—/.test(line + d));
});

await ok('existing account: Grow customer service from the registered email/phone, disconnect from another system, paste kept', () => {
  const c = src('app/GrowCard.jsx');
  assert.match(c, /support@grow\.business/);
  assert.match(c, /052-7773144/);
  assert.match(c, /wa\.me\/972527773144/);
  assert.match(c, /רק מהמייל או מהנייד שרשומים בחשבון/);
  assert.match(c, /לנתק אותו משם ולחבר ל-Kalmea/);
  assert.match(c, /placeholder="מזהה עסק ב-Grow"/);
});

await ok('GO_LIVE doc names the variables (no values) and the webhook', () => {
  const d = src('docs/GO_LIVE_GROW.md');
  for (const v of ['GROW_PAGE_CODE', 'GROW_WALLET_PAGE_CODE', 'GROW_TOKEN_API_KEY', 'GROW_TOKEN_PAGE_CODE', 'GROW_API_KEY', 'GROW_ENV', 'GROW_MODE', 'GROW_UI_ENABLED', 'GROW_REGISTER_ENV', 'GROW_REGISTER_URL_LIVE', 'GROW_REGISTER_API_KEY_LIVE', 'GROW_REGISTER_MARKETER']) {
    assert.ok(d.includes('`' + v + '`'), `doc names ${v}`);
  }
  assert.match(d, /https:\/\/kalmea\.app\/api\/grow\/webhook/);
  assert.match(d, /[Rr]edeploy/);
});

console.log(`\n${n} passed`);
