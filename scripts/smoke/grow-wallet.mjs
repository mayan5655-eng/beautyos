// The wallet checkout (card, Bit, Apple Pay, Google Pay on one page) against Grow's SANDBOX with Grow's TEST credentials.
//   node --env-file=.env.local scripts/smoke/grow-wallet.mjs [outDir]
// Needs GROW_TOKEN_USER_ID_TEST, GROW_TOKEN_API_KEY_TEST, GROW_WALLET_PAGE_CODE_TEST.
// NOTHING of Kalmea's database is touched: the payment rows live in memory in this process. The page served here is a small stand-in for
// app/pay/[token]/PayClient.jsx that runs the SAME wallet code (lib/grow/walletClient.js) under the SAME Content-Security-Policy as the
// real page (securityHeaders({ grow: true })), so what is proven is: Grow's wallet opens under our policy, a sandbox card pays, our
// callback code records it with a receipt, and a refund goes through.
//   flow A  cashier charge        createCharge({ wallet: true }) -> /pay/<token> -> card 4580458045804580
//   flow B  payment request link  requestDescription + requestWaLink -> the link inside the wa.me message -> paid the same way
//   flow C  refund                refundTransaction for flow A
// Grow's server callback cannot reach this machine, so the callback body is built from what getPaymentProcessInfo returns for the paid
// process (the same fields) and handed to our applyNotification; approveTransaction is then sent to Grow for real.
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { walletCredentials, walletAsCreds, startWalletSession, walletLinkState } from '../../lib/grow/wallet.ts';
import { createCharge, applyNotification, applyInvoice, approveTransaction } from '../../lib/grow/service.ts';
import { createLiveOps } from '../../lib/grow/ops.ts';
import { requestDescription, requestMessageHe, requestWaLink } from '../../lib/grow/paymentRequest.ts';
import { securityHeaders } from '../../lib/securityHeaders.ts';
import { tenantRefOf } from '../../lib/grow/payload.ts';

// Grow's review (2026-10): getPaymentProcessInfo is for extreme cases only; a token must come from Grow's server callback. This script
// stands in for the callback with getPaymentProcessInfo, so it no longer runs unless asked for explicitly. The proof Grow asked for is
// scripts/smoke/grow-token-callback.mjs (against a public deployment, the real callback, no getPaymentProcessInfo).
if (process.env.ALLOW_PROCESS_INFO !== '1') { console.error('[grow] this script calls getPaymentProcessInfo, which Grow asked us not to use. Run scripts/smoke/grow-token-callback.mjs instead (or set ALLOW_PROCESS_INFO=1 for an exceptional check).'); process.exit(2); }

const out = process.argv[2] || '';
if (out) mkdirSync(out, { recursive: true });
const wallet = walletCredentials(process.env);
if (!wallet || wallet.env !== 'sandbox') { console.error('[wallet] sandbox test credentials are not set'); process.exit(2); }
let bad = 0;
const check = (ok, msg) => { console.log(ok ? '[wallet] ok  ' : '[wallet] FAIL', msg); if (!ok) bad++; };

// ── memory repo ────────────────────────────────────────────────────────────
const payments = new Map(); const receipts = []; const consoleLog = [];
const repo = {
  async insertPayment(row) { const p = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), process_id: null, receipt_id: null, ...row }; payments.set(p.id, p); return p; },
  async updatePayment(id, patch) { Object.assign(payments.get(id), patch); },
  async markPaid(id, patch) { const p = payments.get(id); if (!p || p.status !== 'created') return null; Object.assign(p, patch); return p; },
  async findByToken(t) { return [...payments.values()].find((p) => p.notify_token === t) || null; },
  async findByProcessId(pid) { const l = [...payments.values()].filter((p) => p.process_id === pid); return l.length === 1 ? l[0] : null; },
  async insertReceipt(row) { const r = { id: randomUUID(), ...row }; receipts.push(r); return r; },
  async setReceiptDocument(id, url, number) { Object.assign(receipts.find((r) => r.id === id), { legal_doc_url: url, legal_doc_number: number }); },
};

