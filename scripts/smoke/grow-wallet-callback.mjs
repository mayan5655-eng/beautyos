// A wallet payment end to end against Grow's SANDBOX, with Grow's REAL server callback (no getPaymentProcessInfo anywhere), for Grow's review
// of approveTransaction. Sandbox card, no real money, a NEW smoke business only, removed at the end.
//
//   SMOKE_BASE=https://<branch-preview>.vercel.app node --env-file=.env.local scripts/smoke/grow-wallet-callback.mjs <outDir>
//
// The charge and the /pay page run on SMOKE_BASE; Grow calls back the app's public URL (notifyUrl and the account webhook), which is why the
// fix has to be on production too. Writes <outDir>/wallet-ids.json and a 430px screen recording. Refunds the payment, then purges the business.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: grow-wallet-callback.mjs <outDir>'); process.exit(2); }
if (!/^https:\/\//.test(BASE)) { console.error('[wallet-cb] SMOKE_BASE must be a public https deployment'); process.exit(2); }
mkdirSync(`${out}/video`, { recursive: true });
const log = (...a) => console.log('[wallet-cb]', ...a);
const db = admin();
const PHONE = '0500000000'; // a test number: never a real client's
const ids = { growSandboxUserId: process.env.GROW_TOKEN_USER_ID_TEST, payerPhone: PHONE };

const email = newEmail('walletcb');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const tenantId = await tenantIdOf(created.user.id);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId, 'base', BASE);

let failed = false;
const { browser, page } = await launch();
try {
  // networkidle: on a deployed preview the form must be hydrated before submit. Login + onboarding as scripts/smoke/grow-token-callback.mjs.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקת ארנק');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', PHONE);
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(600);
  const svcRows = page.locator('button:has-text("דקות")').filter({ visible: true });
  for (let i = 0; i < 2; i++) { await svcRows.nth(i).click(); await page.waitForTimeout(200); }
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  const acc = await db.from('grow_accounts').insert({ tenant_id: tenantId, user_id: process.env.GROW_TOKEN_USER_ID_TEST, enabled: true });
  if (acc.error) throw acc.error;

  const charge = await page.evaluate(async (b) => {
    const r = await fetch('/api/grow/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }, { amount: 10, description: 'טיפול בדיקה', clientName: 'לקוחה בדיקה', phone: PHONE });
  log('charge', charge.status, charge.json.success, charge.json.code || '');
  if (!charge.json.success) throw new Error(`charge failed: ${charge.json.error}`);
  const paymentId = charge.json.paymentId;
  const payUrl = `${BASE}${new URL(charge.json.url).pathname}`;

  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL', recordVideo: { dir: `${out}/video`, size: { width: 430, height: 932 } } });
  const pay = await ctx.newPage();
  await pay.goto(payUrl, { waitUntil: 'domcontentloaded' });
  await pay.waitForSelector('[data-testid=pay-start]', { timeout: 45000 });
  await pay.locator('[data-testid=pay-terms] input').check();
  await pay.click('[data-testid=pay-start]');
  await pay.waitForSelector('#Gr0W8-btn-credit', { state: 'visible', timeout: 45000 });
  await pay.click('#Gr0W8-btn-credit');
  let fr = null;
  for (let i = 0; i < 80 && !fr; i++) { for (const f of pay.frames()) if (await f.$('#card-number').catch(() => null)) { fr = f; break; } if (!fr) await pay.waitForTimeout(500); }
  if (!fr) throw new Error('Grow card form did not appear');
  await pay.waitForTimeout(1200);
  await fr.fill('#card-number', '4580458045804580');
  await fr.selectOption('#expYear', { index: 5 }).catch(() => {});
  await fr.selectOption('#expMonth', { index: 12 }).catch(() => {});
  await fr.fill('#personal-id', '000000018').catch(() => {});
  await pay.waitForTimeout(800);
  await fr.click('#cg-submit-btn');

  // Written by Grow's callback to the app; this script only waits for it.
  let row = null;
  for (let i = 0; i < 60 && !row; i++) {
    const { data } = await db.from('grow_payments').select('id, status, transaction_id, asmachta, process_id, amount, paid_at').eq('id', paymentId).maybeSingle();
    if (data?.status === 'paid') row = data; else await new Promise((r) => setTimeout(r, 2000));
  }
  await pay.waitForTimeout(2500);
  await pay.screenshot({ path: `${out}/wallet-paid.png` });
  await ctx.close();
  if (!row) throw new Error('the payment never became paid: no callback arrived');
  Object.assign(ids, { transactionId: row.transaction_id, asmachta: row.asmachta, processId: row.process_id, amount: row.amount, paidAt: row.paid_at });
  log('paid', JSON.stringify(ids));

  const refund = await page.evaluate(async (paymentId) => {
    const r = await fetch('/api/grow/refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId }) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }, paymentId);
  ids.refunded = !!refund.json.success;
  log('refund', refund.status, JSON.stringify(refund.json).slice(0, 160));
} catch (e) {
  failed = true;
  console.error('[wallet-cb] ERROR', e?.message || e);
  await page.screenshot({ path: `${out}/wallet-error.png` }).catch(() => {});
} finally {
  writeFileSync(`${out}/wallet-ids.json`, JSON.stringify(ids, null, 2));
  await browser.close().catch(() => {});
  log('purged', email, await purgeTenant(tenantId, created.user.id));
}
process.exit(failed ? 1 : 0);
