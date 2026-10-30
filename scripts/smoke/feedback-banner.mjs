// The feedback banner on one NEW smoke tenant at 430px: a real signup and onboarding, then the real database for everything it decides.
//   day 2 with data: nothing. day 5 with no data: nothing. day 5 with one client, table missing: nothing, and /api/feedback says why.
//   With the table: banner, stars, the five questions, send, saved row, never again.
//   Without the table (the SQL is still pending): that same walk runs on the deployed page with ONLY /api/feedback answered by this
//   script, so the real component and layout are exercised. Those steps print [mocked api]; they prove the screen, not the save.
// node --env-file=.env.local scripts/smoke/feedback-banner.mjs (SMOKE_BASE=<preview>, SMOKE_SHOTS=<folder>)
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[feedback]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[feedback] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';
const PAUSE = 9000; // the banner waits 6 seconds, plus a cold preview

const db = admin();
const email = newEmail('feedback');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const { browser, page } = await launch();
const banner = page.locator('[data-testid="feedback-banner"]');
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const home = async () => { await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); await skipTour(); await page.waitForTimeout(PAUSE); };
const setDay = async (day) => {
  const started = new Date(Date.now() - (day - 1) * 864e5).toISOString();
  const { error } = await db.from('tenants').update({ plan_status: 'trial', trial_started_at: started, trial_ends_at: new Date(Date.now() + 20 * 864e5).toISOString() }).eq('id', tenantId);
  if (error) throw error;
};
const noHorizontalScroll = async (what) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 430, `no sideways scroll, ${what} (${w})`);
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה משוב');
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

  const api = await page.evaluate(async () => { const r = await fetch('/api/feedback'); return { code: r.status, json: await r.json().catch(() => null) }; });
  log('real GET /api/feedback', JSON.stringify(api));
  check(api.code === 200, 'the route answers a signed-in owner');
  const tableReady = api.json?.available === true;
  log(tableReady ? 'table is there: real path' : `table is not there (${api.json?.reason}): degraded path, then the screen with a mocked api`);
  if (!tableReady) check(api.json?.available === false && api.json?.reason === 'table-missing', 'it says so honestly');

  const post = await page.evaluate(async () => { const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); return { code: r.status, json: await r.json().catch(() => null) }; });
  check(post.code === 400 && post.json?.success === false, `no stars is refused (${post.code})`);

  const reallyDegraded = !tableReady;
  if (reallyDegraded) {
    const save = await page.evaluate(async () => { const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }) }); return { code: r.status, json: await r.json().catch(() => null) }; });
    check(save.code === 500 && save.json?.success === false && save.json?.reason === 'table-missing', `a save before the SQL is a real failure (${save.code}, ${save.json?.reason})`);
  }

  // Past the first-day gates, on an empty account: not asked.
  await setDay(5);
  await home();
  check(await banner.count() === 0, 'day 5, empty account: no banner');

  const { error: cl } = await db.from('clients').insert({ tenant_id: tenantId, name: 'לקוחה לבדיקה', phone: '0500000009' });
  if (cl) throw cl;

  if (reallyDegraded) {
    await home();
    check(await banner.count() === 0, 'day 5, used, table missing: no banner, nobody writes five answers into nothing');
    await page.route('**/api/feedback', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, submitted: false } });
      if (globalThis.failSave) return route.fulfill({ status: 500, json: { success: false, error: 'לא הצלחנו לשמור הפעם, והתשובות שלך עדיין כאן. נסי לשלוח שוב בעוד רגע.' } });
      globalThis.savedBody = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ json: { success: true } });
    });
  }
  const tag = reallyDegraded ? '[mocked api] ' : '';

  // Too early, with data.
  await setDay(2);
  await home();
  check(await banner.count() === 0, `${tag}day 2, used: no banner`);

  // Day 4 and used, but the tour is open: it waits for the tour.
  await setDay(4);
  const { data: st } = await db.from('settings').select('automations').eq('tenant_id', tenantId).single();
  await db.from('settings').update({ automations: { ...(st?.automations || {}), onboarding_tour_seen: false, onboarding_tour_step: 0 } }).eq('tenant_id', tenantId);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000 + PAUSE);
  const tourOpen = await visible('button:has-text("דלגי")').count();
  check(tourOpen > 0 && await banner.count() === 0, `${tag}tour open: no banner on top of it (tour ${tourOpen})`);

  // Tour gone: the banner comes.
  await skipTour();
  await banner.waitFor({ timeout: 20000 }).catch(() => {});
  check(await banner.count() === 1, `${tag}day 4, used, tour closed: the banner pops up`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/smoke-feedback-1-stars.png` });
  const box = await banner.boundingBox();
  check(!!box && box.x >= 0 && box.x + box.width <= 430, `${tag}inside the screen (${box ? `${Math.round(box.x)}..${Math.round(box.x + box.width)}` : 'none'})`);
  await noHorizontalScroll('stars');

  // Snooze, remembered on reload.
  await visible('button:has-text("לא עכשיו")').click();
  check(await banner.count() === 0, `${tag}"not now" closes it`);
  await home();
  check(await banner.count() === 0, `${tag}snoozed: not back on the next visit`);
  await page.evaluate((t) => localStorage.removeItem(`kalmea_feedback_v1_${t}`), tenantId);
  await home();
  await banner.waitFor({ timeout: 15000 }).catch(() => {});

  // A star opens the rest.
  await page.locator('[data-testid="feedback-star-4"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/smoke-feedback-2-form-top.png` });
  check(await page.locator('[data-overlay="feedback"]').count() === 1, `${tag}a star opens the questions`);
  for (const [id, v] of [['ease', 5], ['calendar', 4], ['time', 3], ['recommend', 5]]) {
    const b = page.locator(`[data-testid="feedback-${id}-${v}"]`);
    const bb = await b.boundingBox();
    check(!!bb && bb.height >= 44 && bb.width >= 44, `${tag}${id} face is tap-sized (${bb ? `${Math.round(bb.width)}x${Math.round(bb.height)}` : 'none'})`);
    await b.click();
  }
  await page.locator('[data-testid="feedback-videos-not-yet"]').click();
  await page.locator('[data-testid="feedback-text"]').fill('היומן מעולה, חסר לי דוח חודשי');
  await page.locator('[data-testid="feedback-send"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/smoke-feedback-3-form-bottom.png` });
  await noHorizontalScroll('form');
  const sheet = await banner.boundingBox();
  check(!!sheet && sheet.y >= 0 && sheet.y + sheet.height <= 900 + 1, `${tag}the sheet fits the screen and scrolls inside itself (${sheet ? Math.round(sheet.height) : 'none'})`);

  if (reallyDegraded) {
    globalThis.failSave = true;
    await page.locator('[data-testid="feedback-send"]').click();
    await page.waitForSelector('[data-testid="feedback-error"]', { timeout: 8000 }).catch(() => {});
    check(await page.locator('[data-testid="feedback-error"]').count() === 1, `${tag}a failed save says so`);
    check((await page.locator('[data-testid="feedback-text"]').inputValue()) === 'היומן מעולה, חסר לי דוח חודשי', `${tag}and her words stay`);
    await page.screenshot({ path: `${SHOTS}/smoke-feedback-4-error.png` });
    globalThis.failSave = false;
  }

  await page.locator('[data-testid="feedback-send"]').click();
  await page.waitForSelector('[data-testid="feedback-thanks"]', { timeout: 15000 }).catch(() => {});
  check(await page.locator('[data-testid="feedback-thanks"]').count() === 1, `${tag}thanks only after the save`);
  await page.screenshot({ path: `${SHOTS}/smoke-feedback-5-thanks.png` });

  if (reallyDegraded) {
    const s = globalThis.savedBody;
    check(s?.rating === 4 && s?.answers?.ease === 5 && s?.answers?.videos === 'not_yet' && /דוח/.test(s?.freeText), `${tag}the body she sent: ${JSON.stringify(s)}`);
    check(await page.evaluate((t) => JSON.parse(localStorage.getItem(`kalmea_feedback_v1_${t}`) || '{}').done === true, tenantId), `${tag}remembered as sent`);
  } else {
    const { data: rows, error } = await db.from('product_feedback').select('*').eq('tenant_id', tenantId);
    check(!error && rows?.length === 1 && rows[0].rating === 4 && rows[0].answers?.ease === 5 && rows[0].answers?.videos === 'not_yet', 'the row is really in the table');
    await page.evaluate((t) => localStorage.removeItem(`kalmea_feedback_v1_${t}`), tenantId);
    await home();
    check(await banner.count() === 0, 'sent once: the server stops it even on a new phone');
  }
} catch (e) {
  fails.push(String(e?.message || e));
  console.error('[feedback] threw', e);
  await page.screenshot({ path: `${SHOTS}/smoke-feedback-crash.png` }).catch(() => {});
} finally {
  await browser.close();
  const left = await purgeTenant(tenantId, userId);
  log('purged', tenantId, left.length ? left : 'clean');
}
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all passed');
process.exit(fails.length ? 1 : 0);
