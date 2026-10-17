// Render test for every main screen, in a real browser, for a cosmetician and for a nail technician.
// Fails (exit 1) on: the crash screen ("Kalmea error"), an uncaught page error, a console error that is not known noise, a 5xx response,
// or a screen that renders almost nothing. Also checks that a nail technician is not shown facial-only text.
//   node --env-file=.env.local scripts/smoke/screens.mjs [cosmetics] [nails]     (needs the account state files from journey.mjs)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const fields = process.argv.slice(2).length ? process.argv.slice(2) : ['cosmetics', 'nails'];
const NOISE = [/Invalid Sentry Dsn/i, /favicon/i];
let failures = 0;
const fail = (who, msg) => { failures++; console.error(`FAIL [${who}] ${msg}`); };
const pass = (who, msg) => console.log(`ok   [${who}] ${msg}`);

for (const field of fields) {
  const state = `${process.env.TEMP || '/tmp'}/smoke-state-${field}.json`;
  if (!fs.existsSync(state)) { fail(field, `no login state at ${state}; run journey.mjs first`); continue; }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 430, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.some((n) => n.test(m.text()))) problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

  const text = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
  const closeOverlays = async () => {
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    for (let i = 0; i < 4; i++) {
      const c = page.locator('button[aria-label="סגירה"]').last();
      if (await c.count() && await c.isVisible().catch(() => false)) { await c.click().catch(() => {}); await page.waitForTimeout(250); } else break;
    }
  };
  const check = async (name, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 1500);
    const t = await text();
    const before = problems.length;
    if (/Kalmea error/.test(t)) fail(field, `${name}: the crash screen is showing`);
    else if (t.length < (opts.min ?? 200)) fail(field, `${name}: nearly empty (${t.length} chars)`);
    else if (opts.mustInclude && !opts.mustInclude.every((s) => t.includes(s))) fail(field, `${name}: missing ${opts.mustInclude.filter((s) => !t.includes(s)).join(' | ')}`);
    else if (opts.mustNotInclude && opts.mustNotInclude.some((s) => t.includes(s))) fail(field, `${name}: shows ${opts.mustNotInclude.filter((s) => t.includes(s)).join(' | ')}`);
    else pass(field, `${name} (${t.length} chars)`);
    return t;
  };

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) { const sk = page.locator('button:has-text("דלגי")').first(); if (await sk.count() && await sk.isVisible().catch(() => false)) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; }

  const facial = ['סריקת עור', 'פלזמה', 'לייזר', 'פילינג'];
  const nails = field === 'nails';

  // the five main tabs
  await check('היום', { mustInclude: ['הגדרת המערכת'] });
  for (const tab of ['יומן', 'לקוחות', 'תשלום', 'תוכן']) { await page.click(`button[aria-label="${tab}"]`); await check(tab); }
  // the people segments inside "לקוחות"
  await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(600);
  for (const seg of ['פניות', 'הודעות']) {
    const b = page.locator(`button:text-is("${seg}")`).filter({ visible: true }).first();
    if (await b.count()) { await b.click(); await check(`לקוחות > ${seg}`); } else fail(field, `segment ${seg} not found`);
  }
  // the "more" sheet
  for (const item of ['תובנות', 'סיכום הכנסות', 'מנויים', 'יועץ AI', 'עזרה']) {
    await page.click('button[aria-label="עוד"]'); await page.waitForTimeout(500);
    const b = page.locator(`button:has-text("${item}")`).filter({ visible: true }).first();
    if (!(await b.count())) { fail(field, `more > ${item} not found`); continue; }
    await b.click();
    const t = await check(`עוד > ${item}`, item === 'עזרה' ? { mustNotInclude: nails ? facial : [] } : {});
    if (item === 'עזרה' && nails) { /* the help text for a nail technician */ }
  }
  // the add-client form: skin type only for cosmetics
  await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(500);
  const add = page.locator('button:has-text("לקוחה חדשה")').filter({ visible: true }).first();
  if (await add.count()) {
    await add.click(); await page.waitForTimeout(700);
    const hasSkin = (await page.locator('select option:text-is("מעורב")').count()) > 0;
    if (nails && hasSkin) fail(field, 'the new-client form asks a nail technician for skin type');
    else if (!nails && !hasSkin) fail(field, 'the new-client form lost the skin type field for a cosmetician');
    else pass(field, `new-client form (skin type ${hasSkin ? 'shown' : 'hidden'})`);
    await closeOverlays();
  } else fail(field, 'no "לקוחה חדשה" button');
  // settings, every group
  await page.locator('button[aria-label="הגדרות"]').filter({ visible: true }).first().click(); await page.waitForTimeout(900);
  for (const group of ['העסק שלי', 'הדף שלי', 'יומן ושירותים', 'הודעות', 'לקוחות ופניות', 'חיבורים', 'מתקדם']) {
    const b = page.locator(`.sheet button:text-is("${group}"), [role=dialog] button:text-is("${group}")`).filter({ visible: true }).first();
    if (!(await b.count())) { fail(field, `settings group ${group} not found`); continue; }
    await b.click();
    const t = await check(`הגדרות > ${group}`, { min: 100, wait: 900, mustNotInclude: nails && (group === 'לקוחות ופניות' || group === 'חיבורים') ? ['מעקב עור חכם', 'סורק העור — הקישור לשיתוף'] : [] });
    if (!nails && group === 'לקוחות ופניות' && !t.includes('מעקב עור חכם')) fail(field, 'settings: the skin follow-up block disappeared for a cosmetician');
  }
  await closeOverlays();

  if (problems.length) for (const p of [...new Set(problems)].slice(0, 12)) fail(field, p);
  else pass(field, 'no console errors, page errors or 5xx responses');
  await browser.close();
}
if (failures) { console.error(`\nscreens: ${failures} failure(s)`); process.exit(1); }
console.log('\nscreens: all ok');
