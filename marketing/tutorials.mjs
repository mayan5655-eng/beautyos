// marketing/tutorials.mjs
//
// Two short tutorial videos for NEW users (sent to every signup on WhatsApp), recorded from the real app against the cosmetics demo
// tenant at phone size, one short Hebrew caption per screen:
//
//   tour      every main screen: today, calendar, clients, client card, messages, payments, income, content, settings, booking page
//   booking   how she books an appointment in the app, and how a client books herself on her public booking page
//
//   node tutorials.mjs                  both videos
//   node tutorials.mjs booking          just one (tour | booking)
//   node tutorials.mjs --stitch-only    re-join the parts already recorded in out/tutorials/<video>/
//
// Output (out/tutorials/, git-ignored): kalmea-tutorial-<video>.mp4 - 720x1280, 30 fps, H.264 main + AAC silence, small enough for
// WhatsApp (its media limit is 16 MB; the script fails above 15 MB). The parts are kept in out/tutorials/<video>/ for re-stitching.
//
// Same rules as tour.mjs and walkthrough.mjs (from real mistakes):
//  - Real screens only, demo tenant only. A step that stops working throws with its name and leaves out/failure-*.png.
//  - No AI call: recordTake aborts on any non-GET to an AI route. "שלחי" buttons are never tapped: the demo sends nothing.
//  - Captions are drawn by Chromium in the brand font, two short lines each with the break chosen here (never auto-wrapped), and no
//    digits, so no bidi rule can reorder anything.
//  - The booking video writes two appointments on the demo tenant (one from the app, one from the booking page). The nightly reset
//    (02:00 UTC) wipes them; do not run it across the reset.
//  - Look at the contact sheet the script writes (out/tutorials/<video>-sheet.png) before sending a new version to anyone.

import fs from 'node:fs';
import path from 'node:path';
import {
  BASE, DEMO_TENANT, OUT, log, pause, openBrowser, recordTake, renderCard, ff, duration, probeCodecs,
} from './lib.mjs';

const which = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const stitchOnly = process.argv.includes('--stitch-only');
const MAX_MB = 15;

// ── helpers (as in walkthrough.mjs) ─────────────────────────────────────────────────────────
const hold = (t0, ms) => pause(Math.max(0, ms - (Date.now() - t0)));
const home = async (h) => {
  await h.page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await h.nav('יומן').waitFor({ state: 'visible', timeout: 20000 });
  await pause(500);
};
const goto = (label) => async (h) => { await home(h); await h.tap(h.nav(label), { before: 200, after: 900 }); };
const button = (h, re) => h.page.locator('button:visible', { hasText: re }).first();
const text = (h, re, opts = {}) => h.page.getByText(re, opts).filter({ visible: true }).first();
const openSettings = async (h) => { await home(h); await h.tap(h.page.locator('button[aria-label="הגדרות"]').first(), { before: 200, after: 1500 }); };
// one caption: two lines, the break is ours ("\n"), shown ~0.5 s in, held for most of the scene
const cap = (h, t, o = {}) => h.tip(t, { at: 'bottom', delay: 500, hold: 5600, ...o });
const ring = (loc, ms = 4000) => loc.evaluate((el, ms) => {
  const c = el.closest('div:has(button)') || el.parentElement;
  c.style.transition = 'box-shadow .4s'; c.style.boxShadow = '0 0 0 3px #E9A9A1'; setTimeout(() => { c.style.boxShadow = ''; }, ms);
}, ms);
const israelDom = (n) => +new Date(Date.now() + n * 864e5).toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' });
const SCENE = 6800; // ms per screen in the tour

