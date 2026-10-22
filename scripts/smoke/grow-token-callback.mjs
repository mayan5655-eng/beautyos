// Grow's token review, run again the way Grow asked: the card token comes ONLY from Grow's server-to-server callback to our webhook.
// getPaymentProcessInfo is never called (not by this script, not by the app). Sandbox card, no real money, a NEW smoke business only.
//
//   SMOKE_BASE=https://<branch-preview>.vercel.app node --env-file=.env.local scripts/smoke/grow-token-callback.mjs <outDir>
//
// SMOKE_BASE must be a PUBLIC deployment that Grow's sandbox can call back (a Vercel preview with Deployment Protection off for
// /api/grow/*, or production), running with GROW_UI_ENABLED=true, GROW_MODE=live, GROW_ENV unset (sandbox) and the GROW_TOKEN_*_TEST triple.
// .env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the database that deployment uses.
//
//   1  save only        public booking page: the required card-save tick (booking refused without it) -> Grow's hosted token page
//                       (chargeType 3) -> Grow calls /api/grow/webhook -> the app stores the sealed token and sends approveTransaction.
//                       This script only WAITS for the token row the webhook writes.
//   2  token charge     the owner cancels inside the window and taps "charge": createTransactionWithToken with transactionUniqueIdentifier
//                       ONLY (no transactionGroupIdentifier).
//   3  charge and save  deposit mode: the deposit is paid on Grow's page with saveCardToken=1 -> Grow calls /api/grow/notify -> paid + token.
// Writes <outDir>/ids.json with the transaction ids for Grow, and a 430px screen recording of every client-side step in <outDir>/video.
// Clean up afterwards with `node --env-file=.env.local scripts/smoke/admin-tools.mjs purge-smoke`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: grow-token-callback.mjs <outDir>'); process.exit(2); }
if (!/^https:\/\//.test(BASE)) { console.error('[token-cb] SMOKE_BASE must be a public https deployment: Grow has to reach its webhook'); process.exit(2); }
mkdirSync(`${out}/video`, { recursive: true });
const log = (...a) => console.log('[token-cb]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[token-cb] FAIL', msg); } };
const ids = {};
const db = admin();
const VIDEO = { dir: `${out}/video`, size: { width: 430, height: 932 } };
const newPhone = () => '05000' + String(Math.floor(10000 + Math.random() * 89999));

// Polls the database for what the webhook wrote. Nothing here asks Grow anything.
async function waitFor(what, fn, seconds = 120) {
  for (let i = 0; i < seconds / 2; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 2000)); }
  log(`gave up waiting for ${what} after ${seconds}s`);
  return null;
}

async function typeSandboxCard(pg) {
  let fr = null;
  for (let i = 0; i < 80 && !fr; i++) { for (const f of pg.frames()) if (await f.$('#card-number').catch(() => null)) { fr = f; break; } if (!fr) await pg.waitForTimeout(500); }
  if (!fr) throw new Error('Grow card form did not appear');
  await pg.waitForTimeout(1200);
  await fr.type('#card-number', '4580458045804580', { delay: 70 });
  await fr.selectOption('#expYear', { index: 5 }).catch(() => {});
  await fr.selectOption('#expMonth', { index: 12 }).catch(() => {});
  await fr.type('#personal-id', '000000018', { delay: 70 }).catch(() => {});
  await pg.waitForTimeout(1500);
  await fr.click('#cg-submit-btn');
  await pg.waitForURL((u) => !/meshulam|creditguard|grow/.test(u.hostname), { timeout: 90000 }).catch(() => {});
  await pg.waitForTimeout(3000);
}

const email = newEmail('tokencb');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const tenantId = await tenantIdOf(created.user.id);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId, 'base', BASE);

const { browser, page } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel, p = page) => p.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const home = async () => { await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1800); await skipTour(); };

