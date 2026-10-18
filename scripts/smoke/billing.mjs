// Kalmea billing in MOCK mode, in a real browser, on a NEW smoke tenant (never the real one).
//   Part A (always): the screen degrades honestly while add_kalmea_billing.sql has not been run, the routes answer, the cron is protected.
//   Part B (only when the migration has been run): invitation banner 5 days before the trial ends -> add a card on the mock hosted page ->
//     the cron charges before the trial ends -> active + invoice in the history -> a refused card -> past due banner -> grace over -> blocked ->
//     the billing screen is still reachable and a good card unblocks at once -> cancel -> the owner marks a payment manually in the admin list.
// node --env-file=.env.local scripts/smoke/billing.mjs
// The local server must run with BILLING_UI_ENABLED=true BILLING_MODE=mock VERCEL_ENV=development CRON_SECRET=local-smoke-only and the messaging keys blanked.
// Clean up afterwards with `admin-tools.mjs purge-smoke`.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';

const log = (...a) => console.log('[billing]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[billing] FAIL', msg); } };
const NOISE = [/Invalid Sentry Dsn/i, /get_public_services/, /billing\/status/];

const db = admin();
const email = newEmail('billing');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId);

const { browser, ctx, page, problems } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel, p = page) => p.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const home = async () => { await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500); await skipTour(); };
const openBilling = async () => {
  await visible('button[aria-label="הגדרות"]').click(); await page.waitForTimeout(900);
  await page.locator('.sheet button:text-is("העסק שלי"), [role=dialog] button:text-is("העסק שלי")').filter({ visible: true }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="billing-card"]').scrollIntoViewIfNeeded();
};
const status = async () => (await page.evaluate(async () => { const r = await fetch('/api/billing/status'); return { code: r.status, json: await r.json().catch(() => null) }; }));
const cron = async (secret = 'local-smoke-only') => { const r = await fetch(`${BASE}/api/billing/charge-due`, { method: 'POST', headers: secret ? { Authorization: `Bearer ${secret}` } : {} }); return { code: r.status, json: await r.json().catch(() => null) }; };
const addCardOnMockPage = async (choice) => {
  await visible('[data-testid="billing-card"] button:text-matches("הוספת כרטיס אשראי|עדכון כרטיס|חידוש המנוי")').click();
  await page.waitForURL((u) => u.pathname.startsWith('/api/billing/mock-card'), { timeout: 20000 });
  check((await body()).includes('לא יחויב כסף'), 'the mock card page says no card and no charge');
  await page.locator(`button[value="${choice}"]`).click(); await page.waitForTimeout(2500);
};