// a different made-up client each run (the same phone would attach to the same record). Obviously fake phones.
const FIRST = ['אביגיל', 'גילי', 'דורית', 'חן', 'ורד', 'זהבה', 'ליאור', 'ענבל', 'פנינה', 'צליל', 'קרן', 'תהל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'דהן', 'פרידמן', 'אשכנזי', 'ביטון', 'גולן', 'חזן', 'טל', 'שמעוני', 'רוזן'];
const pick = Math.floor(Date.now() / 60000) % (FIRST.length * LAST.length);
const NAME = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)]}`;
const PHONE = `050000${String(1000 + pick).padStart(4, '0')}`;

// a screen: one recorded take, one caption
const screen = (id, caption, setup, act = async () => {}, { owner = true, at } = {}) => ({
  id, owner, setup,
  async play(h) { const t0 = Date.now(); cap(h, caption, at ? { at } : {}); await act(h); await hold(t0, SCENE); },
});

// ── video A: the tour ─────────────────────────────────────────────────────────────────────
const TOUR = [
  { id: 'open', card: { kicker: 'ברוכה הבאה לקלמיה', title: 'סיור קצר<br>בכל המסכים', sub: 'כל מה שיש לך במערכת' }, seconds: 3.2 },
  screen('today', 'מסך הבית: התורים\nוההכנסות של היום', home, async (h) => { await pause(2600); await h.scrollBy(520, 1800); }),
  screen('calendar', 'היומן שלך,\nביום או בשבוע שלם', goto('יומן'), async (h) => {
    await pause(2600); await h.tap(button(h, /^שבוע$/), { before: 200, after: 1200 });
  }),
  screen('clients', 'כל הלקוחות שלך,\nבמקום אחד', goto('לקוחות'), async (h) => { await pause(2400); await h.scrollBy(480, 1800); }),
  screen('client-card', 'לכל לקוחה כרטיס,\nעם כל הטיפולים שלה',
    async (h) => { await goto('לקוחות')(h); await h.tap(text(h, 'ליה דהן', { exact: true }), { before: 200, after: 1500 }); },
    async (h) => { await h.tap(button(h, /^היסטוריה/), { before: 1800, after: 800 }); }),
  screen('messages', 'תזכורות ללקוחות,\nמוכנות לשליחה',
    async (h) => { await goto('לקוחות')(h); await h.tap(button(h, /^הודעות$/), { before: 200, after: 1300 }); },
    async (h) => { await pause(2600); await h.scrollBy(260, 1500); }), // "שלחי" is never tapped
  screen('payments', 'רושמים כל תשלום,\nוההכנסות מסודרות', goto('תשלום'), async (h) => { await pause(2400); await h.scrollBy(480, 1800); }),
  screen('income', 'סיכום ההכנסות\nשלך, לפי חודש',
    async (h) => { await goto('תשלום')(h); await h.tap(text(h, /סיכום הכנסות ודוחות/), { before: 200, after: 1400 }); },
    async (h) => {
      const monthly = button(h, /^חודשי$/);
      if (!(await monthly.count())) throw new Error('income: no month picker on the income summary (is the demo seed on a licensed status?)');
      await h.tap(monthly, { before: 1400, after: 800 });
      const body = await h.page.evaluate(() => document.body.innerText);
      if (/התחילי בחינם|שדרגי|שדרוג/.test(body)) throw new Error('income: a trial / upgrade prompt is in frame');
    }, { at: 'top' }), // at the bottom it sits on the figures (tour.mjs)
  screen('content', 'פוסטים ועיצובים מוכנים,\nבצבעים של העסק', goto('תוכן'), async (h) => {
    await pause(1800); await h.tap(button(h, /^תבניות/), { before: 300, after: 900 }); await h.scrollBy(330, 1500);
  }),
  screen('services', 'בהגדרות: השירותים\nוהמחירים שלך', openSettings, async (h) => {
    await h.tap(button(h, /^יומן ושירותים$/), { before: 1000, after: 900 });
  }),
  screen('branding', 'הדף שלך: הכתובת,\nהצבעים והמיתוג',
    async (h) => { await openSettings(h); await h.tap(button(h, /^הדף שלי$/), { before: 200, after: 1200 }); },
    async (h) => {
      await pause(1800);
      const color = text(h, /^צבע ראשי$/);
      if (await color.count()) await h.glide(color, 1400); else await h.scrollBy(420, 1500);
    }),
  screen('booking-page', 'ודף קביעת התורים שלך,\nשאותו שולחים ללקוחות',
    async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ state: 'visible', timeout: 15000 }); await pause(400); },
    async (h) => { await pause(2400); await h.glide(h.page.locator('#bk-services'), 1500); }, { owner: false }),
  { id: 'end', card: { title: 'את מוכנה<br>להתחיל', sub: 'בהצלחה!<br>kalmea.app' }, seconds: 3.5 },
];

// ── video B: booking ──────────────────────────────────────────────────────────────────────
const inApp = {
  id: 'in-app', owner: true, setup: goto('יומן'),
  async play(h) {
    const page = h.page;
    cap(h, 'ביומן, לוחצים\nעל "תור חדש"', { hold: 3600 });
    await pause(1600);
    await h.tap(button(h, /תור חדש/), { before: 300, after: 900 });
    cap(h, 'בוחרים לקוחה,\nשעה וטיפול', { delay: 200, hold: 9000 });
    // the client: type the start of her name, tap her in the list under the box
    const who = page.getByPlaceholder('שם הלקוחה או טלפון');
    await h.type(who, 'ליה', { after: 900 });
    const match = page.locator('.sheet-backdrop').getByText('ליה דהן', { exact: true }).filter({ visible: true }).first(); // she may also be in the calendar behind it
    await match.waitFor({ timeout: 8000 }).catch(() => { throw new Error('in-app: "ליה דהן" did not come up under the client box'); });
    await h.tap(match, { before: 200, after: 800 });
    // the treatment first (its length decides which times are free), then a time the sheet does not mark taken
    await h.tap(button(h, /^ניקוי פנים עמוק$/), { before: 300, after: 900 });
    const sel = page.locator('select:visible').filter({ has: page.locator('option', { hasText: /^\d\d:\d\d/ }) }).first();
    await sel.waitFor({ timeout: 8000 });
    for (let i = 0; i < 40 && !(await sel.locator('option').evaluateAll((os) => os.some((o) => /תפוס/.test(o.textContent || '')))); i++) await pause(150);
    const free = (await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent || '' })))).filter((o) => /^\d\d:\d\d/.test(o.t) && !/תפוס|מחוץ/.test(o.t));
    if (!free.length) throw new Error('in-app: no free time today in the sheet');
    const time = (free.find((o) => /^1[6-8]:/.test(o.t)) || free[free.length - 1]);
    const sb = await sel.boundingBox();
    await page.evaluate(([x, y]) => window.__finger && window.__finger(x, y), [sb.x + sb.width / 2, sb.y + sb.height / 2]); await pause(700);
    await sel.selectOption(time.v); await pause(900);
    await page.evaluate(() => window.__fingerOff && window.__fingerOff());
    if (await page.getByText(/השעה תפוסה/).filter({ visible: true }).count()) throw new Error(`in-app: ${time.t} turned out taken`);
    if ((await sel.inputValue()) !== time.v) throw new Error(`in-app: the time did not stay on ${time.t} (now ${await sel.inputValue()})`);
    await pause(600);
    cap(h, 'שומרים, והתור\nכבר ביומן', { delay: 300, hold: 5200 });
    await h.tap(button(h, /שמירה/), { before: 500, after: 1400 });
    const row = page.getByText('ליה דהן').filter({ visible: true });
    const slot = time.t.slice(0, 5);
    const mine = page.locator('div', { hasText: slot }).filter({ has: row }).last();
    await mine.waitFor({ timeout: 10000 }).catch(() => { throw new Error(`in-app: the new appointment (${slot}) is not in the calendar after saving`); });
    log(`   in-app: ליה דהן at ${slot}, today`);
    const theRow = mine.getByText('ליה דהן').first(); // the card at the time just saved (an earlier run may have left another one today)
    await h.glide(theRow, 800); await ring(theRow);
    await pause(3200);
  },
};
const selfBook = {
  id: 'self', owner: false,
  setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ state: 'visible', timeout: 15000 }); await pause(400); },
  async play(h) {
    const page = h.page;
    cap(h, 'זה הדף שלך.\nהלקוחה בוחרת טיפול', { hold: 4600 });
    await pause(1000); await h.glide(page.locator('#bk-services'), 1100); await pause(1600);
    await h.tap(page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });
    await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
    cap(h, 'היא רואה רק שעות פנויות,\nובוחרת יום ושעה', { delay: 200, hold: 5600 });
    const weekdays = page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
    const today = israelDom(0), chips = [];
    for (let i = 0; i < Math.min(await weekdays.count(), 14); i++) {
      const dom = +(await weekdays.nth(i).evaluate((el) => (el.parentElement.innerText.match(/\d+/) || [])[0]));
      if (dom) chips.push({ i, dom, ahead: (dom - today + 31) % 31 });
    }
    chips.sort((a, b) => (a.ahead === 0) - (b.ahead === 0) || a.ahead - b.ahead); // not today: the in-app take just used today
    const slots = page.locator('button.bk-btn:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
    let chosen = null;
    for (const c of chips) {
      await h.tap(weekdays.nth(c.i), { after: 400 });
      if (await slots.first().waitFor({ timeout: 3500 }).then(() => true).catch(() => false)) { chosen = c; break; }
    }
    if (!chosen) throw new Error('self: no day in the next two weeks has a free time on the demo tenant');
    await pause(1200);
    const slot = slots.filter({ hasText: /^(11:00|11:30|12:00|12:30)$/ });
    await h.tap((await slot.count()) ? slot.first() : slots.first(), { after: 900 });
    await h.tap(page.getByRole('button', { name: /המשיכי/ }), { after: 600 });
    await page.getByText('סיכום התור').waitFor({ timeout: 10000 });
    cap(h, 'ממלאת שם וטלפון,\nומאשרת', { delay: 200, hold: 5600 });
    await pause(700);
    await h.type(page.getByPlaceholder('שם מלא'), NAME, { after: 300 });
    await h.type(page.getByPlaceholder('טלפון נייד'), PHONE, { after: 300 });
    await h.tap(page.getByRole('checkbox', { name: 'אישור שמירת הפרטים' }), { after: 500 }); // the marketing opt-in next to it stays unticked
    await h.tap(page.getByRole('button', { name: 'קביעת תור' }).last(), { after: 400 });
    await page.getByText('התור נקבע').waitFor({ timeout: 20000 });
    log(`   self: ${NAME} - ${((await page.locator('body').innerText()).match(/נתראה ב([^\n]+)/)?.[1] || '').trim()}`);
    cap(h, 'התור נקבע, ונכנס\nליומן שלך לבד', { delay: 400, hold: 4400 });
    await pause(5200);
  },
};
const BOOKING = [
  { id: 'open', card: { kicker: 'מדריך קצר', title: 'איך קובעים<br>תור', sub: 'ביומן שלך, או לבד<br>בדף קביעת התורים' }, seconds: 3.2 },
  inApp,
  { id: 'mid', card: { kicker: 'ועכשיו', title: 'הלקוחה<br>קובעת לבד', sub: 'בדף קביעת התורים שלך' }, seconds: 2.8 },
  selfBook,
  { id: 'end', card: { title: 'זהו,<br>ככה פשוט', sub: 'kalmea.app' }, seconds: 3 },
];

const VIDEOS = { tour: TOUR, booking: BOOKING };

// ── ffmpeg: 720x1280, H.264 main + AAC silence (WhatsApp and Instagram both take it) ─────────
const NORM = 'fps=30,scale=720:1280:flags=lanczos:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,format=yuv420p';
const AV = ['-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '23', '-r', '30',
  '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-shortest'];
const SILENCE = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
const takeToClip = (webm, trim, mp4) => ff(['-ss', Math.max(0, trim - 0.1).toFixed(2), '-i', webm, ...SILENCE, '-vf', NORM, '-map', '0:v', '-map', '1:a', ...AV, mp4]);
const stillToClip = (png, secs, mp4) => ff(['-loop', '1', '-framerate', '30', '-t', String(secs), '-i', png, ...SILENCE, '-vf', NORM, '-map', '0:v', '-map', '1:a', ...AV, mp4]);
function join(files, mp4, FADE = 0.4) {
  const lens = files.map(duration);
  let graph = '', prev = '[0:v]', acc = lens[0];
  for (let i = 1; i < files.length; i++) {
    const out = i === files.length - 1 ? '[v]' : `[x${i}]`;
    graph += `${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${(acc - FADE).toFixed(3)}${out};`;
    prev = out; acc += lens[i] - FADE;
  }
  ff([...files.flatMap((f) => ['-i', f]), ...SILENCE, '-filter_complex', graph.replace(/;$/, ''), '-map', '[v]', '-map', `${files.length}:a`, ...AV, mp4]);
  return duration(mp4);
}

// ── run ───────────────────────────────────────────────────────────────────────────────────
const root = path.join(OUT, 'tutorials');
const names = which.length ? which : Object.keys(VIDEOS);
for (const n of names) if (!VIDEOS[n]) { console.error(`[tour] unknown video "${n}" (tour | booking)`); process.exit(1); }

let exit = 0, browser;
try {
  browser = await openBrowser();
  for (const n of names) {
    const dir = path.join(root, n);
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    for (const [i, seg] of VIDEOS[n].entries()) {
      const mp4 = path.join(dir, `${String(i + 1).padStart(2, '0')}-${seg.id}.mp4`);
      files.push(mp4);
      if (stitchOnly) { if (!fs.existsSync(mp4)) throw new Error(`missing ${mp4}: record first`); continue; }
      log(`${n} / ${seg.id}`);
      if (seg.card) {
        const png = mp4.replace(/\.mp4$/, '.png');
        await renderCard(browser, png, seg.card);
        stillToClip(png, seg.seconds, mp4);
        continue;
      }
      const raw = path.join(OUT, 'parts', `tut-${n}-${seg.id}`);
      fs.rmSync(raw, { recursive: true, force: true });
      const setup = async (h) => {
        await h.page.addInitScript(() => {
          window.__hideDemoBanner = true;
          // our line breaks, never the browser's: the caption keeps the "\n" in it and does not wrap on its own
          addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#__tip .t{white-space:pre}'; document.documentElement.appendChild(s); });
        });
        await seg.setup(h);
      };
      const take = await recordTake(browser, raw, { owner: seg.owner, setup, play: seg.play, label: `${n}-${seg.id}` });
      if (take.aiCalls.length) throw new Error(`"${seg.id}" touched an AI route, which it must never do:\n  ${take.aiCalls.join('\n  ')}`);
      takeToClip(take.file, take.trim, mp4);
      log(`   ${duration(mp4).toFixed(1)} s`);
    }
    const final = path.join(root, `kalmea-tutorial-${n}.mp4`);
    const secs = join(files, final);
    const mb = fs.statSync(final).size / 1048576, p = probeCodecs(final);
    log(`${n}: ${secs.toFixed(1)} s, ${mb.toFixed(1)} MB -> ${final}`);
    log(`   video: ${p.video}`);
    log(`   audio: ${p.audio}`);
    if (!/h264/.test(p.video) || !/aac/.test(p.audio) || !p.decodes) { console.error(`[tour] CODEC PROBLEM in ${final} ${p.decodeErr}`); exit = 1; }
    if (mb > MAX_MB) { console.error(`[tour] ${final} is ${mb.toFixed(1)} MB, over ${MAX_MB} MB (WhatsApp's limit is 16 MB): raise -crf`); exit = 1; }
    // a frame every 2 s, for looking before it goes anywhere
    ff(['-i', final, '-vf', 'fps=1/2,scale=216:-1,tile=8x6', '-frames:v', '1', path.join(root, `${n}-sheet.png`)]);
  }
} catch (e) {
  console.error(`[tour] ${e.message}`);
  exit = 1;
} finally {
  if (browser) await browser.close();
}
process.exit(exit);
