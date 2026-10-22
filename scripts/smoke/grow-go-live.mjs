// Grow's go-live checklist, against Grow's SANDBOX with Grow's TEST credentials only. No real card, no real money, no Kalmea database row.
//   node --env-file=.env.local scripts/smoke/grow-go-live.mjs <outDir>
// Needs GROW_TOKEN_USER_ID_TEST, GROW_TOKEN_API_KEY_TEST, GROW_TOKEN_PAGE_CODE_TEST, GROW_WALLET_PAGE_CODE_TEST.
// Produces the three transaction ids Grow asks for, and screen recordings of the client's side:
//   1  a regular payment  the client's payment page (/pay/<token>, same terms tick and copy as app/pay/[token]/PayClient.jsx) -> Grow wallet ->
//                         sandbox card -> our callback logic records it -> approveTransaction sent to Grow (its answer printed) -> thank-you
//   2  a saved card       the booking ticks (policy + card consent) -> Grow's hosted credit-card token page (chargeType 3, saveCardToken 1)
//                         -> approveTransaction for the token's first transaction
//   3  a token charge     createTransactionWithToken on the token from 2
// Then the money of 1 and 3 is refunded, so nothing is left in the sandbox. Grow's server callback cannot reach this machine, so the
// callback body is built from getPaymentProcessInfo (the same fields), exactly as scripts/smoke/grow-wallet.mjs does.
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { walletCredentials, walletAsCreds, startWalletSession, walletLinkState } from '../../lib/grow/wallet.ts';
import { createCharge, applyNotification, approveTransaction } from '../../lib/grow/service.ts';
import { readNotification, tenantRefOf } from '../../lib/grow/payload.ts';
import { createLiveOps } from '../../lib/grow/ops.ts';
import { tokenCredentials, newUniqueIdentifier, groupIdentifierOf, CARD_CONSENT_TEXT_HE } from '../../lib/grow/tokenFlow.ts';
import { securityHeaders } from '../../lib/securityHeaders.ts';
import { PAY_TERMS_BEFORE_HE, PAY_TERMS_LINK_HE, PAY_TERMS_AFTER_HE } from '../../lib/paymentTerms.ts';

// Grow's review (2026-10): getPaymentProcessInfo is for extreme cases only; a token must come from Grow's server callback. This script
// stands in for the callback with getPaymentProcessInfo, so it no longer runs unless asked for explicitly. The proof Grow asked for is
// scripts/smoke/grow-token-callback.mjs (against a public deployment, the real callback, no getPaymentProcessInfo).
if (process.env.ALLOW_PROCESS_INFO !== '1') { console.error('[grow] this script calls getPaymentProcessInfo, which Grow asked us not to use. Run scripts/smoke/grow-token-callback.mjs instead (or set ALLOW_PROCESS_INFO=1 for an exceptional check).'); process.exit(2); }

const out = process.argv[2];
if (!out) { console.error('usage: grow-go-live.mjs <outDir>'); process.exit(2); }
mkdirSync(`${out}/video`, { recursive: true });
const wallet = walletCredentials(process.env);
const tok = tokenCredentials(process.env);
if (!wallet || wallet.env !== 'sandbox' || !tok || tok.env !== 'sandbox') { console.error('[go-live] sandbox test credentials are not set'); process.exit(2); }
const ids = {};
let bad = 0;
const check = (ok, msg) => { console.log(ok ? '[go-live] ok  ' : '[go-live] FAIL', msg); if (!ok) bad++; };
const pause = (pg, ms) => pg.waitForTimeout(ms);

// ── memory repo (nothing of Kalmea's database) ─────────────────────────────
const payments = new Map(); const receipts = [];
const repo = {
  async insertPayment(row) { const p = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), process_id: null, receipt_id: null, ...row }; payments.set(p.id, p); return p; },
  async updatePayment(id, patch) { Object.assign(payments.get(id), patch); },
  async markPaid(id, patch) { const p = payments.get(id); if (!p || p.status !== 'created') return null; Object.assign(p, patch); return p; },
  async findByToken(t) { return [...payments.values()].find((p) => p.notify_token === t) || null; },
  async findByProcessId(pid) { const l = [...payments.values()].filter((p) => p.process_id === pid); return l.length === 1 ? l[0] : null; },
  async insertReceipt(row) { const r = { id: randomUUID(), ...row }; receipts.push(r); return r; },
  async setReceiptDocument(id, url, number) { Object.assign(receipts.find((r) => r.id === id), { legal_doc_url: url, legal_doc_number: number }); },
};
const TENANT = randomUUID(); // a made-up business, never a real one
const APP = 'https://kalmea.app';
const deps = { repo, creds: walletAsCreds(wallet), appUrl: APP, newToken: () => randomBytes(24).toString('hex') };
const wdeps = { repo, creds: wallet, appUrl: APP, userIdFor: async () => null };
const processTokens = new Map();