const TENANT = randomUUID(); // a made-up business: never a real one
const APP = 'https://kalmea.app'; // Grow wants external https return URLs; the callback URLs it gets point at a token no server knows
const deps = { repo, creds: walletAsCreds(wallet), appUrl: APP, newToken: () => randomBytes(24).toString('hex') };
const wdeps = { repo, creds: wallet, appUrl: APP, userIdFor: async () => null };
const processTokens = new Map(); // the one thing the harness keeps that the app does not: getPaymentProcessInfo wants it, the callback does not

// ── the stand-in page ──────────────────────────────────────────────────────
const clientJs = readFileSync(new URL('../../lib/grow/walletClient.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const page = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>תשלום מאובטח</title></head>
<body style="font-family:sans-serif;background:#FBF8F1;padding:24px"><main data-testid="pay-page" style="max-width:420px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;text-align:center">
<p id="biz">הסטודיו של בדיקה</p><h1 id="amount" data-testid="pay-amount"></h1><p id="desc"></p>
<button id="pay" data-testid="pay-start" style="width:100%;min-height:52px;border:0;border-radius:14px;background:#1F3A30;color:#fff;font-size:18px">לתשלום</button>
<p id="msg" data-testid="pay-msg"></p></main>
<script>${clientJs}
const token = location.pathname.split('/').pop();
preloadGrowSdk(window);
const $ = (i) => document.getElementById(i);
fetch('/api/grow/wallet?t=' + token).then((r) => r.json()).then((j) => { $('amount').textContent = '₪' + j.amount; $('desc').textContent = j.description; if (j.state === 'paid') done(); });
function done() { $('pay').style.display = 'none'; $('msg').textContent = 'התשלום התקבל, תודה!'; $('msg').setAttribute('data-state', 'paid'); }
function poll() { let n = 0; const t = setInterval(async () => { n++; const j = await (await fetch('/api/grow/wallet?t=' + token)).json(); if (j.state === 'paid') { clearInterval(t); done(); } else if (n > 40) { clearInterval(t); $('msg').textContent = 'late'; } }, 1500); }
$('pay').onclick = async () => {
  $('msg').textContent = 'opening';
  const j = await (await fetch('/api/grow/wallet', { method: 'POST', body: JSON.stringify({ t: token }) })).json();
  if (!j.success) { $('msg').textContent = 'ERR ' + (j.error || ''); return; }
  window.__walletEvents = [];
  await openGrowWallet(window, { sdkEnv: j.sdkEnv, authCode: j.authCode, events: {
    onSuccess: (d) => { window.__walletEvents.push('success'); $('msg').textContent = 'confirming'; poll(); },
    onFailure: (m, raw) => { window.__walletEvents.push('failure:' + m + JSON.stringify(raw || null)); $('msg').textContent = 'failure ' + m; },
    onCancel: () => window.__walletEvents.push('cancel'),
    onOpenChange: (o) => window.__walletEvents.push('open:' + o),
  } });
};
</script></body></html>`;

// Grow's wallet needs an https page: a throw-away self-signed certificate for localhost (deleted with the temp folder; the browser here trusts it).
const certDir = `${tmpdir()}/kalmea-wallet-cert`;
if (!existsSync(`${certDir}/c.pem`)) {
  mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${certDir}/k.pem`, '-out', `${certDir}/c.pem`, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
}
const server = https.createServer({ key: readFileSync(`${certDir}/k.pem`), cert: readFileSync(`${certDir}/c.pem`) }, async (req, res) => {
  const u = new URL(req.url, 'https://x');
  const send = (code, body, type = 'application/json', extra = {}) => { res.writeHead(code, { 'content-type': type, ...extra }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (u.pathname.startsWith('/pay/')) {
    const h = Object.fromEntries(securityHeaders({ dev: false, grow: true }).map((x) => [x.key, x.value]));
    return send(200, page, 'text/html; charset=utf-8', h);
  }
  if (u.pathname === '/api/grow/wallet' && req.method === 'GET') {
    const { state, payment } = await walletLinkState(u.searchParams.get('t') || '', { repo });
    return send(payment ? 200 : 404, payment ? { success: true, state, amount: Number(payment.amount), description: payment.description } : { success: false });
  }
  if (u.pathname === '/api/grow/wallet' && req.method === 'POST') {
    let b = ''; for await (const c of req) b += c;
    const r = await startWalletSession(JSON.parse(b || '{}').t || '', wdeps);
    if (r.ok) processTokens.set(r.processId, r.processToken);
    return send(r.ok ? 200 : 409, r.ok ? { success: true, authCode: r.authCode, sdkEnv: r.sdkEnv } : { success: false, error: r.message, state: r.code });
  }
  send(404, 'no');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const LOCAL = `https://localhost:${server.address().port}`;
const local = (url) => url.replace(APP, LOCAL);

// ── driving Grow's wallet ──────────────────────────────────────────────────
async function payWithCard(browser, url, shot) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 }, locale: 'he-IL', ignoreHTTPSErrors: true });
  const pg = await ctx.newPage();
  const csp = []; const errs = [];
  pg.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t.slice(0, 260)); else if (m.type() === 'error') errs.push(t.slice(0, 160)); });
  if (process.env.WALLET_DEBUG) pg.on('response', async (r) => { if (/meshulam|grow/.test(r.url())) console.log('[net]', r.status(), r.request().method(), r.url().slice(0, 110), r.request().method() === 'POST' ? (await r.text().catch(() => '')).slice(0, 200) : ''); });
  await pg.goto(local(url), { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=pay-start]');
  if (out && shot) await pg.screenshot({ path: `${out}/${shot}-1-link.png` });
  await pg.click('[data-testid=pay-start]');
  // the wallet lists the ways to pay (card, Bit, PayBox, bank transfer; Apple Pay / Google Pay on devices that have them): pick the card
  await pg.waitForSelector('#Gr0W8-btn-credit', { state: 'visible', timeout: 40000 }).catch(async (e) => { if (out && shot) await pg.screenshot({ path: `${out}/${shot}-x-nomethods.png` }); console.log('[wallet] events:', await pg.evaluate(() => window.__walletEvents), 'msg:', await pg.textContent('#msg'), 'csp:', csp); throw e; });
  if (out && shot) await pg.screenshot({ path: `${out}/${shot}-2a-wallet-methods.png` });
  await pg.click('#Gr0W8-btn-credit');
  // the card form is drawn in a frame of its own
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    for (const f of pg.frames()) { if (await f.$('#card-number').catch(() => null)) { target = f; break; } }
    if (!target) await pg.waitForTimeout(500);
  }
  if (!target) {
    if (out && shot) await pg.screenshot({ path: `${out}/${shot}-x-nowallet.png` });
    console.log('[wallet] frames:', pg.frames().map((f) => f.url().slice(0, 100)));
    if (process.env.WALLET_DEBUG) console.log((await pg.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => /visa|credit|card|payment/i.test(e.className + e.id + (e.getAttribute('data-type') || '') + (e.getAttribute('alt') || ''))).slice(0, 15).map((e) => e.tagName + '|' + e.id + '|' + e.className + '|' + (e.getAttribute('alt') || '')).join(' ; '))));
    console.log('[wallet] csp messages:', csp, 'events:', await pg.evaluate(() => window.__walletEvents), 'msg:', await pg.textContent('#msg'));
    throw new Error('the card form did not appear');
  }
  if (out && shot) await pg.screenshot({ path: `${out}/${shot}-2-wallet.png` });
  await target.fill('#card-number', '4580458045804580');
  await target.selectOption('#expYear', { index: 5 }).catch(() => {});
  await target.selectOption('#expMonth', { index: 12 }).catch(() => {});
  await target.fill('#personal-id', '000000018').catch(() => {});
  const submit = await target.$('#cg-submit-btn');
  await submit.click();
  await pg.waitForFunction(() => (window.__walletEvents || []).includes('success') || (window.__walletEvents || []).some((e) => e.startsWith('failure')), null, { timeout: 90000 }).catch(() => {});
  const events = await pg.evaluate(() => window.__walletEvents || []);
  if (out && shot) await pg.screenshot({ path: `${out}/${shot}-3-after.png` });
  return { pg, ctx, events, csp, errs };
}

