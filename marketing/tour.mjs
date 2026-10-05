// marketing/tour.mjs
//
// One short clip per screen of the product, and the same clips stitched into one tour with a
// title card between chapters. Phone shape, human pacing, no AI call anywhere, short Hebrew
// captions in the brand font for a voice-over to be recorded on top of.
//
//   npm run tour                      all ten clips + the stitched tour
//   npm run tour -- --only=today,calendar     just those clips (no stitch)
//   npm run tour -- --stitch-only     re-stitch the clips already in out/clips
//
// Output (out/, git-ignored):
//   clips/NN-<id>.mp4     one per screen, 1080x1920, H.264, 30 fps, no audio
//   kalmea-tour.mp4       title card + clip, chapter by chapter, cross-faded
//   parts/<id>/           the raw Playwright takes (webm)
//
// Run it right after the 02:00 UTC demo reset so the data is clean: several clips act on the
// demo tenant (a payment is registered), and the nightly reset clears it.
//
// Captions: say(text) swaps the caption on screen; the pauses decide how long it is read. They are
// drawn by the page in the brand font, so Hebrew is shaped by Chromium. Keep them to one short line.

import fs from 'node:fs';
import path from 'node:path';
import {
  BASE, DEMO_TENANT, OUT, VIEW, log, pause, openBrowser, recordTake,
  renderCard, finishClip, stillToClip, stitch, duration,
} from './lib.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only')?.split(',').filter(Boolean);
const stitchOnly = process.argv.includes('--stitch-only');
const LEN = { min: 15, max: 25 }; // seconds per clip, the brief

// ── getting to a screen (trimmed off the clip: each clip starts already there) ──────────
const home = async (h) => {
  await h.page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await h.nav('יומן').waitFor({ state: 'visible', timeout: 20000 });
  await pause(500);
};
const goto = (label) => async (h) => { await home(h); await h.tap(h.nav(label), { before: 200, after: 900 }); };
const text = (h, re, opts = {}) => h.page.getByText(re, opts).filter({ visible: true }).first();
const button = (h, re) => h.page.locator('button:visible', { hasText: re }).first();

