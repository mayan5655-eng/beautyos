// Every screen's own link, on a brand-new business, removed at the end: each link opens its screen, refresh stays, Back and forward work
// without a reload, Settings follows the address, a hidden tab falls back, a signed-out link returns after login.
//
//   SMOKE_BASE=https://<branch-preview>.vercel.app node --env-file=.env.local scripts/smoke/screen-links.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: screen-links.mjs <outDir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[links]', ...a);
const db = admin();
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(pass ? 'ok  ' : 'FAIL', name, detail); };

const email = newEmail('links');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const tenantId = await tenantIdOf(created.user.id);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId, 'base', BASE);

const NAV = 'button[aria-label="יומן"]';
const ready = async (page) => { await page.waitForSelector(NAV, { timeout: 60000 }); await page.waitForTimeout(600); };
const headings = (page) => page.evaluate(() => [...document.querySelectorAll('h1,h2')].filter((e) => e.offsetParent).map((e) => e.textContent.trim()).slice(0, 3).join(' | '));
const search = (page) => new URL(page.url()).search;
const skipTour = async (page) => { const b = page.locator('button:has-text("דלגי")').first(); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(500); } };

const { browser, page, problems } = await launch();
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקת קישורים');
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
  await ready(page);

  // A brand-new tenant with the tour on, opened straight on a screen the tour has no step for.
  await page.goto(`${BASE}/dashboard?tab=help`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  check('fresh tenant: a link opens with the tour pending', search(page) === '?tab=help', await headings(page));
  await skipTour(page);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await ready(page); await skipTour(page);
  const home = await headings(page);
  check('plain /dashboard stays plain', search(page) === '', home);

  for (const q of ['insights', 'calendar', 'clients', 'leads', 'cashier', 'tax', 'whatsapp', 'campaigns', 'packages', 'advisor', 'help', 'whatsapp&view=log', 'campaigns&view=campaigns', 'campaigns&view=reels']) {
    await page.goto(`${BASE}/dashboard?tab=${q}`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const h = await headings(page);
    check(`link ?tab=${q}`, search(page) === `?tab=${q}` && h !== home, h);
    if (q === 'calendar') await page.screenshot({ path: `${out}/calendar-430.png` });
    if (q === 'whatsapp&view=log' || q === 'campaigns&view=reels') {
      await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
      check(`refresh stays on ?tab=${q}`, search(page) === `?tab=${q}` && (await headings(page)) === h);
    }
  }

  // Clicking moves the address; Back and forward move the screen with no page reload.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await ready(page);
  await page.evaluate(() => { window.__sameLoad = true; });
  await page.click(NAV); await page.waitForTimeout(500);
  check('click יומן writes the address', search(page) === '?tab=calendar', search(page));
  await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(500);
  check('click לקוחות writes the address', search(page) === '?tab=clients', search(page));
  const clientsH = await headings(page);
  await page.goBack(); await page.waitForTimeout(700);
  check('Back returns to יומן', search(page) === '?tab=calendar' && (await headings(page)) !== clientsH, await headings(page));
  await page.goForward(); await page.waitForTimeout(700);
  check('forward returns to לקוחות', search(page) === '?tab=clients' && (await headings(page)) === clientsH);
  await page.goBack(); await page.goBack(); await page.waitForTimeout(700);
  check('Back reaches היום with no parameter', search(page) === '' && (await headings(page)) === home);
  check('no page reload along the way', await page.evaluate(() => window.__sameLoad === true));

  // Settings: a panel the address opens, closes and names the group of.
  await page.goto(`${BASE}/dashboard?tab=settings&section=booking`, { waitUntil: 'domcontentloaded' }); await ready(page);
  const open = page.locator('button:has-text("יומן ושירותים")').first();
  check('settings link opens the panel', await open.isVisible().catch(() => false));
  await page.locator('button:has-text("הדף שלי")').first().click(); await page.waitForTimeout(500);
  check('group click writes the address', search(page) === '?tab=settings&section=page', search(page));
  await page.screenshot({ path: `${out}/settings-430.png` });
  await page.goBack(); await page.waitForTimeout(600);
  check('Back returns to the group', search(page) === '?tab=settings&section=booking', search(page));
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  check('closing removes settings from the address', !search(page).includes('settings') && !(await open.isVisible().catch(() => false)), search(page));

  // Back with unsaved changes: she is asked, and the address stays until she answers.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await ready(page);
  // Same document, so Back below is a popstate and not a page load: the entry the settings button would have written.
  await page.evaluate(() => { history.pushState(null, '', '?tab=settings&section=business'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(800);
  const field = page.locator('input[type=text], input:not([type])').filter({ visible: true }).first();
  await field.fill('שם אחר לבדיקה'); await page.waitForTimeout(300);
  await page.goBack(); await page.waitForTimeout(800);
  const dirty = page.locator('text=לצאת בלי לשמור?');
  check('Back with a draft asks first and keeps the address', (await dirty.isVisible().catch(() => false)) && search(page).includes('tab=settings'), search(page));
  if (await dirty.isVisible().catch(() => false)) {
    await page.click('button:has-text("חזרה לעריכה")'); await page.waitForTimeout(400);
    check('staying keeps the panel and the address', search(page).includes('tab=settings'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.click('button:has-text("צאי בלי לשמור")'); await page.waitForTimeout(600);
    check('leaving without saving clears the address', !search(page).includes('settings'), search(page));
  }

  // Hidden and unknown screens fall back, and Back does not trap her. A stub tab opens once the tenant opted in.
  await page.goto(`${BASE}/dashboard?tab=protocols`, { waitUntil: 'domcontentloaded' }); await ready(page);
  check('hidden tab falls back to היום', search(page) === '', search(page));
  await page.goto(`${BASE}/dashboard?tab=nothing`, { waitUntil: 'domcontentloaded' }); await ready(page);
  check('unknown tab falls back to היום', search(page) === '', search(page));
  const { data: st } = await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle();
  const au = st?.automations || {};
  const upd = await db.from('settings').update({ automations: { ...au, feature_flags: { ...(au.feature_flags || {}), protocols: true } } }).eq('tenant_id', tenantId);
  if (upd.error) throw upd.error;
  await page.goto(`${BASE}/dashboard?tab=protocols`, { waitUntil: 'domcontentloaded' }); await ready(page);
  check('opted-in stub tab opens from a link', search(page) === '?tab=protocols', await headings(page));

  // Signed out: through login and back to the same screen.
  const ctx2 = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'he-IL' });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/dashboard?tab=settings&section=booking`, { waitUntil: 'networkidle' });
  check('signed out: goes to login with next', p2.url().includes('/login?next='), p2.url().replace(BASE, ''));
  await p2.fill('input[type=email]', email); await p2.fill('input[type=password]', PASSWORD); await p2.click('button[type=submit]');
  await p2.waitForURL((u) => u.pathname === '/dashboard', { timeout: 60000 }); await ready(p2);
  check('after login: on the linked screen', search(p2) === '?tab=settings&section=booking', search(p2));
  const p3 = await ctx2.newPage();
  await ctx2.clearCookies();
  await p3.goto(`${BASE}/?tab=calendar`, { waitUntil: 'networkidle' });
  check('signed out on /?tab=: goes to login too', p3.url().includes('/login?next='), p3.url().replace(BASE, ''));
  await p3.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  check('signed out plain / is still the landing page', new URL(p3.url()).pathname === '/');
  await ctx2.close();

  const real = problems.filter((p) => !/favicon|manifest|Failed to load resource/i.test(p));
  check('no page errors', real.length === 0, real.slice(0, 5).join(' || '));
} catch (e) {
  results.push(false);
  console.error('[links] ERROR', e?.message || e);
  await page.screenshot({ path: `${out}/links-error.png` }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log('purged', email, await purgeTenant(tenantId, created.user.id));
}
const failed = results.filter((r) => !r).length;
log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