// What a real callback would deliver, from getPaymentProcessInfo (the same fields) + approveTransaction sent to Grow for real.
async function infoOf(processId) {
  const f = new FormData();
  for (const [k, v] of [['apiKey', wallet.apiKey], ['userId', wallet.userIdOverride], ['pageCode', wallet.pageCode], ['processId', processId], ['processToken', processTokens.get(String(processId)) || '']]) f.append(k, v);
  const r = await fetch(`${wallet.apiBase}/getPaymentProcessInfo`, { method: 'POST', body: f });
  return r.json();
}
async function deliverCallback(payment) {
  let info = null;
  for (let i = 0; i < 10; i++) { info = await infoOf(payment.process_id); if (info?.data?.transactions?.[0]?.transactionId) break; await new Promise((r) => setTimeout(r, 1500)); }
  const t = info?.data?.transactions?.[0];
  if (!t) { console.log('[wallet] process info:', JSON.stringify(info).slice(0, 400)); return null; }
  const body = {
    'data[processId]': String(payment.process_id), 'data[transactionId]': String(t.transactionId), 'data[transactionToken]': String(t.transactionToken || ''),
    'data[transactionTypeId]': String(t.transactionTypeId || '1'), 'data[sum]': String(t.sum), 'data[statusCode]': String(t.statusCode || '2'), 'data[asmachta]': String(t.asmachta || ''),
    'data[fullName]': String(t.fullName || ''), 'data[payerPhone]': String(t.payerPhone || ''),
    'data[customFields][cField1]': String(payment.id).replace(/-/g, ''), 'data[customFields][cField2]': tenantRefOf(payment.tenant_id),
  };
  const approve = (n) => approveTransaction(n, walletAsCreds(wallet));
  return { t, result: await applyNotification(body, payment.notify_token, deps, approve) };
}