try {
  // login + onboarding (same steps as the Grow smoke test)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת חיוב (בדיקה)');
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

  // ── part A ──
  const st = await status();
  check(st.code === 200 && st.json?.ui === true && st.json?.mode === 'mock', `billing is on for this server in mock mode (status ${st.code})`);
  check((await cron(null)).code === 401, 'the cron refuses a call without the secret');
  const migrated = st.json?.tableReady !== false;
  await openBilling();
  check(await page.locator('[data-testid="billing-card"]').count() === 1, 'the billing card is in settings');
  check(await page.locator('[data-testid="billing-mock"]').count() === 1, 'the card says it is a test run (mock mode)');
  if (!migrated) {
    check((await page.locator('[data-testid="billing-card"]').innerText()).includes('עוד לא הופעל'), 'before the migration the card says it is not enabled yet, with no button that leads nowhere');
    const c = await cron();
    check(c.code === 200 && c.json?.skipped === 'tables-missing', `the cron does nothing while the tables are missing (${JSON.stringify(c.json)})`);
    check((await fetch(`${BASE}/api/billing/mock-card`)).status === 410, 'the mock card page without a signed token is refused');
    log('PART B SKIPPED: add_kalmea_billing.sql has not been run, so the charge / retry / block flow was not walked in the browser');
  } else {
    // ── part B ──
    const days = (d) => new Date(Date.now() + d * 86400000).toISOString();
    await db.from('tenants').update({ plan_status: 'trial', trial_ends_at: days(4), plan_price: 349 }).eq('id', tenantId);
    await page.keyboard.press('Escape'); await home();
    check(await page.locator('[data-testid="billing-cta"]').filter({ visible: true }).count() === 1, 'the trial banner invites her to add a card (4 days before the end)');
    await visible('[data-testid="billing-cta"]').click(); await page.waitForTimeout(1200);
    check(await page.locator('[data-testid="billing-card"]').count() === 1 && (await body()).includes('₪349'), 'the invitation opens her billing screen at her price (349)');
    await addCardOnMockPage('ok');
    let { data: sub } = await db.from('billing_subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
    check(sub?.status === 'trialing' && sub.card_last4 === '4242' && Number(sub.price) === 349 && !!sub.token_ref, 'the card is saved: trialing at 349 with a token reference and the last four digits');
    check(((await db.from('billing_payments').select('id').eq('tenant_id', tenantId)).data || []).length === 0, 'nothing is charged during the trial');

    // the trial ends in 10 hours: the cron charges before the end
    await db.from('tenants').update({ trial_ends_at: new Date(Date.now() + 10 * 3600000).toISOString() }).eq('id', tenantId);
    await db.from('billing_subscriptions').update({ next_charge_at: new Date(Date.now() + 10 * 3600000).toISOString() }).eq('tenant_id', tenantId);
    let c = await cron();
    check(c.json?.charged === 1, `the cron charged (${JSON.stringify(c.json)})`);
    let pays = (await db.from('billing_payments').select('*').eq('tenant_id', tenantId)).data || [];
    check(pays.length === 1 && pays[0].status === 'succeeded' && Number(pays[0].amount) === 349 && pays[0].invoice_status === 'issued' && !!pays[0].invoice_url, 'one successful payment of 349 with an invoice');
    check((await db.from('tenants').select('plan_status').eq('id', tenantId).single()).data.plan_status === 'active', 'the business is active');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1200); await skipTour();
    await openBilling();
    check(await page.locator('[data-testid="billing-history"] a:has-text("חשבונית")').count() === 1, 'the history shows the invoice link');

    // a refused card: failure, retry state, banner
    await addCardOnMockPage('decline');
    await db.from('billing_subscriptions').update({ next_charge_at: new Date(Date.now() - 3600000).toISOString() }).eq('tenant_id', tenantId);
    c = await cron();
    check(c.json?.failed === 1, `a refused card fails the charge (${JSON.stringify(c.json)})`);
    ({ data: sub } = await db.from('billing_subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle());
    check(sub.status === 'past_due' && sub.failed_attempts === 1, 'past due, one failed attempt');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1800); await skipTour();
    check(await page.locator('[data-testid="billing-past-due"]').count() === 1, 'the in-app banner says the charge failed');

    // grace over: blocked, but billing is still reachable and a good card unblocks at once
    await db.from('billing_subscriptions').update({ past_due_since: new Date(Date.now() - 8 * 86400000).toISOString(), failed_attempts: 4 }).eq('tenant_id', tenantId);
    c = await cron();
    check(c.json?.blocked === 1, `after the grace period the business is blocked (${JSON.stringify(c.json)})`);
    check((await db.from('tenants').select('plan_status').eq('id', tenantId).single()).data.plan_status === 'expired', 'blocked through the existing plan_status gate');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1800); await skipTour();
    const cta = visible('[data-testid="billing-cta"]');
    check((await cta.count()) === 1 && (await cta.innerText()).includes('תשלום וחזרה לעבודה'), 'the blocked banner offers "pay and return to work"');
    await cta.click(); await page.waitForTimeout(1200);
    check(await page.locator('[data-testid="billing-card"]').count() === 1, 'the billing screen is reachable while blocked');
    await addCardOnMockPage('ok');
    check((await db.from('tenants').select('plan_status').eq('id', tenantId).single()).data.plan_status === 'active', 'a good card charges and unblocks at once');
    pays = (await db.from('billing_payments').select('*').eq('tenant_id', tenantId)).data || [];
    check(pays.filter((p) => p.status === 'succeeded').length === 2 && pays.some((p) => p.status === 'failed'), 'the history keeps the failure and shows two successful payments');

    // cancel
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500); await skipTour();
    await openBilling();
    await visible('[data-testid="billing-card"] button:text-is("ביטול המנוי")').click(); await page.waitForTimeout(400);
    await visible('[data-testid="billing-card"] button:text-is("כן, לבטל")').click(); await page.waitForTimeout(2000);
    check((await db.from('billing_subscriptions').select('status').eq('tenant_id', tenantId).single()).data.status === 'canceled', 'the subscription is cancelled');
    check((await page.locator('[data-testid="billing-line"]').innerText()).includes('המנוי בוטל'), 'the screen says it was cancelled and until when');

    // the owner's list and manual payment
    await db.from('platform_admins').insert({ user_id: userId });
    const adm = await ctx.newPage();
    adm.on('dialog', (d) => d.accept());
    await adm.goto(`${BASE}/dashboard/admin`, { waitUntil: 'domcontentloaded' }); await adm.waitForTimeout(3500);
    check((await body(adm)).includes('מנויים וחיובים') && (await body(adm)).includes('קליניקת חיוב'), 'the subscription shows in the admin list');
    await adm.locator('button:has-text("סימון כשולם ידנית")').first().click(); await adm.waitForTimeout(2500);
    pays = (await db.from('billing_payments').select('*').eq('tenant_id', tenantId)).data || [];
    check(pays.some((p) => p.kind === 'manual' && p.status === 'succeeded'), 'the owner marked a manual payment');
    check((await db.from('billing_subscriptions').select('status').eq('tenant_id', tenantId).single()).data.status === 'active', 'and the subscription is active again');
    await db.from('platform_admins').delete().eq('user_id', userId);
    await adm.close();
  }

  const real = [...new Set(problems.filter((p) => !NOISE.some((n) => n.test(p))))];
  check(real.length === 0, 'no console errors, page errors or 5xx responses' + (real.length ? ': ' + real.slice(0, 6).join(' | ') : ''));
} catch (e) {
  fails.push('script error: ' + e.message); console.error('[billing] ERROR', e.message);
  console.error('[billing] page:', page.url(), (await body().catch(() => '')).slice(0, 400));
} finally {
  await browser.close();
}
console.log(fails.length ? `\n[billing] ${fails.length} failure(s)` : '\n[billing] all ok');
process.exit(fails.length ? 1 : 0);
