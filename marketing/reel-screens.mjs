// marketing/reel-screens.mjs
//
// The real screens for the Noa reel, recorded WITHOUT captions (the reel draws its own): one client take on the public booking
// page (services -> day -> time -> "התור נקבע"), one owner take on her calendar showing that appointment. Same demo tenant and
// same rules as record-demo.mjs (books one appointment, the 02:00 UTC reset clears it; the AI-route guard aborts on any AI call).
// Output: out/reel/client.webm + owner.webm (raw), out/reel/marks.json (seconds into each take for each beat).

import fs from 'node:fs';
import path from 'node:path';
import { BASE, DEMO_TENANT, OUT, log, pause, openBrowser, recordTake } from './lib.mjs';

const DIR = path.join(OUT, 'reel');
fs.mkdirSync(DIR, { recursive: true });

const FIRST = ['אביגיל', 'גילי', 'דורית', 'חן', 'ורד', 'זהבה', 'ליאור', 'ענבל', 'פנינה', 'צליל', 'קרן', 'תהל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'דהן', 'פרידמן', 'אשכנזי', 'ביטון', 'גולן', 'חזן', 'טל', 'שמעוני', 'רוזן'];
const pick = Math.floor(Date.now() / 60000) % (FIRST.length * LAST.length);
const NAME = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)]}`;
const PHONE = `050000${String(1000 + pick).padStart(4, '0')}`;
const israelDom = (n) => +new Date(Date.now() + n * 864e5).toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' });

const marks = { client: {}, owner: {} };
const booked = { when: '', time: '' };
const seen = (h) => h.page.getByText(NAME).filter({ visible: true });

const clientTake = {
  owner: false,
  async setup(h) {
    await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' });
    await h.page.locator('#bk-services').waitFor({ state: 'visible', timeout: 15000 });
  },
  async play(h) {
    const page = h.page, t0 = Date.now(), mark = (k) => { marks.client[k] = (Date.now() - t0) / 1000; };
    mark('open'); await pause(1100);
    await h.glide(page.locator('#bk-services'), 900); await pause(700);
    mark('services');
    await h.tap(page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });
    await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
    mark('days'); await pause(1200);
    const weekdays = page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
    const want = israelDom(1), today = israelDom(0), chips = [];
    for (let i = 0; i < Math.min(await weekdays.count(), 14); i++) {
      const dom = +(await weekdays.nth(i).evaluate((el) => (el.parentElement.innerText.match(/\d+/) || [])[0]));
      if (dom) chips.push({ i, dom, ahead: (dom - today + 31) % 31 });
    }
    chips.sort((a, b) => (a.dom === want ? -1 : b.dom === want ? 1 : a.ahead - b.ahead));
    const slots = page.locator('button.bk-btn:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
    let chosen = null;
    for (const c of chips) {
      await h.tap(weekdays.nth(c.i), { after: 400 });
      if (await slots.first().waitFor({ timeout: 3500 }).then(() => true).catch(() => false)) { chosen = c; break; }
    }
    if (!chosen) throw new Error('no day in the next two weeks has a free time on the demo tenant');
    mark('times'); await pause(1800);
    const wanted = slots.filter({ hasText: /^10:00$/ });
    const slot = (await wanted.count()) ? wanted.first() : slots.first();
    booked.time = (await slot.innerText()).trim();
    await h.tap(slot, { after: 1000 });
    mark('picked');
    await h.tap(page.getByRole('button', { name: /המשיכי/ }), { after: 600 });
    await page.getByText('סיכום התור').waitFor({ timeout: 10000 });
    await pause(900);
    await h.type(page.getByPlaceholder('שם מלא'), NAME, { after: 300 });
    await h.type(page.getByPlaceholder('טלפון נייד'), PHONE, { after: 300 });
    await h.tap(page.locator('input[type=checkbox]'), { after: 500 });
    await h.tap(page.getByRole('button', { name: 'קביעת תור' }).last(), { after: 400 });
    await page.getByText('התור נקבע').waitFor({ timeout: 20000 });
    mark('confirmed');
    booked.when = ((await page.locator('body').innerText()).match(/נתראה ב([^\n]+)/)?.[1] || '').trim();
    log(`booked: ${NAME} - ${booked.when} (picked ${booked.time})`);
    await pause(3000);
    mark('end');
  },
};

const ownerTake = {
  owner: true,
  async setup(h) {
    const page = h.page;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await h.nav('יומן').waitFor({ state: 'visible', timeout: 20000 });
    await h.tap(h.nav('יומן'), { before: 100, after: 700 });
    const day = (booked.when.match(/\d{1,2}\/\d{1,2}/) || [])[0];
    if (!day) throw new Error(`could not read the booked date from "${booked.when}"`);
    for (let i = 0; i < 21 && !(await page.getByText(day).first().isVisible().catch(() => false)); i++) {
      await h.tap(page.locator('button[aria-label="יום הבא"]'), { before: 80, after: 220 });
    }
    await seen(h).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error(`the appointment for ${NAME} is not in the calendar on the day she booked`); });
    await pause(300);
  },
  async play(h) {
    const row = seen(h).first(), t0 = Date.now();
    await h.glide(row, 700);
    await row.evaluate((el) => { const c = el.closest('div:has(button)') || el.parentElement; c.style.transition = 'box-shadow .5s'; c.style.boxShadow = '0 0 0 3px #E9A9A1'; setTimeout(() => { c.style.boxShadow = ''; }, 4200); });
    marks.owner.ringed = (Date.now() - t0) / 1000;
    await pause(4500);
    marks.owner.end = (Date.now() - t0) / 1000;
  },
};

const browser = await openBrowser();
try {
  log(`site: ${BASE}   client: ${NAME}`);
  const a = await recordTake(browser, path.join(DIR, 'client'), { ...clientTake, label: 'reel-client' });
  const b = await recordTake(browser, path.join(DIR, 'owner'), { ...ownerTake, label: 'reel-owner' });
  const ai = [...a.aiCalls, ...b.aiCalls];
  if (ai.length) throw new Error(`the recording touched an AI route:\n  ${ai.join('\n  ')}`);
  fs.copyFileSync(a.file, path.join(DIR, 'client.webm')); fs.copyFileSync(b.file, path.join(DIR, 'owner.webm'));
  fs.writeFileSync(path.join(DIR, 'marks.json'), JSON.stringify({ trim: { client: a.trim, owner: b.trim }, marks, name: NAME }, null, 1));
  log(`done; marks ${JSON.stringify(marks)} trims ${a.trim.toFixed(2)} / ${b.trim.toFixed(2)}`);
} finally { await browser.close(); }