// The public booking page in a recorded context. Shows that booking is refused until the card-save tick is ticked, then ticks it.
async function bookAndOpenGrow(label, time) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL', recordVideo: VIDEO });
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/book?t=${tenantId}`, { waitUntil: 'domcontentloaded' }); await pub.waitForTimeout(3500);
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).nth(1).click(); await pub.waitForTimeout(1200);
  await pub.locator('.bk-chip[aria-label^="יום שני"]').first().click(); await pub.waitForTimeout(2000);
  await pub.getByText(time, { exact: true }).first().click(); await pub.waitForTimeout(800);
  await pub.locator('button:has-text("המשיכי")').first().click(); await pub.waitForTimeout(1200);
  await pub.fill('input[placeholder="שם מלא"]', 'לקוחה לבדיקה'); await pub.fill('input[type=tel]', newPhone());
  await pub.locator('input[aria-label="אישור שמירת הפרטים"]').check().catch(() => {});
  await pub.locator('input[aria-label="אישור מדיניות הביטולים"]').check(); await pub.waitForTimeout(1200);
  const cardBox = pub.locator('[data-testid="grow-card-consent"]');
  await cardBox.scrollIntoViewIfNeeded(); await pub.waitForTimeout(1500);
  check((await cardBox.count()) === 1 && (await cardBox.innerText()).includes('לחייב אותו בעתיד'), `${label}: the card-save and future-charge tick is shown before the card page`);
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click(); await pub.waitForTimeout(2500);
  check((await body(pub)).includes('לאשר את שמירת פרטי האשראי') && !/התור נקבע|התור שמור עבורך/.test(await body(pub)), `${label}: booking is refused while the card-save tick is empty`);
  await pub.screenshot({ path: `${out}/${label}-refused.png` });
  await pub.locator('input[aria-label="אישור שמירת פרטי כרטיס האשראי"]').check(); await pub.waitForTimeout(1500);
  await pub.screenshot({ path: `${out}/${label}-ticked.png` });
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click(); await pub.waitForSelector('[data-testid="grow-step"] button', { timeout: 45000 }).catch(() => {}); await pub.waitForTimeout(1000);
  await pub.screenshot({ path: `${out}/${label}-after-book.png` }); if (!(await pub.locator('[data-testid="grow-step"] button').count())) log('booking page after submit:', (await body(pub)).slice(0, 500));
  check(await pub.locator('[data-testid="grow-step"] button').count() === 1, `${label}: the booking page offers Grow's secure card page`);
  await pub.waitForTimeout(1500);
  await pub.locator('[data-testid="grow-step"] button').click();
  await typeSandboxCard(pub);
  await pub.screenshot({ path: `${out}/${label}-returned.png` });
  const video = await pub.video().path();
  await ctx.close();
  return video;
}