// ── the clips ──────────────────────────────────────────────────────────────────────────
export const CLIPS = [
  {
    id: 'today', title: 'היום', sub: 'כל היום שלך במבט אחד',
    setup: home,
    async play(h) {
      await h.say('היום שלך, במבט אחד'); await pause(2300);
      await h.say('כמה נכנס היום'); await pause(2500);
      await h.scrollBy(430, 1100); await h.say('מי מגיעה ומתי'); await pause(2800);
      await h.scrollBy(430, 1100); await h.say('ומה מחכה לתשומת לב שלך'); await pause(3000);
      await h.scrollBy(-900, 1300); await h.hush(); await pause(1500);
    },
  },
  {
    id: 'calendar', title: 'יומן', sub: 'התורים שלך, יום ושבוע',
    setup: goto('יומן'),
    async play(h) {
      await h.say('היומן שלך'); await pause(2200);
      await h.say('מעבר בין ימים בנגיעה');
      await h.tap(h.page.locator('button[aria-label="יום הבא"]'), { before: 300, after: 900 });
      await h.tap(h.page.locator('button[aria-label="יום הבא"]'), { before: 200, after: 1100 });
      await h.say('תצוגת שבוע, כשצריך תמונה רחבה');
      await h.tap(button(h, /^שבוע$/), { after: 3200 });
      await h.say('וחוזרים ליום');
      await h.tap(button(h, /^יום$/), { after: 1200 });
      await h.say('תור חדש בכמה נגיעות');
      await h.tap(button(h, /תור חדש/), { after: 2600 });
      await h.say('בוחרים טיפול ומשך'); await pause(2400);
      await h.page.keyboard.press('Escape'); await pause(900); await h.hush(); await pause(600);
    },
  },
  {
    id: 'clients', title: 'לקוחות', sub: 'כל מי שעברה אצלך, מסודרת',
    setup: goto('לקוחות'),
    async play(h) {
      await h.say('כל הלקוחות שלך במקום אחד'); await pause(2400);
      await h.scrollBy(520, 1200); await h.say('מי פעילה, כמה הוציאה, ומה הטיפול האחרון'); await pause(3000);
      await h.scrollBy(-800, 1200); await pause(500);
      await h.say('חיפוש לפי שם או טלפון');
      const search = h.page.getByPlaceholder(/חיפוש לפי שם/);
      await h.type(search, 'דנה', { after: 2200 });
      await search.fill(''); await pause(600);
      await h.say('ומי לא הגיעה זמן — אפשר לחזור אליה');
      await h.tap(button(h, /מזמן לא הגיעו/), { after: 3000 });
      await h.page.keyboard.press('Escape'); await pause(700);
      await h.hush(); await pause(1200);
    },
  },
  {
    id: 'client-card', title: 'כרטיס לקוחה', sub: 'כל מה שקרה איתה, בכרטיס אחד',
    setup: async (h) => { await goto('לקוחות')(h); await h.tap(text(h, 'דנה כ.', { exact: true }), { before: 200, after: 1500 }); },
    async play(h) {
      await h.say('הכרטיס שלה — הכול במקום אחד'); await pause(2500);
      await h.say('כל הטיפולים, לפי הסדר');
      await h.tap(button(h, /^היסטוריה/), { before: 500, after: 2600 });
      await h.say('מה שילמה ומתי');
      await h.tap(button(h, /^תשלומים/), { before: 500, after: 2600 });
      await h.say('ומכאן קובעים לה תור');
      await h.tap(button(h, /^✦ קביעת תור$/), { before: 600, after: 2800 });
      await h.page.keyboard.press('Escape'); await pause(900);
      await h.hush(); await pause(900);
    },
  },
  {
    id: 'payments', title: 'תשלום', sub: 'הקופה והכנסות',
    setup: goto('תשלום'),
    async play(h) {
      await h.say('הכנסות היום והחודש, לפי אמצעי תשלום'); await pause(2800);
      await h.say('קופה — תשלום חדש');
      await h.tap(button(h, /תשלום חדש/), { after: 900 });
      const who = h.page.getByPlaceholder('חיפוש לקוחה...');
      await h.type(who, 'ליה ג', { after: 700 }); // one match: the row right under the box (the same name also sits in the list behind the sheet)
      const box = await who.boundingBox();
      await h.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 36); await pause(800);
      await h.say('בוחרים טיפול ואמצעי תשלום');
      const select = h.page.locator('select:visible').first();
      await select.waitFor({ timeout: 8000 }); await pause(400);
      await select.selectOption({ index: 1 }); await pause(900);
      await h.tap(h.page.locator('button:visible', { hasText: '◦ ביט' }), { after: 800 });
      await h.say('ורושמים');
      await h.tap(h.page.getByRole('button', { name: /רשמי תשלום/ }), { after: 600 });
      await h.page.getByText('אינו קבלה או חשבונית מס').waitFor({ state: 'visible', timeout: 20000 });
      await h.say('אישור תשלום מוכן, בלי להקליד שוב'); await pause(2800);
      await h.tap(h.page.getByRole('button', { name: 'סגירה' }), { after: 700 });
      await h.hush(); await pause(500);
    },
  },
  {
    id: 'content', title: 'תוכן', sub: 'מה מפרסמים השבוע',
    setup: goto('תוכן'), // lands on פוסטים ותבניות, the default: no AI, no Facebook
    async play(h) {
      await h.say('פוסטים מוכנים, בצבעים של העסק שלך'); await pause(2600);
      await h.scrollBy(420, 1200); await h.say('מה כדאי לפרסם השבוע'); await pause(3000);
      await h.scrollBy(-700, 1200);
      await h.say('רעיונות שנשמרו');
      await h.tap(button(h, /^רעיונות/), { after: 3000 });
      await h.say('והעיצובים שלך');
      await h.tap(button(h, /^שלי/), { after: 3000 });
      await h.hush(); await pause(900);
    },
  },
  {
    id: 'templates', title: 'תבניות', sub: 'בוחרים, משנים מילה, מורידים',
    setup: async (h) => { await goto('תוכן')(h); await h.tap(button(h, /^תבניות/), { before: 200, after: 1200 }); },
    async play(h) {
      await h.say('תבניות מוכנות, כבר בצבעים שלך'); await pause(2600);
      await h.say('חגים, מבצעים, לפני ואחרי');
      await h.tap(button(h, /^חגים ועונות$/), { after: 2200 });
      await h.tap(button(h, /^סוגרים עסקה$/), { after: 2400 });
      await h.say('בוחרים תבנית');
      await h.tap(button(h, /^פוסט 4:5$/), { before: 600, after: 400 });
      await h.page.getByText('בפוסט הזה').waitFor({ timeout: 25000 });
      await h.say('משנים מילה, והיא מוכנה'); await pause(2600);
      await h.scrollBy(380, 1200); await pause(2000);
      await h.hush(); await pause(600);
    },
  },
  {
    id: 'settings', title: 'הגדרות', sub: 'העסק שלך, בדרך שלך',
    setup: async (h) => { await home(h); await h.tap(h.page.locator('button[aria-label="הגדרות"]').first(), { before: 200, after: 1800 }); },
    async play(h) {
      await h.say('כאן מגדירים את העסק'); await pause(2400);
      await h.say('צבעים ולוגו');
      await h.tap(button(h, /^מיתוג$/), { after: 2800 });
      await h.say('שעות פעילות');
      await h.tap(button(h, /^שעות$/), { after: 2800 });
      await h.say('שירותים ומחירים');
      await h.tap(button(h, /^שירותים$/), { after: 2800 });
      await h.say('וקישור וקוד QR לקביעת תור');
      await h.tap(button(h, /^כללי$/), { after: 1200 });
      await h.glide(text(h, /הורדת ה-QR/), 1000); await pause(2400);
      await h.hush(); await pause(600);
    },
  },
  {
    id: 'booking-page', title: 'דף ההזמנות', sub: 'כך הלקוחות שלך קובעות תור',
    owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ state: 'visible', timeout: 15000 }); await pause(400); },
    async play(h) {
      await h.say('כך הלקוחות שלך רואות את העסק'); await pause(2600);
      await h.glide(h.page.locator('#bk-services'), 1100); await h.say('הטיפולים והמחירים שלך'); await pause(2400);
      await h.tap(h.page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 1100 });
      await h.say('בוחרות יום');
      await h.page.getByText('בחרי יום').waitFor({ timeout: 10000 });
      const chips = h.page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
      const slots = h.page.locator('button.bk-btn:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
      for (let i = 0; i < 6; i++) { // a day with a free time
        await h.tap(chips.nth(i), { after: 500 });
        if (await slots.first().waitFor({ timeout: 3500 }).then(() => true).catch(() => false)) break;
      }
      await pause(1200); await h.say('ושעה');
      await h.tap(slots.first(), { after: 900 });
      await h.say('ומשאירות פרטים — התור מאושר מיד');
      await h.tap(h.page.getByRole('button', { name: /המשיכי/ }), { after: 3200 }); // not submitted: nothing is booked
      await h.hush(); await pause(500);
    },
  },
  {
    id: 'skin-scan', title: 'סורק העור', sub: 'ניתוח אישי מתמונה אחת',
    owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/skin-scan?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.getByText('ניתוח עור אישי').first().waitFor({ timeout: 15000 }); await pause(400); },
    async play(h) {
      await h.say('סורק העור של העסק שלך'); await pause(3000);
      await h.say('הלקוחה מאשרת ומעלה תמונה אחת'); await h.scrollBy(380, 1300); await pause(3200);
      await h.say('ומקבלת המלצה לטיפול'); await h.scrollBy(380, 1300); await pause(3200); // the page only: no photo is uploaded, no scan runs
      await h.hush(); await pause(1500);
    },
  },
];

