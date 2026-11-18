// Kalmea's OWN subscription (349/month) through Grow's SANDBOX, end to end, on a NEW smoke business (never the real one). No real money.
//
//   SMOKE_BASE=https://<branch-preview>.vercel.app node --env-file=.env.local scripts/smoke/billing-grow-sandbox.mjs <outDir>
//
// The deployment must run BILLING_MODE=live, BILLING_UI_ENABLED=true, GROW_BILLING_ENV=sandbox and either the GROW_BILLING_* triple or
// GROW_BILLING_SHARE_PLATFORM_KEYS=1 with the GROW_TOKEN_*_TEST triple, and NEXT_PUBLIC_APP_URL = that deployment (Grow posts the card
// token to <APP_URL>/api/billing/grow-notify). .env.local needs the service-role key of the database that deployment uses.
//
// The first charge runs through the card-save path, NOT the daily cron: the business is put on hold (plan_status expired) before she adds
// her card, so saveCard() charges at once (lib/billing/service.ts). The cron is never called here because a preview shares the database
// with production and runDue() would walk every subscription in it with sandbox keys.
//
// Steps: onboard -> hold -> billing screen -> consent tick -> Grow's hosted token page -> Grow's published test card -> Grow calls
// grow-notify -> card stored sealed + first charge -> the payment row (amount, Grow transaction, receipt number and link) -> the history in
// the billing screen. Writes <outDir>/result.json and screenshots. Removes the smoke business at the end unless KEEP=1.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: billing-grow-sandbox.mjs <outDir>'); process.exit(2); }
if (!/^https:\/\//.test(BASE)) { console.error('[bill-sb] SMOKE_BASE must be a public https deployment: Grow has to reach grow-notify'); process.exit(2); }
mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[bill-sb]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[bill-sb] FAIL', msg); } };
const result = { base: BASE };
const db = admin();

async function waitFor(what, fn, seconds = 120) {
  for (let i = 0; i < seconds / 2; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 2000)); }
  log(`gave up waiting for ${what} after ${seconds}s`);
  return null;
}

// Grow's published sandbox test card (the same one the client token flow was reviewed with).
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
  await pg.screenshot({ path: `${out}/2-grow-page.png` }).catch(() => {});
  await fr.click('#cg-submit-btn');
  await pg.waitForURL((u) => !/meshulam|creditguard|grow/.test(u.hostname), { timeout: 90000 }).catch(() => {});
  await pg.waitForTimeout(3000);
}

const email = newEmail('billsb');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
result.tenantId = tenantId;
log('account', email, 'tenant', tenantId, 'base', BASE);

const { browser, page, problems } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel, p = page) => p.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const openBilling = async () => {
  await visible('button[aria-label="הגדרות"]').click(); await page.waitForTimeout(900);
  await page.locator('.sheet button:text-is("העסק שלי"), [role=dialog] button:text-is("העסק שלי")').filter({ visible: true }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="billing-card"]').scrollIntoViewIfNeeded();
};
const phone = '05000' + String(Math.floor(10000 + Math.random() * 89999));