try {
  // login + onboarding (as scripts/smoke/grow-cancel.mjs)
  // networkidle: on a deployed preview the form must be hydrated before submit, or the sign-in request is rejected with a 400.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקת טוקן');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(600);
  const svcRows = page.locator('button:has-text("דקות")').filter({ visible: true });
  for (let i = 0; i < 2; i++) { await svcRows.nth(i).click(); await page.waitForTimeout(200); }
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  // In the sandbox every call goes to Grow's one test business. The token session swaps in GROW_TOKEN_USER_ID_TEST itself, but the deposit page (charge and save) sends grow_accounts.user_id as is, so the row carries the real sandbox userId.
  await db.from('grow_accounts').insert({ tenant_id: tenantId, user_id: process.env.GROW_TOKEN_USER_ID_TEST || 'sandbox-test-business', enabled: true });
  await db.from('service_prices').update({ price: 20 }).eq('tenant_id', tenantId);

  // ── 1. save only ──
  await db.from('grow_cancel_policies').upsert({ tenant_id: tenantId, policy: { mode: 'saved_card', windowHours: 24, lateFee: { type: 'fixed', value: 5 }, noShowFee: { type: 'fixed', value: 5 }, text: '' } }, { onConflict: 'tenant_id' });
  ids.videoSaveOnly = await bookAndOpenGrow('1-save-only', '10:00');
  const { data: appt1 } = await db.from('appointments').select('*').eq('tenant_id', tenantId).single();
  const cc1 = await waitFor('the webhook to store the token', async () => {
    const { data } = await db.from('grow_card_consents').select('*').eq('appointment_id', String(appt1.id)).maybeSingle();
    return data?.status === 'saved' ? data : null;
  });
  check(!!cc1, '1 save only: Grow\'s callback reached /api/grow/webhook and the app stored the token (no getPaymentProcessInfo)');
  const { data: tok1 } = await db.from('grow_card_tokens').select('id, card_last4, token_encrypted').eq('appointment_id', String(appt1.id));
  check(tok1?.length === 1 && tok1[0].token_encrypted === true, `1 one sealed token row (last4 ${tok1?.[0]?.card_last4})`);
  ids.saveOnlyProcessId = cc1?.process_id || null;

  // ── 2. charge the saved token: she cancels 3 hours before, inside the 24-hour window, and taps "charge" ──
  const il = new Date(Date.now() + 3 * 3600000).toLocaleString('en-CA', { timeZone: 'Asia/Jerusalem', hour12: false }).replace(',', '');
  const [d, hhmm] = il.split(' ');
  const mins = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  await db.from('appointments').update({ date: d, start_minute: mins, hour: Math.floor(mins / 60), confirmation_status: 'cancelled' }).eq('id', appt1.id);
  await home();
  const api = (path, b) => page.evaluate(async ([p, x]) => { const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(x) }); return { code: r.status, json: await r.json().catch(() => null) }; }, [path, b]);
  const det = await api('/api/grow/fees/detect', { appointmentId: String(appt1.id), event: 'cancel' });
  check(det.json?.status === 'pending' || det.json?.result?.status === 'pending', `2 a late-cancel fee waits for her tap (${JSON.stringify(det.json).slice(0, 80)})`);
  const { data: fee } = await db.from('cancellation_fee_items').select('*').eq('tenant_id', tenantId).single();
  const dec = await api('/api/grow/fees/decide', { feeId: fee.id, decision: 'charge' });
  check(dec.json?.success === true && dec.json?.status === 'charged', `2 token charge: ${JSON.stringify(dec.json).slice(0, 120)}`);
  const { data: led } = await db.from('grow_token_charges').select('*').eq('tenant_id', tenantId);
  log('ledger:', JSON.stringify(led?.map((r) => ({ unique_identifier: r.unique_identifier, status: r.status, transaction_id: r.transaction_id }))));
  ids.tokenCharge = led?.[0]?.transaction_id || null;
  ids.tokenChargeUniqueIdentifier = led?.[0]?.unique_identifier || null;

  // ── 3. charge and save: a deposit paid on Grow's page keeps the card ──
  await db.from('grow_cancel_policies').upsert({ tenant_id: tenantId, policy: { mode: 'deposit', windowHours: 24, deposit: { type: 'fixed', value: 10 }, lateFee: { type: 'percent', value: 50 }, noShowFee: { type: 'percent', value: 100 }, timelyCancel: 'refund', text: '' } }, { onConflict: 'tenant_id' });
  await db.from('service_prices').update({ requires_deposit: true }).eq('tenant_id', tenantId);
  ids.videoChargeAndSave = await bookAndOpenGrow('3-charge-and-save', '11:00');
  const { data: appt3 } = await db.from('appointments').select('*').eq('tenant_id', tenantId).neq('id', appt1.id).single();
  const dep = await waitFor('the deposit callback', async () => {
    const { data } = await db.from('grow_payments').select('*').eq('tenant_id', tenantId).eq('appointment_id', String(appt3.id)).eq('kind', 'deposit').maybeSingle();
    return data?.status === 'paid' ? data : null;
  });
  check(!!dep, '3 charge and save: Grow\'s callback marked the deposit paid');
  const tok3 = await waitFor('the deposit token', async () => {
    const { data } = await db.from('grow_card_tokens').select('id, card_last4').eq('appointment_id', String(appt3.id));
    return data?.length ? data : null;
  }, 30);
  check(!!tok3, '3 charge and save: the card token came from that same callback');
  ids.chargeAndSave = dep?.transaction_id || null;
} catch (e) {
  fails.push('script error: ' + e.message); await page.screenshot({ path: `${out}/error.png` }).catch(() => {}); console.error((await body().catch(() => '')).slice(0, 600)); console.error('[token-cb] ERROR', e.message);
} finally {
  await browser.close();
}
writeFileSync(`${out}/ids.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, tenantId, ...ids }, null, 2));
log('ids:', JSON.stringify(ids));
console.log(fails.length ? `\n[token-cb] ${fails.length} failure(s)` : '\n[token-cb] all ok');
process.exit(fails.length ? 1 : 0);