// approveTransaction with Grow's answer kept (the app does not need the body; here it is the proof Grow asked for)
const approveAnswers = [];
const keepAnswer = async (url, init) => { const r = await fetch(url, init); const j = await r.clone().json().catch(() => null); approveAnswers.push(j); return r; };

// ── the client's payment page: the copy and the terms tick of app/pay/[token]/PayClient.jsx ──
const BANNER = '<div style="background:#FBEDE9;color:#1F3A30;text-align:center;font-size:13px;padding:6px">סביבת בדיקות (Sandbox) של Grow · כרטיס בדיקה, ללא כסף אמיתי</div>';
const clientJs = readFileSync(new URL('../../lib/grow/walletClient.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const page = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>תשלום מאובטח</title></head>
<body style="margin:0;font-family:Assistant,Arial,sans-serif;background:#FBF8F1;color:#1F3A30">${BANNER}
<div style="padding:30px 16px"><main data-testid="pay-page" style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #E8DFD0;border-radius:20px;padding:28px 22px;text-align:center;box-shadow:0 6px 24px rgba(31,58,48,.06)">
<p style="font-size:15px;color:#656A56;margin:0 0 6px">הסטודיו של נועה · קוסמטיקה</p>
<h1 id="amount" data-testid="pay-amount" style="font-size:34px;margin:4px 0;font-family:'Frank Ruhl Libre',serif;font-weight:600"></h1><p id="desc" style="font-size:16px;color:#656A56;margin:0 0 18px"></p>
<div id="ready">
<label data-testid="pay-terms" style="display:flex;align-items:flex-start;gap:10px;text-align:right;padding:12px;border-radius:14px;border:1px solid #E8DFD0;background:#FDFBF9;margin-bottom:14px;cursor:pointer;font-size:15px;line-height:1.6">
<input id="terms" type="checkbox" style="width:20px;height:20px;margin-top:2px;flex-shrink:0;accent-color:#1F3A30"><span>${PAY_TERMS_BEFORE_HE}<a href="https://kalmea.app/terms#payments" target="_blank" style="color:#1F3A30;font-weight:700;text-decoration:underline">${PAY_TERMS_LINK_HE}</a>${PAY_TERMS_AFTER_HE}</span></label>
<button id="pay" data-testid="pay-start" disabled style="width:100%;min-height:52px;border:0;border-radius:14px;background:#1F3A30;color:#fff;font-size:18px;font-weight:700;opacity:.55;font-family:inherit"></button>
<p style="font-size:13px;color:#656A56;margin-top:12px;line-height:1.7">כרטיס אשראי, ביט, Apple Pay או Google Pay.<br>התשלום מאובטח ועובר דרך Grow. פרטי הכרטיס לא נשמרים אצלנו.</p></div>
<div id="msg" data-testid="pay-msg" style="font-size:16px"></div></main></div>
<script>${clientJs}
const token = location.pathname.split('/').pop();
preloadGrowSdk(window);
const $ = (i) => document.getElementById(i);
let amount = 0;
fetch('/api/grow/wallet?t=' + token).then((r) => r.json()).then((j) => { amount = j.amount; $('amount').textContent = '₪' + j.amount; $('desc').textContent = j.description; $('pay').textContent = 'לתשלום ₪' + j.amount; });
$('terms').onchange = (e) => { $('pay').disabled = !e.target.checked; $('pay').style.opacity = e.target.checked ? 1 : .55; };
function done() { $('ready').style.display = 'none'; $('amount').style.display = 'none'; $('desc').style.display = 'none'; $('msg').innerHTML = '<p style="font-size:40px;margin:0">🌸</p><h2 style="font-size:24px;margin:6px 0;font-family:serif">התשלום התקבל, תודה!</h2><p style="color:#656A56">₪' + amount + ' · ' + $('desc').textContent + '</p>'; $('msg').setAttribute('data-state', 'paid'); }
function poll() { let n = 0; const t = setInterval(async () => { n++; const j = await (await fetch('/api/grow/wallet?t=' + token)).json(); if (j.state === 'paid') { clearInterval(t); done(); } else if (n > 60) clearInterval(t); }, 1500); }
$('pay').onclick = async () => {
  $('pay').textContent = 'פותחת את התשלום…';
  const j = await (await fetch('/api/grow/wallet', { method: 'POST', body: JSON.stringify({ t: token, acceptedTerms: $('terms').checked }) })).json();
  if (!j.success) { $('msg').textContent = 'ERR ' + (j.error || ''); return; }
  window.__walletEvents = [];
  await openGrowWallet(window, { sdkEnv: j.sdkEnv, authCode: j.authCode, events: {
    onSuccess: () => { window.__walletEvents.push('success'); $('ready').style.display = 'none'; $('msg').textContent = 'התשלום עבר, רגע מאשרות אותו…'; poll(); },
    onFailure: (m) => { window.__walletEvents.push('failure:' + m); $('msg').textContent = 'failure ' + m; },
    onCancel: () => window.__walletEvents.push('cancel'),
    onOpenChange: (o) => window.__walletEvents.push('open:' + o),
  } });
};
</script></body></html>`;

// the booking step before a saved card: the policy tick with the terms link and the card consent, then Grow's hosted card page
const bookingPage = (url) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>קביעת תור</title></head>
<body style="margin:0;font-family:Assistant,Arial,sans-serif;background:#FBF8F1;color:#1F3A30">${BANNER}
<div style="padding:24px 16px"><main style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #E8DFD0;border-radius:20px;padding:24px 20px">
<p style="font-size:13px;letter-spacing:2px;font-weight:700;margin:0 0 10px">התור שלך</p><p style="margin:0 0 16px">טיפול פנים · יום ה׳ · 10:00 · ₪350</p>
<label style="display:flex;gap:10px;padding:12px;border:1px solid #E8DFD0;border-radius:14px;margin-bottom:12px;line-height:1.6"><input id="p" type="checkbox" style="width:20px;height:20px;flex-shrink:0"><span><b>מדיניות ביטולים</b><br>ביטול עד 24 שעות לפני התור ללא עלות. ביטול מאוחר או אי הגעה: ₪100.<br>${PAY_TERMS_BEFORE_HE}מדיניות הביטולים ול<a href="https://kalmea.app/terms#payments" target="_blank" style="color:#1F3A30;font-weight:700">${PAY_TERMS_LINK_HE}</a>${PAY_TERMS_AFTER_HE}</span></label>
<label style="display:flex;gap:10px;padding:12px;border:1px solid #E8DFD0;border-radius:14px;margin-bottom:14px;line-height:1.6"><input id="c" type="checkbox" style="width:20px;height:20px;flex-shrink:0"><span>${CARD_CONSENT_TEXT_HE}</span></label>
<a id="go" href="${url}" style="display:block;text-align:center;padding:15px;border-radius:14px;background:#1F3A30;color:#fff;font-weight:700;text-decoration:none;opacity:.55;pointer-events:none">לשמירת הכרטיס וקביעת התור</a>
</main></div><script>const s=()=>{const ok=document.getElementById('p').checked&&document.getElementById('c').checked;const g=document.getElementById('go');g.style.opacity=ok?1:.55;g.style.pointerEvents=ok?'auto':'none'};document.getElementById('p').onchange=s;document.getElementById('c').onchange=s;</script></body></html>`;
let bookingUrl = '';

const certDir = `${tmpdir()}/kalmea-wallet-cert`;
if (!existsSync(`${certDir}/c.pem`)) {
  mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${certDir}/k.pem`, '-out', `${certDir}/c.pem`, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
}
const server = https.createServer({ key: readFileSync(`${certDir}/k.pem`), cert: readFileSync(`${certDir}/c.pem`) }, async (req, res) => {
  const u = new URL(req.url, 'https://x');
  const send = (code, body, type = 'application/json', extra = {}) => { res.writeHead(code, { 'content-type': type, ...extra }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (u.pathname.startsWith('/pay/')) return send(200, page, 'text/html; charset=utf-8', Object.fromEntries(securityHeaders({ dev: false, grow: true }).map((x) => [x.key, x.value])));
  if (u.pathname === '/book') return send(200, bookingPage(bookingUrl), 'text/html; charset=utf-8');
  if (u.pathname === '/api/grow/wallet' && req.method === 'GET') {
    const { state, payment } = await walletLinkState(u.searchParams.get('t') || '', { repo });
    return send(payment ? 200 : 404, payment ? { success: true, state, amount: Number(payment.amount), description: payment.description } : { success: false });
  }
  if (u.pathname === '/api/grow/wallet' && req.method === 'POST') {
    let b = ''; for await (const c of req) b += c;
    const body = JSON.parse(b || '{}');
    if (body.acceptedTerms !== true) return send(400, { success: false, state: 'terms-required' }); // as app/api/grow/wallet/route.ts
    const r = await startWalletSession(body.t || '', wdeps);
    if (r.ok) processTokens.set(r.processId, r.processToken);
    return send(r.ok ? 200 : 409, r.ok ? { success: true, authCode: r.authCode, sdkEnv: r.sdkEnv } : { success: false, error: r.message });
  }
  send(404, 'no');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const LOCAL = `https://localhost:${server.address().port}`;

async function processInfo(creds, userId, processId, processToken) {
  const f = new FormData();
  for (const [k, v] of [['apiKey', creds.apiKey], ['userId', userId], ['pageCode', creds.pageCode], ['processId', processId], ['processToken', processToken]]) f.append(k, v);
  for (let i = 0; i < 12; i++) {
    const j = await (await fetch(`${creds.apiBase}/getPaymentProcessInfo`, { method: 'POST', body: f })).json();
    if (j?.data?.transactions?.[0]?.transactionId) return j;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
const callbackBody = (processId, t, extra = {}) => {
  const b = { 'data[processId]': String(processId) };
  for (const [k, v] of Object.entries(t || {})) if (v !== null && v !== undefined && typeof v !== 'object') b[`data[${k}]`] = String(v);
  return { ...b, ...extra };
};

async function typeCard(frame) {
  await frame.type('#card-number', '4580458045804580', { delay: 70 });
  await frame.selectOption('#expYear', { index: 5 }).catch(() => {});
  await frame.selectOption('#expMonth', { index: 12 }).catch(() => {});
  await frame.type('#personal-id', '000000018', { delay: 70 }).catch(() => {});
}

const browser = await chromium.launch();
const ops = createLiveOps(wallet);
const tokOps = createLiveOps(tok);
const VIDEO = { dir: `${out}/video`, size: { width: 430, height: 932 } };
try {
  // ── 1. a regular payment, recorded ───────────────────────────────────────
  const a = await createCharge({ tenantId: TENANT, userId: 'unused', amount: 10, description: 'טיפול פנים', clientName: 'לקוחה לדוגמה', phone: '0500000000', wallet: true }, deps);
  check(a.ok, 'payment link created');
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL', ignoreHTTPSErrors: true, recordVideo: VIDEO });
  const pg = await ctx.newPage();
  await pg.goto(a.url.replace(APP, LOCAL), { waitUntil: 'networkidle' });
  await pause(pg, 2500);
  await pg.click('#terms'); await pause(pg, 1200);
  await pg.click('[data-testid=pay-start]');
  await pg.waitForSelector('#Gr0W8-btn-credit', { state: 'visible', timeout: 40000 }).catch(async (e) => { await pg.screenshot({ path: `${out}/x-nomethods.png` }); console.log('[go-live] events:', await pg.evaluate(() => window.__walletEvents), await pg.textContent('#msg')); throw e; });
  await pause(pg, 2500);
  await pg.click('#Gr0W8-btn-credit');
  let fr = null;
  for (let i = 0; i < 60 && !fr; i++) { for (const f of pg.frames()) if (await f.$('#card-number').catch(() => null)) { fr = f; break; } if (!fr) await pause(pg, 500); }
  if (!fr) throw new Error('the card form did not appear');
  await pause(pg, 1000);
  await typeCard(fr); await pause(pg, 1200);
  await (await fr.$('#cg-submit-btn')).click();
  await pg.waitForFunction(() => (window.__walletEvents || []).some((e) => e === 'success' || e.startsWith('failure')), null, { timeout: 90000 });
  const pa = payments.get(a.paymentId);
  const infoA = await processInfo(wallet, wallet.userIdOverride, pa.process_id, processTokens.get(String(pa.process_id)) || '');
  const tA = infoA?.data?.transactions?.[0];
  const body = callbackBody(pa.process_id, tA, { 'data[customFields][cField1]': String(pa.id).replace(/-/g, ''), 'data[customFields][cField2]': tenantRefOf(pa.tenant_id) });
  const res = await applyNotification(body, pa.notify_token, deps, (n) => approveTransaction(n, walletAsCreds(wallet), keepAnswer));
  check(res.status === 'paid', `1 regular payment recorded by our callback logic (${res.status})`);
  await pg.waitForSelector('[data-state=paid]', { timeout: 30000 });
  await pause(pg, 3500);
  await pg.screenshot({ path: `${out}/1-paid.png` });
  const videoA = await pg.video().path();
  await ctx.close();
  ids.payment = String(tA.transactionId);
  ids.paymentApprove = approveAnswers.at(-1);
  console.log('[go-live] approveTransaction answer (payment):', JSON.stringify(ids.paymentApprove));
  check(Number(ids.paymentApprove?.status) === 1, '1 approveTransaction accepted by Grow');

  // ── 2. a saved card (token page), recorded ───────────────────────────────
  const s = await tokOps.createTokenSession({ tenantId: TENANT, userId: 'ignored-in-sandbox', appointmentId: 'go-live-save', mode: 'save_only', returnUrl: 'https://kalmea.app/?go-live=1', fullName: 'לקוחה לדוגמה', phone: '0500000000', notifyUrl: 'https://kalmea.app/api/grow/webhook' });
  check(s.ok && !!s.url, '2 Grow returned a hosted card-saving page');
  bookingUrl = s.url;
  const ctx2 = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL', ignoreHTTPSErrors: true, recordVideo: VIDEO });
  const pg2 = await ctx2.newPage();
  await pg2.goto(`${LOCAL}/book`, { waitUntil: 'networkidle' });
  await pause(pg2, 2000);
  await pg2.click('#p'); await pause(pg2, 800); await pg2.click('#c'); await pause(pg2, 1200);
  await pg2.click('#go');
  let fr2 = null;
  for (let i = 0; i < 60 && !fr2; i++) { const f = pg2.frames().find((x) => /creditguard/.test(x.url())); if (f && await f.$('#card-number').catch(() => null)) fr2 = f; else await pause(pg2, 500); }
  if (!fr2) throw new Error('the token card form did not appear');
  await pause(pg2, 1500);
  await typeCard(fr2); await pause(pg2, 1200);
  await fr2.click('#cg-submit-btn');
  await pg2.waitForURL((u) => !/meshulam|creditguard/.test(u.hostname), { timeout: 60000 }).catch(() => {});
  await pause(pg2, 2500);
  const videoB = await pg2.video().path();
  await ctx2.close();
  const infoS = await processInfo(tok, tok.userIdOverride, s.processId, s.processToken);
  const tS = infoS?.data?.transactions?.[0] || {};
  const nS = readNotification(callbackBody(s.processId, tS));
  if (nS) await approveTransaction(nS, tok, keepAnswer);
  ids.tokenSave = String(tS.transactionId || '');
  ids.tokenSaveApprove = approveAnswers.at(-1);
  console.log('[go-live] approveTransaction answer (token save):', JSON.stringify(ids.tokenSaveApprove));
  check(!!tS.cardToken && !!ids.tokenSave, `2 the card was saved, token received (status ${tS.statusCode}, last4 ${tS.cardSuffix})`);

  // ── 3. a charge from the saved token ─────────────────────────────────────
  const ch = await tokOps.chargeToken({ userId: tok.userIdOverride, tokenRef: tS.cardToken, amount: 5, description: 'דמי ביטול מאוחר (בדיקה)', uniqueIdentifier: newUniqueIdentifier(), groupIdentifier: groupIdentifierOf('go-live-appointment'), fullName: 'לקוחה לדוגמה', phone: '0500000000' });
  check(ch.ok && !!ch.transactionId, `3 charged the saved token (${ch.ok ? ch.transactionId : ch.error})`);
  ids.tokenCharge = String(ch.transactionId || '');

  // ── clean-up: refund 1 and 3 ─────────────────────────────────────────────
  const paid = payments.get(pa.id);
  const r1 = await ops.refund({ userId: wallet.userIdOverride, transactionId: paid.transaction_id, transactionToken: paid.transaction_token, amount: 10, idempotencyKey: pa.id });
  const r3 = ch.ok ? await tokOps.refund({ userId: tok.userIdOverride, transactionId: ch.transactionId, transactionToken: ch.transactionToken, amount: 5, idempotencyKey: 'go-live' }) : { ok: false };
  console.log('[go-live] refunds:', r1.ok ? 'payment yes' : `payment no (${r1.error})`, '|', r3.ok ? 'token charge yes' : `token charge no (${r3.error})`);
  ids.refunds = { payment: !!r1.ok, tokenCharge: !!r3.ok };
  ids.videos = [videoA, videoB];
  try {
  // ── 2b. charge and save (chargeType 1 + saveCardToken): a paid first transaction of a token, approved like the callback route does ──
  const s2 = await tokOps.createTokenSession({ tenantId: TENANT, userId: 'ignored-in-sandbox', appointmentId: 'go-live-charge-save', mode: 'charge_and_save', amount: 7, returnUrl: 'https://kalmea.app/?go-live=2', fullName: 'לקוחה לדוגמה', phone: '0500000000', notifyUrl: 'https://kalmea.app/api/grow/webhook' });
  let t2 = {};
  if (s2.ok) {
    const ctx3 = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL', ignoreHTTPSErrors: true });
    const pg3 = await ctx3.newPage();
    await pg3.goto(s2.url, { waitUntil: 'load', timeout: 60000 });
    let fr3 = null;
    for (let i = 0; i < 60 && !fr3; i++) { const f = pg3.frames().find((x) => /creditguard/.test(x.url())); if (f && await f.$('#card-number').catch(() => null)) fr3 = f; else await pause(pg3, 500); }
    if (fr3) { await typeCard(fr3); await fr3.click('#cg-submit-btn'); await pg3.waitForURL((u) => !/meshulam|creditguard/.test(u.hostname), { timeout: 60000 }).catch(() => {}); }
    await ctx3.close();
    t2 = (await processInfo(tok, tok.userIdOverride, s2.processId, s2.processToken))?.data?.transactions?.[0] || {};
    const n2 = readNotification(callbackBody(s2.processId, t2));
    if (n2) await approveTransaction(n2, tok, keepAnswer);
    ids.tokenChargeAndSave = String(t2.transactionId || '');
    ids.tokenChargeAndSaveApprove = approveAnswers.at(-1);
    console.log('[go-live] approveTransaction answer (charge and save):', JSON.stringify(ids.tokenChargeAndSaveApprove));
  }
  check(!!t2.cardToken && String(t2.statusCode) === '2', `2b charge and save: paid and a token came back (${ids.tokenChargeAndSave})`);
  if (t2.transactionId) { const r2 = await tokOps.refund({ userId: tok.userIdOverride, transactionId: String(t2.transactionId), transactionToken: String(t2.transactionToken || ''), amount: 7, idempotencyKey: 'go-live-2b' }); console.log('[go-live] refund 2b:', r2.ok ? 'yes' : `no (${r2.error})`); }
  } catch (e) { console.error('[go-live] 2b FAIL', e?.message || e); bad++; }

} catch (e) {
  console.error('[go-live] FAIL', e?.stack || e);
  bad++;
} finally {
  await browser.close();
  server.close();
}
writeFileSync(`${out}/ids.json`, JSON.stringify({ at: new Date().toISOString(), env: 'sandbox', ...ids }, null, 2));
console.log('[go-live] ids:', JSON.stringify({ payment: ids.payment, tokenSave: ids.tokenSave, tokenChargeAndSave: ids.tokenChargeAndSave, tokenCharge: ids.tokenCharge }));
console.log(bad ? `[go-live] ${bad} FAILED` : '[go-live] all ok');
process.exit(bad ? 1 : 0);
