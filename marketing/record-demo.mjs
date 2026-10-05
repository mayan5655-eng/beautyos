// marketing/record-demo.mjs
//
// The product story as ONE real screen recording, driven by Playwright against the live demo
// tenant, written as mp4 (Instagram) and webm. Phone shape, human pacing, short Hebrew captions
// for a voice-over, no AI anywhere in it.
//
//   npm run record
//
// The story is a single thread - a client picks a time, and THAT time is in her calendar:
//   1. the day picker: only the hours she is free (closed days are not offered, taken times are
//      greyed out) - "רק השעות שאת פנויה בהן. בלי לבדוק, בלי להתנגש"
//   2. she books, the time she picked visible all the way             - "היא בוחרת לבד. בלי עשרים הודעות"
//   3. CUT STRAIGHT to her calendar, that same day, that exact appointment, ringed - "נכנס ליומן שלך לבד"
//   4. the reminder for tomorrow, ready in the message center           - "התזכורת מוכנה. לחיצה אחת"
//   5. the till: the payment confirmation is ready                      - "אישור תשלום מוכן ברגע"
//   6. the posts tab: ready-made posts, no AI
//
// She books TOMORROW (the reminder list is tomorrow's appointments). The time is 10:00 when it is
// free, else the first free time. Nothing here is faked: if a step stops working the script throws
// with its name and leaves out/failure-*.png, and the AI-route guard aborts the run on any
// non-GET request to an AI route. The "שלחי" buttons are never tapped (a demo sends nothing).
//
// Output (out/, git-ignored): kalmea-demo.mp4 (H.264, yuv420p, 30 fps, 1080x1920, +faststart),
// kalmea-demo.webm, parts/ (the two raw takes). Best run right after the 02:00 UTC demo reset:
// every run books one real appointment and registers one payment on the demo tenant.

import fs from 'node:fs';
import path from 'node:path';
import {
  BASE, DEMO_TENANT, OUT, log, pause, openBrowser, recordTake, finishClip, stitch, ff,
} from './lib.mjs';

const TARGET = { min: 40, max: 60 }; // seconds, the brief
const WANT_TIME = process.env.KALMEA_DEMO_TIME || '10:00';

