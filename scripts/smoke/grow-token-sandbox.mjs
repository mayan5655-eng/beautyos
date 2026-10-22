// The saved-card (token) flows against Grow's SANDBOX with Grow's TEST credentials. No real card, no real money, nothing of Kalmea's database is touched.
//   node --env-file=.env.local scripts/smoke/grow-token-sandbox.mjs [outDir]
// Needs GROW_TOKEN_USER_ID_TEST, GROW_TOKEN_API_KEY_TEST, GROW_TOKEN_PAGE_CODE_TEST.
//   mode 1  save only        a token page (chargeType 3), card typed in the sandbox form, nothing charged
//   mode 2  charge + save    a real sandbox payment that also returns a token
//   mode 3  charge a token   createTransactionWithToken with a fresh numeric identifier
//   then    the SAME identifier again -> error 1010 (must not be retried), looked up by that one identifier
import { chromium } from 'playwright';
import { tokenCredentials, newUniqueIdentifier, groupIdentifierOf } from '../../lib/grow/tokenFlow.ts';
import { createLiveOps } from '../../lib/grow/ops.ts';

// Grow's review (2026-10): getPaymentProcessInfo is for extreme cases only; a token must come from Grow's server callback. This script
// stands in for the callback with getPaymentProcessInfo, so it no longer runs unless asked for explicitly. The proof Grow asked for is
// scripts/smoke/grow-token-callback.mjs (against a public deployment, the real callback, no getPaymentProcessInfo).
if (process.env.ALLOW_PROCESS_INFO !== '1') { console.error('[grow] this script calls getPaymentProcessInfo, which Grow asked us not to use. Run scripts/smoke/grow-token-callback.mjs instead (or set ALLOW_PROCESS_INFO=1 for an exceptional check).'); process.exit(2); }

const out = process.argv[2] || '';
const creds = tokenCredentials(process.env);
if (!creds || creds.env !== 'sandbox') { console.error('[token-sandbox] sandbox test credentials are not set'); process.exit(2); }
const ops = createLiveOps(creds);
const USER = creds.userIdOverride;
let bad = 0;
const check = (ok, msg) => { console.log(ok ? '[token-sandbox] ok  ' : '[token-sandbox] FAIL', msg); if (!ok) bad++; };
const mask = (t) => (t ? `${String(t).slice(0, 4)}…${String(t).slice(-3)}` : '(none)');

// What a real callback would deliver, read here with getPaymentProcessInfo (sandbox convenience; the app reads the callback).
async function processInfo(processId, processToken) {
  const f = new FormData();
  for (const [k, v] of [['apiKey', creds.apiKey], ['userId', USER], ['pageCode', creds.pageCode], ['processId', processId], ['processToken', processToken]]) f.append(k, v);
  const r = await fetch(`${creds.apiBase}/getPaymentProcessInfo`, { method: 'POST', body: f });
  return r.json();
}

