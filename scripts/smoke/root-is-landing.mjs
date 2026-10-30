// "/" is the landing page for everyone and the app lives at /dashboard: signed out, then a NEW account through login and onboarding, then "/" again
// while signed in. Also plays the before and after rows with sound. Removes the account at the end.
//
//   SMOKE_BASE=https://<branch-preview>.vercel.app node --env-file=.env.local scripts/smoke/root-is-landing.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: root-is-landing.mjs <outDir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[root]', ...a);
const db = admin();
const email = newEmail('rootlanding');
const { data: created, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (error) throw error;
await new Promise((r) => setTimeout(r, 1500));
const tenantId = await tenantIdOf(created.user.id);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');

let failed = false;
const check = (name, cond) => { log(cond ? 'ok  ' : 'FAIL', name); if (!cond) failed = true; };
const { browser, page } = await launch();
try {
  await page.setViewportSize({ width: 430, height: 932 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('signed out: landing page', await page.locator('h1').innerText() === 'עונה לוואטסאפים באמצע טיפול?');
  check('signed out: header says login', await page.locator('header a[href="/login"]').count() === 1);
  check('no business line on the landing page', await page.locator('[data-testid=kalmea-business-line]').innerText().then((t) => !t.includes('עוסק פטור')));

  await page.locator('button.ba-sound').click();
  check('sound button turns on', await page.locator('button.ba-sound').getAttribute('aria-pressed') === 'true');
  const row = page.locator('button.ba-row').nth(1);
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  check('six before and after rows', await page.locator('button.ba-row').count() === 6);
  check('a row in view ends finished', await row.getAttribute('data-ba') === 'play');
  await page.screenshot({ path: `${out}/before-after.png` });
  await page.locator('[data-testid=landing-day]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/a-day.png` });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקת דף ראשי');
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
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 90000 });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  check('after onboarding: the app at /dashboard', true);
  const top = await page.evaluate(() => { const c = [...document.body.querySelectorAll('*')].find((e) => e.getBoundingClientRect().height > 40 && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && e.getBoundingClientRect().top >= 0 && e.tagName !== 'BODY' && e.tagName !== 'MAIN'); return { top: window.scrollY, sideways: document.documentElement.scrollWidth - window.innerWidth, y: Math.round(document.querySelector('button[aria-label="יומן"]').getBoundingClientRect().bottom), first: c?.tagName }; });
  log('dashboard', JSON.stringify(top));
  await page.screenshot({ path: `${out}/dashboard.png` });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('signed in: "/" is still the landing page', await page.locator('h1').innerText() === 'עונה לוואטסאפים באמצע טיפול?');
  await page.locator('header a[href="/dashboard"]').click();
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
  check('signed in: header link opens the app', new URL(page.url()).pathname === '/dashboard');

  await page.evaluate(() => fetch('/login')); // keep the session; login-again path below uses a fresh context
  const ctx2 = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.fill('input[type=email]', email); await p2.fill('input[type=password]', PASSWORD); await p2.click('button[type=submit]');
  await p2.waitForURL((u) => u.pathname === '/dashboard', { timeout: 60000 });
  check('a returning login lands on /dashboard', true);
  await ctx2.close();
  check('no page errors', errors.length === 0);
  if (errors.length) log(errors.slice(0, 3).join(' | ').slice(0, 300));
} catch (e) {
  failed = true;
  console.error('[root] ERROR', e?.message || e);
  await page.screenshot({ path: `${out}/error.png` }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log('purged', email, await purgeTenant(tenantId, created.user.id));
}
process.exit(failed ? 1 : 0);