// A different client each run (144 combinations, picked by the minute): the same phone would attach
// to the same client record. First names the demo seed does not use. Obviously fake phones.
const FIRST = ['אביגיל', 'גילי', 'דורית', 'חן', 'ורד', 'זהבה', 'ליאור', 'ענבל', 'פנינה', 'צליל', 'קרן', 'תהל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'דהן', 'פרידמן', 'אשכנזי', 'ביטון', 'גולן', 'חזן', 'טל', 'שמעוני', 'רוזן'];
const pick = Math.floor(Date.now() / 60000) % (FIRST.length * LAST.length);
const NAME = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)]}`;
const PHONE = `050000${String(1000 + pick).padStart(4, '0')}`;

const israelDom = (offsetDays) => +new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' });

const booked = { when: '', time: '', day: '' };
const button = (h, re) => h.page.locator('button:visible', { hasText: re }).first();
const seen = (h) => h.page.getByText(NAME).filter({ visible: true });
const ring = (loc) => loc.evaluate((el) => { // a soft ring, so the eye finds the row
  const card = el.closest('div:has(button)') || el.parentElement;
  card.style.transition = 'box-shadow .4s'; card.style.boxShadow = '0 0 0 3px #E9A9A1';
  setTimeout(() => { card.style.boxShadow = ''; }, 3600);
});

// ── take 1: the client ─────────────────────────────────────────────────────────────────
const clientTake = {
  owner: false,
  async setup(h) {
    await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' });
    await h.page.locator('#bk-services').waitFor({ state: 'visible', timeout: 15000 });
  },
  async play(h) {
    const page = h.page;
    await pause(900);
    await h.glide(page.locator('#bk-services'), 800); await pause(600);
    await h.tap(page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });

    // 1. THE DAY PICKER - held on, with the point of it said out loud
    await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
    await h.say('רק השעות שאת פנויה בהן. בלי לבדוק, בלי להתנגש');
    await pause(1600);
    // tomorrow first (the reminder list is tomorrow's); else the nearest day with a free time
    const weekdays = page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
    const want = israelDom(1), today = israelDom(0);
    const chips = [];
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
    if (chosen.dom !== want) log(`  note: tomorrow has no free time; booked day ${chosen.dom} instead, so the reminder beat will be skipped`);
    await pause(2200); // the grid: free times, taken ones greyed out

    // 2. THE BOOKING - the time she picked stays on screen
    await h.say('היא בוחרת לבד. בלי עשרים הודעות');
    const wanted = slots.filter({ hasText: new RegExp(`^${WANT_TIME}$`) });
    const slot = (await wanted.count()) ? wanted.first() : slots.first();
    booked.time = (await slot.innerText()).trim();
    booked.day = String(chosen.dom);
    await h.tap(slot, { after: 900 });
    await h.tap(page.getByRole('button', { name: /המשיכי/ }), { after: 600 });
    await page.getByText('סיכום התור').waitFor({ timeout: 10000 }); // date and time, read back to her
    await pause(1100);
    await h.type(page.getByPlaceholder('שם מלא'), NAME, { after: 300 });
    await h.type(page.getByPlaceholder('טלפון נייד'), PHONE, { after: 300 });
    await h.tap(page.locator('input[type=checkbox]'), { after: 500 });
    await h.tap(page.getByRole('button', { name: 'קביעת תור' }).last(), { after: 400 });
    await page.getByText('התור נקבע').waitFor({ timeout: 20000 });
    booked.when = ((await page.locator('body').innerText()).match(/נתראה ב([^\n]+)/)?.[1] || '').trim();
    log(`booked: ${NAME} - ${booked.when} (picked ${booked.time})`);
    await pause(2200);
    await h.hush();
  },
};

// ── take 2: her side. Setup is TRIMMED OFF: the clip opens already on that day in her calendar ──
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
    await seen(h).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      throw new Error(`the appointment for ${NAME} is not in the calendar on the day she booked`);
    });
    await pause(300);
  },
  async play(h) {
    const page = h.page;
    // 3. THE CALENDAR - that day, that appointment, that time
    const row = seen(h).first();
    await h.glide(row, 600);
    await h.say('נכנס ליומן שלך לבד');
    await ring(row);
    log(`calendar: ${NAME} at ${booked.time} (booked ${booked.when})`);
    await pause(3600);

    // 4. THE REMINDER - tomorrow's list in the message center, her client in it, "שלחי" never tapped
    if (booked.day && +booked.day === israelDom(1)) {
      await h.tap(h.nav('לקוחות'), { after: 700 });
      await h.tap(button(h, /^הודעות$/), { after: 1100 });
      const mine = page.getByText(NAME).filter({ visible: true }).first();
      await mine.waitFor({ timeout: 15000 }).catch(() => { throw new Error("the booked client is not in tomorrow's reminder list"); });
      await h.glide(mine, 700);
      await h.say('התזכורת מוכנה. לחיצה אחת');
      await ring(mine);
      await pause(3000);
    } else {
      log('  reminder beat skipped: the booking is not for tomorrow');
    }

    // 5. THE TILL - the confirmation is ready the moment it is registered
    await h.hush();
    await h.tap(h.nav('תשלום'), { after: 800 });
    await h.tap(button(h, /תשלום חדש/), { after: 700 });
    const who = page.getByPlaceholder('חיפוש לקוחה...');
    await h.type(who, NAME, { after: 600 }); // one match; tap the row under the box (the name also sits in the list behind the sheet)
    const box = await who.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 36); await pause(700);
    const select = page.locator('select:visible').first();
    await select.waitFor({ timeout: 8000 });
    await select.selectOption({ index: 1 }); await pause(700);
    await h.tap(page.locator('button:visible', { hasText: '◦ ביט' }), { after: 600 });
    await h.tap(page.getByRole('button', { name: /רשמי תשלום/ }), { after: 300 });
    await page.getByText('אינו קבלה או חשבונית מס').waitFor({ state: 'visible', timeout: 20000 });
    await h.say('אישור תשלום מוכן ברגע');
    await pause(2600);
    await h.tap(page.getByRole('button', { name: 'סגירה' }), { after: 600 });
    await seen(h).first().waitFor({ timeout: 15000 }).catch(() => { throw new Error('the payment did not show up in the list after registering it'); });

    // 6. THE POSTS - the default tab, ready-made, no AI
    await h.hush();
    await h.tap(h.nav('תוכן'), { after: 1100 });
    await page.getByText('מה מפרסמים השבוע').waitFor({ timeout: 15000 });
    await h.glide(page.getByText('מה מפרסמים השבוע'), 700); await pause(1500);
    await h.hush();
  },
};

// ── run ───────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(path.join(OUT, 'parts'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'parts'), { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^failure-/.test(f)) fs.rmSync(path.join(OUT, f));

let browser, exit = 0;
try {
  browser = await openBrowser();
  log(`site: ${BASE}   client: ${NAME}`);
  const a = await recordTake(browser, path.join(OUT, 'parts', 'client'), { ...clientTake, label: 'demo-client' });
  const b = await recordTake(browser, path.join(OUT, 'parts', 'owner'), { ...ownerTake, label: 'demo-owner' });
  await browser.close(); browser = null;
  const ai = [...a.aiCalls, ...b.aiCalls];
  if (ai.length) throw new Error(`the recording touched an AI route, which it must never do:\n  ${ai.join('\n  ')}`);

  const cA = path.join(OUT, 'parts', 'client.mp4'), cB = path.join(OUT, 'parts', 'owner.mp4');
  finishClip(a.file, a.trim, cA); finishClip(b.file, b.trim, cB);
  const mp4 = path.join(OUT, 'kalmea-demo.mp4');
  const seconds = stitch([cA, cB], mp4);
  ff(['-i', mp4, '-c:v', 'libvpx', '-crf', '8', '-b:v', '6M', '-pix_fmt', 'yuv420p', '-an', path.join(OUT, 'kalmea-demo.webm')]);
  fs.copyFileSync(a.file, path.join(OUT, 'parts', 'client.webm')); fs.copyFileSync(b.file, path.join(OUT, 'parts', 'owner.webm'));

  const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
  log(`done: ${seconds.toFixed(1)} s`);
  log(`  ${mp4}  (${mb(mp4)} MB)  <- upload this one to Instagram`);
  log(`  ${path.join(OUT, 'kalmea-demo.webm')}  (${mb(path.join(OUT, 'kalmea-demo.webm'))} MB)`);
  if (seconds < TARGET.min || seconds > TARGET.max) {
    console.error(`[tour] WARNING: ${seconds.toFixed(1)} s is outside the ${TARGET.min}-${TARGET.max} s brief - adjust the pauses in record-demo.mjs`);
    exit = 2;
  }
} catch (e) {
  console.error(`[tour] ${e.message}`);
  exit = 1;
} finally {
  if (browser) await browser.close();
}
process.exit(exit);