async function payOnHostedPage(browser, url, shot) {
  const page = await (await browser.newContext({ viewport: { width: 420, height: 1000 }, locale: 'he-IL' })).newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const fr = await (async () => { for (let i = 0; i < 20; i++) { const f = page.frames().find((x) => /creditguard/.test(x.url())); if (f) return f; await page.waitForTimeout(500); } throw new Error('card form did not load'); })();
  await fr.waitForSelector('#card-number', { timeout: 20000 });
  await fr.fill('#card-number', '4580458045804580');
  await fr.selectOption('#expYear', { index: 5 });
  await fr.selectOption('#expMonth', { index: 12 });
  await fr.fill('#personal-id', '000000018');
  if (out && shot) await page.screenshot({ path: `${out}/${shot}.png` });
  await fr.click('#cg-submit-btn');
  await page.waitForURL((u) => !/meshulam|creditguard/.test(u.hostname), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const landed = page.url();
  await page.close();
  return landed;
}

const browser = await chromium.launch();
try {
  const common = { tenantId: '00000000-0000-0000-0000-000000000000', userId: 'ignored-in-sandbox', returnUrl: 'https://kalmea.app/?token-sandbox=1', fullName: 'בדיקה קלמיה', phone: '0500000000', notifyUrl: 'https://kalmea.app/api/grow/webhook' };

  // mode 1: save only
  const s1 = await ops.createTokenSession({ ...common, appointmentId: 'smoke-save-only', mode: 'save_only' });
  check(s1.ok && !!s1.url && !!s1.processId, 'mode 1 (save only): Grow returned a hosted card page');
  const landed1 = await payOnHostedPage(browser, s1.url, 'grow-token-1-save-only');
  console.log('[token-sandbox] returned to', landed1.slice(0, 60));
  const info1 = await processInfo(s1.processId, s1.processToken);
  const d1 = info1?.data?.transactions?.[0] || {}; console.log("[token-sandbox] info1 raw:", JSON.stringify(info1).replace(/"cardToken":"[^"]+"/g, "\"cardToken\":\"<hidden>\"").slice(0, 1500));
  console.log('[token-sandbox] mode 1 info keys:', Object.keys(d1).join(','), '| status', info1?.status, '| statusCode', d1.statusCode, '| sum', d1.sum);
  const token1 = d1.cardToken;
  check(!!token1, `mode 1: a card token came back (${mask(token1)}, last4 ${d1.cardSuffix})`);

  // mode 3: charge the saved token, then the same identifier again
  const uid = newUniqueIdentifier();
  const group = groupIdentifierOf('smoke-appointment');
  const ch = await ops.chargeToken({ userId: USER, tokenRef: token1, amount: 5, description: 'בדיקת חיוב כרטיס שמור', uniqueIdentifier: uid, groupIdentifier: group, fullName: 'בדיקה קלמיה', phone: '0500000000' });
  console.log('[token-sandbox] charge:', JSON.stringify(ch));
  check(ch.ok === true && !!ch.transactionId, 'mode 3 (charge a saved token): charged once');
  const dup = await ops.chargeToken({ userId: USER, tokenRef: token1, amount: 5, description: 'בדיקת חיוב כרטיס שמור', uniqueIdentifier: uid, groupIdentifier: group, fullName: 'בדיקה קלמיה', phone: '0500000000' });
  console.log('[token-sandbox] same identifier again:', JSON.stringify(dup));
  check(dup.ok === false && dup.code === 'duplicate', 'the same transactionUniqueIdentifier is refused as a duplicate (1010) and is not retried');
  const look = await ops.lookupToken({ userId: USER, tokenRef: token1, uniqueIdentifier: uid });
  console.log('[token-sandbox] lookup:', JSON.stringify(look));
  check(look.ok === true && look.found === true && look.status === 'paid', 'looked up by the ONE unique identifier: found, paid');
  if (ch.ok && look.ok) check(look.transactionId === ch.transactionId, 'the looked-up transaction is the one that was charged');
  // refund of that token charge (full, same day)
  if (ch.ok) {
    const rf = await ops.refund({ userId: USER, transactionId: ch.transactionId, transactionToken: ch.transactionToken, amount: 5, idempotencyKey: 'smoke' });
    console.log('[token-sandbox] refund:', JSON.stringify(rf));
    check(rf.ok === true, 'refund of the token charge went through');
  }
  const missing = await ops.lookupToken({ userId: USER, tokenRef: token1, uniqueIdentifier: newUniqueIdentifier() });
  console.log('[token-sandbox] lookup of an identifier never used:', JSON.stringify(missing));

  // mode 2: charge now and save
  const s2 = await ops.createTokenSession({ ...common, appointmentId: 'smoke-charge-save', mode: 'charge_and_save', amount: 7 });
  check(s2.ok && !!s2.url, 'mode 2 (charge and save): Grow returned a hosted card page');
  await payOnHostedPage(browser, s2.url, 'grow-token-2-charge-and-save');
  const info2 = await processInfo(s2.processId, s2.processToken);
  const d2 = info2?.data?.transactions?.[0] || {};
  console.log('[token-sandbox] mode 2 info:', 'status', info2?.status, '| statusCode', d2.statusCode, '| sum', d2.sum, '| token', mask(d2.cardToken));
  check(!!d2.cardToken && String(d2.statusCode) === '2', 'mode 2: paid (statusCode 2) and a token came back');
} catch (e) {
  console.error('[token-sandbox] ERROR', e.message);
  bad++;
} finally {
  await browser.close();
}
console.log(bad ? `[token-sandbox] ${bad} problem(s)` : '[token-sandbox] all ok');
process.exit(bad ? 1 : 0);
