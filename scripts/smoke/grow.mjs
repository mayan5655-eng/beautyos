// Grow in MOCK mode, in a real browser, on a NEW smoke tenant (never the real one):
//   tables exist + are closed to the browser roles -> "I don't have Grow yet" form -> shows in the admin list -> connect with TESTUSER1
//   -> charge 250 from the cashier -> press "paid" on the mock page -> payment paid, receipt on the client card, in the cashier history and in the
//   revenue report -> 3 phone-width screenshots.
// node --env-file=.env.local scripts/smoke/grow.mjs <outDir>
// The local server must run with GROW_UI_ENABLED=true GROW_MODE=mock and the messaging keys blanked. Clean up afterwards with `admin-tools.mjs purge-smoke`.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) throw new Error('output folder needed');
const log = (...a) => console.log('[grow]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[grow] FAIL', msg); } };
const NOISE = [/Invalid Sentry Dsn/i, /get_public_services/];

const db = admin();
const email = newEmail('grow');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId);

// ── 1. the tables, as the browser roles see them ──
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for (const t of ['grow_accounts', 'grow_payments', 'grow_signup_requests']) {
  const svc = await db.from(t).select('*', { count: 'exact', head: true });
  check(!svc.error, `${t} exists (service role can read it)`);
  const anon = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  const rows = await anon.json().catch(() => null);
  check(!anon.ok || (Array.isArray(rows) && rows.length === 0), `${t}: the anonymous browser role reads nothing (status ${anon.status})`);
}
const sess = createClient(url, anonKey, { auth: { persistSession: false } });
await sess.auth.signInWithPassword({ email, password: PASSWORD });
const probe = await sess.from('grow_signup_requests').select('tenant_id').limit(1);
check(!!probe.error || (probe.data || []).length === 0, 'grow_signup_requests: a signed-in browser role cannot read it');
const wr = await sess.from('grow_payments').insert({ tenant_id: tenantId, amount: 1, notify_token: 'x'.repeat(24) });
check(!!wr.error, 'grow_payments: a signed-in browser role cannot write it');