const browser = await chromium.launch();
const ops = createLiveOps(wallet);
try {
  // ── flow A: cashier ──────────────────────────────────────────────────────
  const a = await createCharge({ tenantId: TENANT, userId: 'unused', amount: 7, description: 'טיפול פנים', clientName: 'בדיקה קלמיה', phone: '0500000000', wallet: true }, deps);
  check(a.ok && new RegExp(`^${APP}/pay/[0-9a-f]{48}$`).test(a.url), `cashier: createCharge({wallet}) gives a Kalmea link (${a.ok ? a.url.replace(/[0-9a-f]{48}/, '<token>') : a.message})`);
  const pa = payments.get(a.paymentId);
  check(pa.process_id === null, 'cashier: Grow has not been asked yet when the link is made');
  const runA = await payWithCard(browser, a.url, 'A-cashier');
  console.log('[wallet] events A:', runA.events.join(','), '| csp:', runA.csp.length, '| page errors:', runA.errs.length);
  check(runA.csp.length === 0, 'cashier: no Content-Security-Policy violation while Grow\'s wallet runs');
  check(runA.events.includes('success'), 'cashier: Grow wallet reported success for the sandbox card');
  check(!!pa.process_id, 'cashier: the process id was saved when the page opened the wallet');
  const cbA = await deliverCallback(pa);
  check(cbA?.result.status === 'paid', `cashier: callback recorded the payment (${cbA?.result.status})`);
  check(receipts.length === 1 && receipts[0].payment_method === 'אשראי' && receipts[0].amount === 7, 'cashier: one receipt, 7 shekel, paid by card');
  const again = await applyNotification({ 'data[processId]': String(pa.process_id), 'data[transactionId]': String(cbA?.t.transactionId), 'data[sum]': '7', 'data[statusCode]': '2' }, pa.notify_token, deps);
  check(again.status === 'already', 'cashier: the same callback twice gives no second receipt');
  const invA = await applyInvoice([{ transactionId: String(cbA?.t.transactionId), processId: String(pa.process_id), invoiceNumber: '4111', invoiceUrl: 'https://meshulam.co.il/s/sample-invoice' }], pa.notify_token, deps);
  check(invA.status === 'stored' && receipts[0].legal_doc_url === 'https://meshulam.co.il/s/sample-invoice', 'cashier: an invoice callback (Grow\'s documented array form, simulated) stores the document link on the receipt');
  const doneA = await runA.pg.waitForSelector('[data-state=paid]', { timeout: 20000 }).then(() => true).catch(() => false);
  check(doneA, 'cashier: the client\'s page turned to "התשלום התקבל" only after our record said paid');
  if (out) await runA.pg.screenshot({ path: `${out}/A-cashier-4-thanks.png` });
  await runA.ctx.close();

  // ── flow B: payment request link ─────────────────────────────────────────
  const desc = requestDescription('full', 'טיפול גבות');
  const b = await createCharge({ tenantId: TENANT, userId: 'unused', amount: 5, description: desc, clientName: 'בדיקה קלמיה', phone: '0500000000', wallet: true }, deps);
  const msg = requestMessageHe({ clientName: 'בדיקה קלמיה', businessName: 'הסטודיו', amount: 5, kind: 'full', url: b.url });
  const wa = requestWaLink('0500000000', msg);
  const inMsg = decodeURIComponent(wa.split('text=')[1]).match(/https:\/\/\S+\/pay\/[0-9a-f]{48}/)?.[0];
  check(wa.startsWith('https://wa.me/972500000000?text=') && inMsg === b.url, 'request: the wa.me message carries the payment link');
  const runB = await payWithCard(browser, inMsg, 'B-request');
  check(runB.csp.length === 0, 'request: no Content-Security-Policy violation');
  check(runB.events.includes('success'), 'request: the link opened from the WhatsApp message paid');
  const pb = payments.get(b.paymentId);
  const cbB = await deliverCallback(pb);
  check(cbB?.result.status === 'paid' && payments.get(b.paymentId).status === 'paid', 'request: status turned paid by the callback');
  const pre = await repo.findByToken(pb.notify_token);
  check(!!pre && (await walletLinkState(pb.notify_token, { repo })).state === 'paid', 'request: the same link shows "paid" and cannot be paid twice');
  const second = await startWalletSession(pb.notify_token, wdeps);
  check(!second.ok && second.code === 'paid', 'request: opening a paid link again gives no new wallet');
  await runB.ctx.close();

  // ── flow C: refund of flow A ─────────────────────────────────────────────
  const paid = payments.get(pa.id);
  check(!!paid.transaction_id && !!paid.transaction_token, 'refund: the transaction id and token from the callback were stored on the payment');
  const rf = paid.transaction_token ? await ops.refund({ userId: wallet.userIdOverride, transactionId: paid.transaction_id, transactionToken: paid.transaction_token, amount: 7, idempotencyKey: pa.id }) : { ok: false, error: 'no tx' };
  check(rf.ok, `refund: Grow accepted the refund of 7 shekel (${rf.ok ? rf.refundId : rf.error + ' ' + (rf.errId ?? '')})`);
  // the other sandbox payment is returned too, so no test money is left over
  const paidB = payments.get(pb.id);
  if (paidB.transaction_token) { const r2 = await ops.refund({ userId: wallet.userIdOverride, transactionId: paidB.transaction_id, transactionToken: paidB.transaction_token, amount: 5, idempotencyKey: pb.id }); console.log('[wallet] second payment refunded:', r2.ok ? 'yes' : `no (${r2.error})`); }
} catch (e) {
  console.error('[wallet] FAIL', e?.stack || e);
  bad++;
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `[wallet] ${bad} FAILED` : '[wallet] all ok');
process.exit(bad ? 1 : 0);