try {
  // A remote deployment hydrates later than a local server: typing before that is wiped (2026-11-18).
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  // A 13-digit number in the name marks it as a test run: no "new signup" alert reaches the operator (lib/ownerContact.ts looksLikeTestName).
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', `בדיקת מנוי ${Date.now()}`);
  await page.fill('input[placeholder="השם שלך"]', 'בודקת מנוי');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', phone);
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(600);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.locator('button:has-text("לא עכשיו"), button:has-text("סיום ופתיחת היומן")').first().click();
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await page.waitForTimeout(1500); await skipTour();
  log('onboarded');

  const st = await page.evaluate(async () => { const r = await fetch('/api/billing/status'); return { code: r.status, json: await r.json().catch(() => null) }; });
  result.status = st.json;
  check(st.code === 200 && st.json?.mode === 'live', `billing runs in live mode on this deployment (${JSON.stringify(st.json)?.slice(0, 200)})`);

  // On hold: adding a card is paying to get back in, so the first charge runs at once.
  await db.from('tenants').update({ plan_status: 'expired', trial_ends_at: new Date(Date.now() - 86400000).toISOString(), plan_price: 349 }).eq('id', tenantId);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000); await skipTour();
  const cta = visible('[data-testid="billing-cta"]');
  // The on-hold screen carries the billing card itself; otherwise the banner or settings lead to it.
  await page.locator('[data-testid="billing-card"], button[aria-label="הגדרות"]').filter({ visible: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
  if (!(await page.locator('[data-testid="billing-card"]').filter({ visible: true }).count())) { if (await cta.count()) await cta.click(); else await openBilling(); }
  await page.locator('[data-testid="billing-card"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/1-billing-screen.png` }).catch(() => {});
  const consent = page.locator('[data-testid="billing-consent"]').filter({ visible: true }).first();
  if (await consent.count()) { const tag = await consent.evaluate((e) => e.tagName); if (tag === 'INPUT') await consent.check(); else await consent.click(); }
  await page.waitForTimeout(400);
  await visible('[data-testid="billing-card"] button:text-matches("הוספת כרטיס|עדכון כרטיס|חידוש המנוי|תשלום")').click();
  await page.waitForURL((u) => /meshulam|grow/.test(u.hostname), { timeout: 30000 });
  result.cardPageHost = new URL(page.url()).hostname;
  check(/sandbox/.test(page.url()), `the card page is Grow's SANDBOX (${result.cardPageHost})`);
  await typeSandboxCard(page);
  result.returnedTo = page.url().replace(/[?#].*$/, '');

  const sub = await waitFor('the saved card', async () => {
    const { data } = await db.from('billing_subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
    return data?.token_ref ? data : null;
  });
  check(!!sub, 'Grow called grow-notify and the card token was stored');
  if (sub) {
    check(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(sub.token_ref), 'the token is stored sealed, not in plain text');
    result.subscription = { status: sub.status, price: sub.price, card_last4: sub.card_last4, card_brand: sub.card_brand, next_charge_at: sub.next_charge_at };
  }
  const pay = await waitFor('the first charge', async () => {
    const { data } = await db.from('billing_payments').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true });
    return (data || []).find((p) => p.status !== 'pending') || null;
  }, 60);
  const { data: allPays } = await db.from('billing_payments').select('*').eq('tenant_id', tenantId);
  result.payments = (allPays || []).map((p) => ({ status: p.status, amount: p.amount, provider_payment_id: p.provider_payment_id, unique_identifier: p.unique_identifier, invoice_status: p.invoice_status, invoice_number: p.invoice_number, invoice_url: p.invoice_url, error: p.error || p.failure_reason || null, period_start: p.period_start, period_end: p.period_end }));
  check(pay?.status === 'succeeded' && Number(pay.amount) === 349, `the first charge of 349 succeeded on Grow's sandbox (${pay?.status} ${pay?.amount})`);
  check(!!pay?.provider_payment_id, `Grow's transaction id is stored (${pay?.provider_payment_id})`);
  log('receipt from Grow:', pay?.invoice_number || '(no number in the answer)', pay?.invoice_url || '(no link in the answer)');
  const { data: t } = await db.from('tenants').select('plan_status').eq('id', tenantId).single();
  result.planStatusAfter = t?.plan_status;
  check(t?.plan_status === 'active', `the business is active again (${t?.plan_status})`);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1800); await skipTour();
  await openBilling();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/3-billing-after.png`, fullPage: false }).catch(() => {});
  result.billingCardText = (await page.locator('[data-testid="billing-card"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
} catch (e) {
  fails.push(`threw: ${e.message}`);
  console.error('[bill-sb] threw', e);
  await page.screenshot({ path: `${out}/error.png` }).catch(() => {});
} finally {
  result.problems = problems.slice(0, 20);
  result.fails = fails;
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  await browser.close();
  if (process.env.KEEP !== '1') { const left = await purgeTenant(tenantId, userId); log('smoke business removed', left.length ? left.join('; ') : 'ok'); }
  log(fails.length ? `${fails.length} FAILED` : 'all passed');
  process.exit(fails.length ? 1 : 0);
}