// ── run ───────────────────────────────────────────────────────────────────────────────────
const pad = (n) => String(n + 1).padStart(2, '0');
const clipsDir = path.join(OUT, 'clips');
const cardsDir = path.join(OUT, 'cards');
fs.mkdirSync(clipsDir, { recursive: true });
fs.mkdirSync(cardsDir, { recursive: true });

const chosen = CLIPS.map((c, i) => ({ ...c, n: i })).filter((c) => !only || only.includes(c.id));
if (only && chosen.length !== only.length) { console.error(`[tour] unknown clip in --only: ${only.filter((o) => !CLIPS.some((c) => c.id === o)).join(', ')}`); process.exit(1); }

let exit = 0;
const lengths = {};
let browser;
try {
  browser = await openBrowser();
  if (!stitchOnly) {
    for (const c of chosen) {
      log(`${pad(c.n)} ${c.id}`);
      const dir = path.join(OUT, 'parts', c.id);
      fs.rmSync(dir, { recursive: true, force: true });
      const take = await recordTake(browser, dir, { owner: c.owner !== false, setup: c.setup, play: c.play, label: c.id });
      if (take.aiCalls.length) throw new Error(`the "${c.id}" take touched an AI route, which it must never do:\n  ${take.aiCalls.join('\n  ')}`);
      const mp4 = path.join(clipsDir, `${pad(c.n)}-${c.id}.mp4`);
      lengths[c.id] = finishClip(take.file, take.trim, mp4);
      fs.copyFileSync(take.file, path.join(dir, `${c.id}.webm`));
      log(`   ${lengths[c.id].toFixed(1)} s  -> ${path.relative(process.cwd(), mp4)}`);
      if (lengths[c.id] < LEN.min || lengths[c.id] > LEN.max) { console.error(`[tour] WARNING: ${c.id} is ${lengths[c.id].toFixed(1)} s, outside ${LEN.min}-${LEN.max} s`); exit = 2; }
    }
  }

  if (!only) {
    // the tour: an opening card, then (card, clip) for every chapter, and a closing card
    log('title cards + the stitched tour');
    const parts = [];
    const card = async (name, spec, seconds) => {
      const png = path.join(cardsDir, `${name}.png`);
      await renderCard(browser, png, spec);
      const mp4 = path.join(cardsDir, `${name}.mp4`);
      stillToClip(png, seconds, mp4);
      parts.push(mp4);
    };
    await card('00-open', { title: 'סיור ב-Kalmea', sub: 'המערכת של העסק שלך, מסך אחר מסך' }, 3);
    for (const [i, c] of CLIPS.entries()) {
      const mp4 = path.join(clipsDir, `${pad(i)}-${c.id}.mp4`);
      if (!fs.existsSync(mp4)) throw new Error(`clip ${c.id} is missing: run the clips first (npm run tour)`);
      await card(`${pad(i)}-card`, { kicker: `${i + 1} מתוך ${CLIPS.length}`, title: c.title, sub: c.sub }, 2.4);
      parts.push(mp4);
    }
    await card('99-close', { title: 'הכול במקום אחד', sub: 'kalmea.app' }, 3);
    const tour = path.join(OUT, 'kalmea-tour.mp4');
    const secs = stitch(parts, tour);
    log(`tour: ${secs.toFixed(1)} s  ->  ${tour}`);
  }
} catch (e) {
  console.error(`[tour] ${e.message}`);
  exit = 1;
} finally {
  if (browser) await browser.close();
}
process.exit(exit);
