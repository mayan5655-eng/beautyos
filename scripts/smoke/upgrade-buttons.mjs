// The upgrade buttons (NEXT_PUBLIC_UPGRADE_BUTTONS=1 + BILLING_UI_ENABLED, mock billing), on one NEW smoke tenant at 430px:
//   day 1 of the trial -> a quiet "הצטרפות למנוי, 499 ₪ לחודש" text button on the gentle line -> it opens the billing card
//   3 days left -> the urgent card carries the full button and "החיוב הראשון רק כשתקופת ההתנסות מסתיימת."
//   expired -> the renewal screen (PlanBlockedScreen) with the billing card, its price and the add-card button
// No card is added and nothing is charged. node --env-file=.env.local scripts/smoke/upgrade-buttons.mjs (SMOKE_BASE=<preview>)
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[upgrade]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[upgrade] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';

const db = admin();
const email = newEmail('upgrade');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const { browser, page } = await launch();
const body = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const home = async () => { await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); await skipTour(); };
const setTrialDays = async (days) => {
  const { error } = await db.from('tenants').update({ plan_status: 'trial', trial_ends_at: new Date(Date.now() + days * 864e5).toISOString() }).eq('id', tenantId);
  check(!error, `trial ends in ${days} days${error ? ` (${error.message})` : ''}`);
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה מנוי');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
  await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click().catch(() => {}); await page.waitForTimeout(200);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });

  const st = await page.evaluate(async () => { const r = await fetch('/api/billing/status'); return { code: r.status, json: await r.json().catch(() => null) }; });
  check(st.code === 200 && st.json?.configured, `billing is on for this preview (status ${st.code}, configured ${st.json?.configured}, tableReady ${st.json?.tableReady})`);

  // ── gentle ──
  await setTrialDays(25);
  await home();
  const quiet = page.locator('[data-testid="upgrade-cta"]').filter({ visible: true });
  check(await quiet.count() === 1, 'gentle trial: one upgrade button');
  const qt = (await quiet.first().innerText().catch(() => '')).trim();
  check(/הצטרפות למנוי, \d+ ₪ לחודש/.test(qt), `its label: ${qt}`);
  const qb = await quiet.first().boundingBox();
  check(!!qb && qb.height >= 44 && qb.x >= 0 && qb.x + qb.width <= 430, `tap-sized and on screen (${qb ? `${Math.round(qb.width)}x${Math.round(qb.height)}` : 'none'})`);
  await page.screenshot({ path: `${SHOTS}/smoke-upgrade-gentle.png` });
  await quiet.first().click();
  const card = await page.waitForSelector('[data-testid="billing-card"]', { timeout: 15000 }).catch(() => null);
  if (card) await card.scrollIntoViewIfNeeded().catch(() => {});
  check(!!card, 'it opens Settings on the billing card');
  await page.screenshot({ path: `${SHOTS}/smoke-upgrade-billing.png` });

  // ── urgent ──
  await setTrialDays(3);
  await home();
  const full = page.locator('[data-testid="upgrade-cta"]').filter({ visible: true });
  check(await full.count() === 1, 'urgent trial: the upgrade button is on the card');
  const urgentText = await body();
  check(urgentText.includes('החיוב הראשון רק כשתקופת ההתנסות מסתיימת.'), 'with the "first charge only when the trial ends" line');
  check(urgentText.includes('בסוף ההתנסות המערכת נסגרת עד לחידוש המנוי') && urgentText.includes('מחיר היכרות 349 ₪ לזמן מוגבל'), 'trial-close copy kept (TRIAL_URGENT_BODY_HE)');
  await page.screenshot({ path: `${SHOTS}/smoke-upgrade-urgent.png` });

  // ── expired ──
  await setTrialDays(-2);
  await home();
  const closed = await body();
  // Since trial-close, the expired dashboard is PlanBlockedScreen, which carries the billing card itself (no BillingNotices banner).
  check(closed.includes('תקופת ההתנסות הסתיימה') && await page.locator('[data-testid="billing-card"]').filter({ visible: true }).count() === 1, 'expired: the renewal screen with the billing card');
  check(/499\s*₪|₪\s*499/.test(closed) && closed.includes('הוספת כרטיס אשראי'), 'with the price and the add-card button');
  await page.screenshot({ path: `${SHOTS}/smoke-upgrade-expired.png` });
} catch (e) {
  fails.push(`threw: ${e?.message}`);
  console.error(e);
  await page.screenshot({ path: `${SHOTS}/smoke-upgrade-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  log('cleanup', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 300));
}
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all checks passed');
process.exit(fails.length ? 1 : 0);