const { browser, ctx, page, problems } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel, p = page) => p.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const shot = (name) => page.screenshot({ path: path.join(outDir, name) });
const openGrowCard = async () => {
  await visible('button[aria-label="הגדרות"]').click(); await page.waitForTimeout(900);
  await page.locator('.sheet button:text-is("חיבורים"), [role=dialog] button:text-is("חיבורים")').filter({ visible: true }).first().click(); await page.waitForTimeout(1200);
  await page.locator('[data-testid="grow-card"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
};

try {
  // login + onboarding
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת גרואו (בדיקה)');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(600);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("לא עכשיו")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await page.waitForTimeout(1500); await skipTour();
  log('onboarded');
  // seed AFTER onboarding (a tenant with data already counts as onboarded): a client, today's appointment and a 250 service
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const { data: cl } = await db.from('clients').insert({ tenant_id: tenantId, name: 'דנה גרואו', phone: '+972500000077', status: 'active' }).select('id').single();
  await db.from('service_prices').insert({ tenant_id: tenantId, name: 'טיפול בדיקה', price: 250, duration: 60, active: true });
  await db.from('appointments').insert({ tenant_id: tenantId, name: 'דנה גרואו', client_phone: '+972500000077', client_id: cl.id, service: 'טיפול בדיקה', date: today, start_minute: 600, hour: 10, duration: 60, price: 250, color: '#E9A9A1', confirmation_status: 'confirmed' });

  // ── 2. "I don't have Grow yet" ──
  await openGrowCard();
  check(await page.locator('[data-testid="grow-mock"]').count() === 1, 'the card says it is a test run (mock mode)');
  await visible('button:has-text("אין לי עדיין Grow")').click(); await page.waitForTimeout(400);
  await page.fill('input[aria-label="שם מלא"]', 'בודקת גרואו');
  await page.fill('input[aria-label="נייד"]', '0500000077');
  await page.fill('input[aria-label="שם העסק"]', 'קליניקת גרואו');
  await page.fill('input[aria-label="מספר עוסק או ח.פ."]', '123456789');
  await visible('button:has-text("שליחת הפרטים")').click(); await page.waitForTimeout(1800);
  const { data: rq } = await db.from('grow_signup_requests').select('*').eq('tenant_id', tenantId);
  check(rq?.length === 1 && rq[0].business_id === '123456789' && rq[0].name === 'בודקת גרואו', 'the request was stored for this business');
  await page.locator('[data-testid="grow-card"]:has-text("קיבלנו את הפרטים")').waitFor({ timeout: 8000 }).catch(() => {});
  check((await page.locator('[data-testid="grow-card"]').innerText()).includes('קיבלנו את הפרטים'), 'the card confirms "we got your details"');

  // it shows in the admin list: this throwaway user is made a platform admin for a minute (the row also disappears with the user)
  await db.from('platform_admins').insert({ user_id: userId });
  const adm = await ctx.newPage();
  await adm.goto(`${BASE}/dashboard/admin`, { waitUntil: 'domcontentloaded' }); await adm.waitForTimeout(3500);
  const at = await body(adm);
  check(at.includes('בקשות לפתיחת חשבון Grow') && at.includes('קליניקת גרואו') && at.includes('123456789'), 'the request shows in the admin list');
  await db.from('platform_admins').delete().eq('user_id', userId);
  await adm.close();

  // ── connect ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1200); await skipTour();
  await openGrowCard();
  await page.fill('input[aria-label="מזהה עסק ב-Grow"]', 'TESTUSER1');
  await visible('[data-testid="grow-card"] button:text-is("חיבור")').click(); await page.waitForTimeout(2500);
  const { data: acct } = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', tenantId).maybeSingle();
  check(acct?.user_id === 'TESTUSER1' && acct.enabled === true, 'connected with TESTUSER1');
  check((await body()).includes('חיוב בכרטיס אשראי מהקופה'), 'the card shows the connected state');
  await shot('kalmea-grow-1-settings.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // ── 3. charge 250 from the cashier ──
  await visible('button[aria-label="תשלום"]').click(); await page.waitForTimeout(800);
  await visible('button:has-text("תשלום חדש")').click(); await page.waitForTimeout(1000);
  const sel = page.locator('.sheet select, [role=dialog] select').filter({ visible: true }).first();
  const opts = await sel.locator('option').allInnerTexts();
  const idx = opts.findIndex((o) => o.includes('טיפול בדיקה'));
  check(idx > 0, 'the 250 test service is in the cashier menu');
  await sel.selectOption({ index: idx }); await page.waitForTimeout(500);
  const search = visible('input[placeholder="חיפוש לקוחה..."]');
  await search.fill('גרואו'); await page.waitForTimeout(700);
  await page.getByText('דנה גרואו').filter({ visible: true }).last().click().catch(() => {}); await page.waitForTimeout(500);
  check(await page.locator('[data-testid="grow-charge"]').count() === 1, 'the cashier offers "charge by card (Grow)" for a connected business');
  await visible('[data-testid="grow-charge"] button:has-text("חיוב בכרטיס אשראי")').click(); await page.waitForTimeout(2500);
  check((await body()).includes('דף התשלום מוכן'), 'a payment page was created');
  check(await page.locator('[data-testid="grow-charge"] img[alt^="קוד QR"]').count() === 1, 'a QR code is shown');
  const wa = await page.locator('[data-testid="grow-charge"] a:has-text("שליחה בוואטסאפ")').getAttribute('href');
  check(!!wa && wa.startsWith('https://wa.me/97250000'), 'a WhatsApp link with the payment page is offered');
  await page.locator('[data-testid="grow-charge"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  await shot('kalmea-grow-2-charge.png');
  const link = await page.locator('[data-testid="grow-charge"] a:has-text("פתיחת דף התשלום")').getAttribute('href');
  const { data: pending } = await db.from('grow_payments').select('*').eq('tenant_id', tenantId);
  check(pending?.length === 1 && pending[0].status === 'created' && Number(pending[0].amount) === 250, 'one payment row: created, 250');
  check((await db.from('receipts').select('id').eq('tenant_id', tenantId)).data?.length === 0, 'no receipt before the client pays');

  // ── the mock payment page: press "paid" ──
  const pay = await ctx.newPage();
  await pay.goto(link, { waitUntil: 'domcontentloaded' });
  check((await body(pay)).includes('לא נגבה כסף'), 'the mock page says nobody is charged');
  await pay.locator('button:has-text("דמה תשלום מוצלח")').click(); await pay.waitForTimeout(3000);
  check((await body(pay)).includes('התשלום התקבל'), 'the mock page confirms the payment');
  await pay.close();

  const { data: paid } = await db.from('grow_payments').select('*').eq('tenant_id', tenantId);
  check(paid?.[0]?.status === 'paid' && !!paid[0].transaction_id && !!paid[0].invoice_url, 'the payment is paid, with a transaction id and a Grow receipt link');
  const { data: rcs } = await db.from('receipts').select('*').eq('tenant_id', tenantId);
  check(rcs?.length === 1 && Number(rcs[0].amount) === 250 && rcs[0].payment_method === 'אשראי' && rcs[0].legal_provider === 'grow' && rcs[0].client_id === String(cl.id) && !!rcs[0].legal_doc_url, 'one receipt: 250, card, Grow-issued, linked to the client, with the document link');
  await page.waitForTimeout(5000);
  check((await body()).includes('התשלום התקבל'), 'the cashier panel noticed the payment (it polls)');

  // ── receipt on the client card, cashier history, revenue report ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="לקוחות"]', { timeout: 60000 }); await page.waitForTimeout(1200); await skipTour();
  await visible('button[aria-label="לקוחות"]').click(); await page.waitForTimeout(1200);
  await page.getByText('דנה גרואו').filter({ visible: true }).first().click(); await page.waitForTimeout(1000);
  await visible('button:has-text("תשלומים")').click(); await page.waitForTimeout(800);
  check(await page.locator('[data-testid="grow-receipt-link"]').filter({ visible: true }).count() >= 1, 'the Grow receipt link is on the client card');
  await shot('kalmea-grow-3-receipt.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await visible('button[aria-label="תשלום"]').click(); await page.waitForTimeout(1200);
  check(await page.locator('[data-testid="grow-receipt-link"]').filter({ visible: true }).count() >= 1, 'the Grow receipt link is in the cashier history');
  await visible('button:has-text("סיכום הכנסות")').click(); await page.waitForTimeout(1500);
  const rep = await body();
  check(rep.includes('₪250') && rep.includes('מספר עסקאות 1'), 'the revenue report counts the Grow payment (₪250, 1 transaction)');
  if (!(rep.includes('₪250') && rep.includes('מספר עסקאות 1'))) console.error('[grow] report text:', rep.slice(0, 900));
  await page.keyboard.press('Escape');

  const real = [...new Set(problems.filter((p) => !NOISE.some((n) => n.test(p))))];
  check(real.length === 0, 'no console errors, page errors or 5xx responses' + (real.length ? ': ' + real.slice(0, 6).join(' | ') : ''));
} catch (e) {
  fails.push('script error: ' + e.message); console.error('[grow] ERROR', e.message);
  await page.screenshot({ path: path.join(outDir, 'kalmea-grow-ERROR.png') }).catch(() => {});
  console.error('[grow] card text:', await page.locator('[data-testid="grow-card"]').innerText().catch(() => '(no card)'));
} finally {
  await browser.close();
}
console.log(fails.length ? `\n[grow] ${fails.length} failure(s)` : '\n[grow] all ok');
process.exit(fails.length ? 1 : 0);
