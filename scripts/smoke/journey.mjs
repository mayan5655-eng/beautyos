// Browser journey for one smoke account: login, onboarding (as cosmetics or nails), every main tab, nudge card.
// node --env-file=.env.local scripts/smoke/journey.mjs <account.json> <cosmetics|nails>
import { launch, PASSWORD, BASE } from './lib.mjs';
import fs from 'node:fs';

const acct = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const field = process.argv[3] || 'cosmetics';
const { browser, ctx, page, problems } = await launch();
const log = (...a) => console.log(...a);
const bodyText = async () => (await page.innerText('body')).replace(/\s+/g, ' ');

// 1. login
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type=email]', acct.email);
await page.fill('input[type=password]', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
await Promise.race([page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 45000 }), page.waitForSelector('button[aria-label="יומן"]', { timeout: 45000 })]).catch(() => {});
log('after login:', new URL(page.url()).pathname);

// 2. onboarding
if (page.url().includes('/onboarding')) {
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', field === 'nails' ? 'סטודיו ניצן (בדיקה)' : 'קליניקת בדיקה');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  // step 4: the field is required (a nail technician must not become a cosmetician by skipping)
  await page.click('button:has-text("דלגי")'); await page.waitForTimeout(400);
  const gate = (await bodyText()).includes('בחרי לפחות תחום אחד');
  log('field step blocks skipping:', gate);
  await page.click(field === 'nails' ? 'button:has-text("מניקור ופדיקור")' : 'button:has-text("קוסמטיקה וטיפוח פנים")');
  await page.waitForTimeout(500);
  const t4 = await bodyText();
  log('services offered, sample:', t4.slice(t4.indexOf('שירותים'), t4.indexOf('שירותים') + 200));
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("לא עכשיו")');
  await page.waitForURL((u) => u.pathname === '/' || u.pathname.startsWith('/?'), { timeout: 40000 }).catch(() => {});
}
await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
await page.waitForTimeout(1500);
log('dashboard url:', page.url());

// 3. tour: close it if it shows
for (let i = 0; i < 8; i++) {
  const skip = page.locator('button:has-text("דלגי")').first();
  if (await skip.count() && await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); await page.waitForTimeout(400); } else break;
}
// 4. trial nudge on day 1
log('day-1 nudge card visible:', await page.locator('[data-testid="trial-nudge"]').count() > 0);
log('nav labels:', await page.$$eval('nav button, .mobile-only button', (b) => [...new Set(b.map((x) => x.getAttribute('aria-label') || '').filter(Boolean))]));

// 5. every main tab
const tabs = process.env.TABS ? process.env.TABS.split(',') : ['היום', 'יומן', 'לקוחות', 'תשלום', 'תוכן'];
for (const t of tabs) {
  const btn = page.locator(`button[aria-label="${t}"]`).first();
  if (!(await btn.count())) { log('tab missing:', t); continue; }
  await btn.click(); await page.waitForTimeout(1800);
  const txt = await bodyText();
  log(`tab ${t}: ${txt.length} chars, crash screen: ${/Kalmea error|משהו נתקע אצלנו/.test(txt)}`);
}
log('problems:', problems);
await ctx.storageState({ path: `${process.env.TEMP || '/tmp'}/smoke-state-${field}.json` });
await browser.close();
