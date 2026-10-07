// marketing/walkthrough.mjs
//
// The full walkthrough: 13 chapters, 15-30 s each, a title card before each, one stitched file. For someone who is already interested and
// wants to see the whole product before paying, and for a lecture audience. A different video from the 71-second tour (tour.mjs): that one
// glances at thirteen screens; this one stays on each long enough to be understood.
//
//   node walkthrough.mjs                   all 13 chapters + the stitched walkthrough
//   node walkthrough.mjs --only=booking,calendar     just those chapters (no stitch)
//   node walkthrough.mjs --stitch-only     re-stitch the chapters already recorded
//
// Output (out/walkthrough/, git-ignored): chNN-<id>.mp4 (title card + chapter, each stands alone), clips/NN-<id>.mp4 (chapter only),
// cards/NN.mp4, kalmea-walkthrough.mp4 (everything). 1080x1920, 30 fps, H.264 baseline + AAC (silence, for the voice-over).
//
// Rules (the same as the tour, from real mistakes):
//  - Real app screens only, against the demo tenant. Nothing is mocked. A screen the demo data cannot reach is recorded as it is.
//  - The demo-account banner (a sign-up prompt) is hidden for the recording only (lib.mjs dressing). The padlock on the calendar's private-event
//    buttons is kept: it is the real app, it means "private event", not a paywall.
//  - No AI call: the guard in recordTake aborts on any non-GET to an AI route. The voice chapter shows the real voice panel; it runs a
//    command only with KALMEA_VOICE_LIVE=1 (needs a funded AI balance), and says so in its title.
//  - "שלחי" buttons are never tapped: the demo sends nothing.
//  - Writes the chapters make on the demo tenant (one booking, one move, one cancellation, one no-show) are wiped by the nightly reset.
//    Do NOT run this across the 02:00 UTC reset.

import fs from 'node:fs';
import path from 'node:path';
import {
  BASE, DEMO_TENANT, OUT, log, pause, openBrowser, recordTake, finishClipAv, stitchAv, probeCodecs, duration, renderCard, stillToClip,
} from './lib.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only')?.split(',').filter(Boolean);
const stitchOnly = process.argv.includes('--stitch-only');
const VOICE_LIVE = process.env.KALMEA_VOICE_LIVE === '1';

// ── helpers ──────────────────────────────────────────────────────────────────────────────
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
const tip = (h, t, o = {}) => h.tip(t, { at: 'bottom', hold: 4200, ...o });
const israelDom = (n) => +new Date(Date.now() + n * 864e5).toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' });
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

// a client booking made in chapter 3 and shown in chapter 4
const FIRST = ['אביגיל', 'גילי', 'דורית', 'חן', 'ורד', 'זהבה', 'ליאור', 'ענבל', 'פנינה', 'צליל', 'קרן', 'תהל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'דהן', 'פרידמן', 'אשכנזי', 'ביטון', 'גולן', 'חזן', 'טל', 'שמעוני', 'רוזן'];
const pick = Math.floor(Date.now() / 60000) % (FIRST.length * LAST.length);
const NAME = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)]}`;
const PHONE = `050000${String(1000 + pick).padStart(4, '0')}`;
const booked = { when: '', time: '' };

// the names on today's cards that still have a "לא הגיעה" button (confirmed ones), in order
const cardNames = (page) => page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button')) {
    if ((b.innerText || '').trim() !== 'לא הגיעה' || !b.offsetParent) continue;
    let el = b;
    for (let i = 0; i < 6 && el; i++) { el = el.parentElement; if (el && /\d{2}:\d{2}|·/.test(el.innerText || '') && (el.innerText || '').length < 200) break; }
    const t = ((el && el.innerText) || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
    out.push(t.replace(/^✓\s*/, ''));
  }
  return out;
});

// ── the chapters ─────────────────────────────────────────────────────────────────────────
// A chapter is one or more recorded PARTS joined together; a part with `still` is a title-style closing card instead of a recording.
export const CHAPTERS = [
  { id: 'opening', title: 'מה זו קלמיה', sub: 'מערכת אחת לקוסמטיקאית העצמאית',
    parts: [{
      owner: false, ms: 21000,
      setup: async (h) => { await h.page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await pause(900); },
      async play(h) {
        const t0 = Date.now(); tip(h, 'קלמיה: המערכת של הקוסמטיקאית העצמאית', { hold: 5200 });
        await pause(6500); await h.scrollBy(620, 1800);
        tip(h, 'יומן, לקוחות, תשלומים ושיווק, במקום אחד', { delay: 500, hold: 5200 });
        await pause(6500); await h.scrollBy(620, 1800);
        tip(h, 'בעברית, ובנויה לטלפון', { delay: 500, hold: 4200 });
        await hold(t0, 21000);
      },
    }] },

  { id: 'setup', title: 'הרשמה והגדרה ראשונה', sub: 'שירותים, מחירים, שעות ומיתוג',
    parts: [{
      owner: false, ms: 8500,
      setup: async (h) => { await h.page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' }); await pause(800); },
      async play(h) { // the form is shown and never submitted: no account is created
        const t0 = Date.now(); tip(h, 'פותחים חשבון חדש בכמה שדות', { hold: 5000 });
        await pause(1400); await h.tap(h.page.locator('input:visible').first(), { before: 300, after: 500 });
        await hold(t0, 8500);
      },
    }, {
      owner: true, ms: 19500,
      setup: openSettings,
      async play(h) {
        const t0 = Date.now(); tip(h, 'מוסיפה את השירותים והמחירים שלה', { hold: 5000 });
        await h.tap(button(h, /^שירותים$/), { before: 400, after: 2600 });
        tip(h, 'קובעת את שעות הפעילות', { delay: 400, hold: 4600 });
        await h.tap(button(h, /^כללי$/), { before: 300, after: 800 });
        const hours = h.page.getByText(/שעות פעילות|שעות העבודה/).filter({ visible: true }).first();
        if (await hours.count()) await h.glide(hours, 1400);
        await pause(2200);
        tip(h, 'ומעצבת את העמוד שלה בצבעים של העסק', { delay: 400, hold: 4600 });
        await h.tap(button(h, /^מיתוג$/), { before: 300, after: 1000 });
        await h.glide(text(h, /^צבע ראשי$/), 1400);
        await hold(t0, 19500);
      },
    }] },

  { id: 'booking', title: 'דף ההזמנות, מצד הלקוחה', sub: 'מהקישור ועד התור, בלי הודעות הלוך-ושוב',
    parts: [{
      owner: false, ms: 31000,
      setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ state: 'visible', timeout: 15000 }); },
      async play(h) {
        const page = h.page, t0 = Date.now();
        tip(h, 'הלקוחה נכנסת לדף ההזמנות של העסק', { hold: 4600 });
        await pause(900); await h.glide(page.locator('#bk-services'), 1100); await pause(1800);
        tip(h, 'בוחרת טיפול, יום ושעה פנויה', { delay: 300, hold: 6000 });
        await h.tap(page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });
        await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
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
        await pause(1500);
        const wanted = slots.filter({ hasText: /^(17:30|17:00|16:30|16:00)$/ });
        const slot = (await wanted.count()) ? wanted.last() : slots.last();
        booked.time = (await slot.innerText()).trim();
        await h.tap(slot, { after: 900 });
        await h.tap(page.getByRole('button', { name: /המשיכי/ }), { after: 600 });
        await page.getByText('סיכום התור').waitFor({ timeout: 10000 });
        tip(h, 'משאירה שם וטלפון, ומאשרת', { delay: 300, hold: 6200 });
        await pause(900);
        await h.type(page.getByPlaceholder('שם מלא'), NAME, { after: 300 });
        await h.type(page.getByPlaceholder('טלפון נייד'), PHONE, { after: 300 });
        await h.tap(page.locator('input[type=checkbox]'), { after: 500 });
        await h.tap(page.getByRole('button', { name: 'קביעת תור' }).last(), { after: 400 });
        await page.getByText('התור נקבע').waitFor({ timeout: 20000 });
        booked.when = ((await page.locator('body').innerText()).match(/נתראה ב([^\n]+)/)?.[1] || '').trim();
        log(`   booked: ${NAME} - ${booked.when} (picked ${booked.time})`);
        tip(h, 'והתור נקבע: היא רואה אותו מיד על המסך', { delay: 600, hold: 5200 });
        await hold(t0, 31000);
      },
    }] },

  { id: 'calendar', title: 'התור נכנס ליומן', sub: 'מה שהקוסמטיקאית רואה',
    parts: [{
      owner: true, ms: 21000,
      setup: async (h) => {
        const page = h.page;
        if (!booked.when) throw new Error('the booking chapter has not run in this process: nothing to show in the calendar');
        await home(h); await h.tap(h.nav('יומן'), { before: 100, after: 700 });
        const day = (booked.when.match(/\d{1,2}\/\d{1,2}/) || [])[0];
        if (!day) throw new Error(`could not read the booked date from "${booked.when}"`);
        for (let i = 0; i < 21 && !(await page.getByText(day).first().isVisible().catch(() => false)); i++) await h.tap(page.locator('button[aria-label="יום הבא"]'), { before: 80, after: 220 });
        await page.getByText(new RegExp(NAME)).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 15000 });
        await pause(300);
      },
      async play(h) {
        const t0 = Date.now(); const row = h.page.getByText(new RegExp(NAME)).filter({ visible: true }).first();
        tip(h, 'התור שנקבע אונליין נכנס ליומן לבד', { hold: 5000 });
        await pause(1400); await h.glide(row, 900);
        await row.evaluate((el) => { const c = el.closest('div:has(button)') || el.parentElement; c.style.transition = 'box-shadow .5s'; c.style.boxShadow = '0 0 0 3px #E9A9A1'; setTimeout(() => { c.style.boxShadow = ''; }, 6000); });
        await pause(4600);
        tip(h, 'בלי שנגעה בו: השעה, הטיפול והלקוחה', { delay: 300, hold: 5000 });
        await pause(5200);
        tip(h, 'ואפשר לעבור לשבוע ולראות את כל התמונה', { delay: 300, hold: 4200 });
        await h.tap(button(h, /^שבוע$/), { before: 600, after: 1000 });
        await hold(t0, 21000);
      },
    }] },

  { id: 'manage-day', title: 'ניהול היום', sub: 'הזזה, ביטול ולקוחה שלא הגיעה',
    parts: [{
      owner: true, ms: 29000,
      setup: goto('יומן'),
      async play(h) {
        const page = h.page, t0 = Date.now();
        const names = await cardNames(page);
        if (names.length < 4) throw new Error(`manage-day: expected at least 4 confirmed cards today, found ${names.length} (${names.join(', ')})`);
        // 1. move one appointment to another time
        tip(h, 'מזיזה תור: פותחים אותו ובוחרים שעה חדשה', { hold: 5600 });
        await h.tap(page.getByText(new RegExp(names[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).filter({ visible: true }).first(), { before: 800, after: 1400 });
        const sel = page.locator('select:visible').filter({ has: page.locator('option', { hasText: /^\d\d:\d\d/ }) }).first();
        await sel.waitFor({ timeout: 8000 });
        for (let i = 0; i < 20 && !(await sel.locator('option').evaluateAll((os) => os.some((o) => /תפוס/.test(o.textContent || '')))); i++) await pause(150);
        const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent || '', sel: o.selected })));
        const target = [...opts].reverse().find((o) => !/תפוס|מחוץ/.test(o.t) && !o.sel);
        if (!target) throw new Error('manage-day: no free time to move the appointment to');
        const box = await sel.boundingBox();
        await page.evaluate(([x, y]) => window.__finger && window.__finger(x, y), [box.x + box.width / 2, box.y + box.height / 2]); await pause(800);
        await sel.selectOption(target.v); await pause(1200);
        await h.tap(button(h, /^\s*עדכון/), { before: 500, after: 1800 }); // the button reads "עדכון ✓" (the check is the LAST character in logical order)
        // 2. cancel one: the card turns red and stays in the diary
        tip(h, 'מבטלת תור בלחיצה: הוא נשאר ביומן, מסומן כמבוטל', { delay: 600, hold: 5800 });
        await pause(1200);
        await h.tap(page.locator('button:visible', { hasText: /^✕$/ }).first(), { before: 700, after: 1500 });
        await h.tap(button(h, /^ביטול התור$/), { before: 900, after: 2200 });
        // 3. a client who did not come
        tip(h, 'ולקוחה שלא הגיעה מסומנת בנגיעה אחת', { delay: 600, hold: 5600 });
        await pause(1000);
        await h.tap(page.locator('button:visible', { hasText: /^לא הגיעה$/ }).first(), { before: 800, after: 1800 });
        const confirm = page.locator('button:visible', { hasText: /^(סימון|אישור|כן)/ }).first();
        if (await confirm.count()) await h.tap(confirm, { before: 500, after: 1500 });
        await hold(t0, 29000);
      },
    }] },

  { id: 'client-card', title: 'כרטיס לקוחה', sub: 'היסטוריה, הערות וטיפולים',
    parts: [{
      owner: true, ms: 25000,
      setup: async (h) => {
        await goto('לקוחות')(h);
        // the client with the most appointments: her history is the one worth showing
        const best = await h.page.evaluate(() => {
          let top = null;
          for (const el of document.querySelectorAll('*')) {
            if (el.children.length) continue;
            const m = /(\d+) תורים/.exec(el.innerText || ''); if (!m) continue;
            let row = el; for (let i = 0; i < 5 && row; i++) { row = row.parentElement; if (row && row.innerText.split('\n').length >= 2) break; }
            const name = ((row && row.innerText) || '').split('\n').map((s) => s.trim()).filter(Boolean)[0];
            if (name && (!top || +m[1] > top.n)) top = { n: +m[1], name };
          }
          return top;
        });
        if (!best) throw new Error('client-card: no client row with an appointment count');
        log(`   client card: ${best.name} (${best.n} appointments)`);
        await h.tap(text(h, new RegExp(best.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), { before: 300, after: 1500 });
      },
      async play(h) {
        const t0 = Date.now();
        tip(h, 'כרטיס אישי לכל לקוחה: פרטים, אלרגיות והערות', { hold: 6000 });
        await pause(7000);
        tip(h, 'כל התורים והטיפולים שלה, מהחדש לישן', { delay: 300, hold: 5400 });
        await h.tap(button(h, /^היסטוריה/), { before: 500, after: 600 });
        await pause(5200); await h.scrollBy(300, 1200);
        tip(h, 'ומה שילמה ומתי', { delay: 300, hold: 4200 });
        await h.tap(button(h, /^תשלומים/), { before: 500, after: 800 });
        await hold(t0, 25000);
      },
    }] },

  { id: 'voice', title: 'פקודות בקול', sub: 'כשהידיים עסוקות',
    parts: [{
      owner: true, ms: 18000,
      setup: async (h) => {
        await h.page.addInitScript((live) => {
          window.__keepVoice = true;
          window.SpeechRecognition = window.webkitSpeechRecognition = class {
            start() { if (live) setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: 'כמה הכנסתי החודש?' }]] }); this.onend && this.onend(); }, 1400); }
            stop() {}
          };
        }, VOICE_LIVE);
        await home(h);
      },
      async play(h) {
        const t0 = Date.now();
        tip(h, 'באמצע טיפול? לוחצות על המיקרופון ומדברות', { at: 'top', hold: 5200, delay: 900 });
        await pause(2400);
        await h.tap(h.page.locator('button.fab-voice').first(), { before: 500, after: 1200 });
        if (VOICE_LIVE) { tip(h, 'כמה הכנסתי החודש? והתשובה מגיעה', { at: 'top', delay: 300, hold: 6000 }); await pause(7000); }
        else { tip(h, 'אפשר לשאול על היום, ההכנסות, ולקבוע או לבטל תור', { at: 'top', delay: 400, hold: 6000 }); await pause(3000); await h.scrollBy(320, 1400); }
        await hold(t0, 18000);
      },
    }] },

  { id: 'payments', title: 'תשלומים והכנסות', sub: 'אישורי תשלום וסיכום לפי חודש',
    parts: [{
      owner: true, ms: 30000,
      setup: goto('תשלום'),
      async play(h) {
        const t0 = Date.now();
        tip(h, 'כל תשלום נרשם: סכום, אמצעי תשלום ולקוחה', { hold: 5400 });
        await pause(2600); await h.scrollBy(520, 1800); await pause(2200);
        tip(h, 'ומכאן לסיכום ההכנסות', { delay: 300, hold: 4000 });
        await h.scrollBy(-520, 1200);
        await h.tap(text(h, /סיכום הכנסות ודוחות/), { before: 700, after: 1500 });
        tip(h, 'הכנסות לפי חודש: החודש והחודש שעבר', { at: 'top', delay: 400, hold: 7800 });
        const monthly = button(h, /^חודשי$/);
        if (!(await monthly.count())) throw new Error('payments: no month picker on the income summary');
        const select = h.page.locator('select:visible').first();
        const now = Number(new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', month: 'numeric' })) - 1;
        await h.tap(monthly, { before: 500, after: 700 });
        await select.selectOption({ label: MONTHS[now] }); await pause(3200);
        const box = await select.boundingBox();
        await h.page.evaluate(([x, y]) => window.__finger && window.__finger(x, y), [box.x + box.width / 2, box.y + box.height / 2]); await pause(900);
        await select.selectOption({ label: MONTHS[(now + 11) % 12] }); await pause(3200);
        await h.page.evaluate(() => window.__fingerOff && window.__fingerOff());
        const body = await h.page.evaluate(() => document.body.innerText);
        if (/התחילי בחינם|תצוגת דמו|שדרגי|שדרוג/.test(body)) throw new Error('payments: a trial / upgrade / demo prompt is in frame');
        await hold(t0, 30000);
      },
    }] },

  { id: 'whatsapp', title: 'וואטסאפ', sub: 'תזכורות מוכנות ויומן הודעות',
    parts: [{
      owner: true, ms: 23000,
      setup: async (h) => { await goto('לקוחות')(h); await h.tap(button(h, /^הודעות$/), { before: 200, after: 1300 }); },
      async play(h) {
        const t0 = Date.now();
        tip(h, 'מרכז ההודעות: תזכורות לתורי מחר, מוכנות לשליחה', { hold: 6000 });
        await pause(6800); await h.scrollBy(300, 1600);
        tip(h, 'שולחות בלחיצה אחת, או לכולן יחד', { delay: 300, hold: 5200 });
        await pause(6000); await h.scrollBy(-300, 1200);
        tip(h, 'ויומן הודעות שמראה מה יצא ומה ממתין', { delay: 400, hold: 5000 });
        await h.tap(button(h, /^יומן הודעות$/), { before: 800, after: 1000 }); // "שלחי" is never tapped
        await hold(t0, 23000);
      },
    }] },

  { id: 'marketing', title: 'שיווק', sub: 'עיצובים, תבניות וקמפיינים',
    parts: [{
      owner: true, ms: 27000,
      setup: goto('תוכן'),
      async play(h) {
        const t0 = Date.now();
        tip(h, 'פוסטים מוכנים לשבוע, בצבעים של העסק', { hold: 5400 });
        await pause(2400); await h.scrollBy(420, 1700); await pause(2400); await h.scrollBy(-420, 1100);
        tip(h, 'תבניות לפוסטים, סטוריז וריילס: משנים מילה והן מוכנות', { delay: 300, hold: 6000 });
        await h.tap(button(h, /^תבניות/), { before: 600, after: 1000 });
        await h.scrollBy(330, 1800); await pause(3000);
        tip(h, 'ובעיצובים שלי נשמר כל מה שהיא עיצבה', { delay: 300, hold: 5000 });
        await h.scrollBy(-330, 900);
        await h.tap(button(h, /^פוסטים ותבניות$/), { before: 400, after: 500 }).catch(() => {});
        await hold(t0, 27000);
      },
    }] },

  { id: 'skin-scan', title: 'סורק העור', sub: 'ניתוח אישי מתמונה אחת',
    parts: [{
      owner: false, ms: 19000,
      setup: async (h) => { await h.page.goto(`${BASE}/skin-scan?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.getByText('ניתוח עור אישי').first().waitFor({ timeout: 15000 }); await pause(500); },
      async play(h) { // the page only: no photo is uploaded, no scan runs
        const t0 = Date.now();
        tip(h, 'הלקוחה מקבלת קישור לסורק העור של העסק', { hold: 5000 });
        await pause(5600); await h.scrollBy(420, 1700);
        tip(h, 'מאשרת, ומעלה תמונה אחת של הפנים', { delay: 300, hold: 5000 });
        await pause(5600); await h.scrollBy(420, 1700);
        tip(h, 'וההנחיות הקצרות עוזרות לה לצלם נכון', { delay: 300, hold: 4200 });
        await hold(t0, 19000);
      },
    }] },

  { id: 'settings', title: 'הגדרות ומיתוג', sub: 'העסק שלך, בצבעים שלך',
    parts: [{
      owner: true, ms: 25000,
      setup: openSettings,
      async play(h) {
        const t0 = Date.now();
        tip(h, 'כאן מגדירות את העסק: פרטים, שעות, תזכורות אוטומטיות', { hold: 5600 });
        await pause(3000); await h.tap(button(h, /^אוטומציות$/), { before: 500, after: 2600 });
        tip(h, 'הצבע הראשי והמשני של העסק: רק שלך', { delay: 300, hold: 5400 });
        await h.tap(button(h, /^מיתוג$/), { before: 500, after: 1000 });
        await h.glide(text(h, /^צבע ראשי$/), 1400); await pause(3200);
        tip(h, 'הצבעים האלה מופיעים בעמוד ההזמנות ובפוסטים שלך', { delay: 300, hold: 5200 });
        await h.glide(text(h, /^צבע משני/), 1200);
        await hold(t0, 25000);
      },
    }] },

  { id: 'closing', title: 'kalmea.app', sub: 'פחות זמן על ניהול. יותר זמן בשבילך.',
    parts: [{
      owner: false, ms: 13000,
      setup: async (h) => { await h.page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await pause(800); },
      async play(h) {
        const t0 = Date.now();
        tip(h, 'פחות זמן על ניהול. יותר זמן בשבילך.', { hold: 5600 });
        await pause(3000); await h.scrollBy(900, 3200);
        await h.scrollBy(900, 2800);
        await hold(t0, 13000);
      },
    }, { still: { title: 'kalmea.app', sub: 'פחות זמן על ניהול.<br>יותר זמן בשבילך.' }, seconds: 5.5 }] },
];

// ── run ───────────────────────────────────────────────────────────────────────────────────
const pad = (n) => String(n + 1).padStart(2, '0');
const R = path.join(OUT, 'walkthrough');
const dirs = { clips: path.join(R, 'clips'), cards: path.join(R, 'cards'), parts: path.join(R, 'parts') };
for (const d of [R, ...Object.values(dirs)]) fs.mkdirSync(d, { recursive: true });

const chosen = CHAPTERS.map((c, i) => ({ ...c, n: i })).filter((c) => !only || only.includes(c.id));
if (only && chosen.length !== only.length) { console.error(`[walkthrough] unknown chapter in --only: ${only.filter((o) => !CHAPTERS.some((c) => c.id === o)).join(', ')}`); process.exit(1); }

let exit = 0, browser;
const failed = [];
try {
  browser = await openBrowser();
  if (!stitchOnly) {
    for (const c of chosen) {
      log(`${pad(c.n)} ${c.id}`);
      try {
        const partFiles = [];
        for (const [pi, p] of c.parts.entries()) {
          const out = path.join(dirs.parts, `${pad(c.n)}-${c.id}-${pi}.mp4`);
          if (p.still) {
            const png = path.join(dirs.parts, `${pad(c.n)}-${c.id}-${pi}.png`);
            await renderCard(browser, png, { title: p.still.title, sub: p.still.sub });
            stillToClip(png, p.seconds || 4, out);
          } else {
            const dir = path.join(OUT, 'parts', `wt-${c.id}-${pi}`);
            fs.rmSync(dir, { recursive: true, force: true });
            const setup = async (h) => { await h.page.addInitScript(() => { window.__hideDemoBanner = true; }); await p.setup(h); };
            const take = await recordTake(browser, dir, { owner: p.owner !== false, setup, play: p.play, label: `${c.id}-${pi}` });
            if (take.aiCalls.length) throw new Error(`the "${c.id}" take touched an AI route, which it must never do:\n  ${take.aiCalls.join('\n  ')}`);
            finishClipAv(take.file, take.trim, out, (p.ms || 20000) / 1000 + 6);
          }
          partFiles.push(out);
        }
        const clip = path.join(dirs.clips, `${pad(c.n)}-${c.id}.mp4`);
        if (partFiles.length === 1) fs.copyFileSync(partFiles[0], clip); else stitchAv(partFiles, clip, 0.35);
        const secs = duration(clip);
        log(`   ${secs.toFixed(1)} s  -> ${path.relative(process.cwd(), clip)}`);
        if (secs < 15 || secs > 31) { console.error(`[walkthrough] WARNING: ${c.id} is ${secs.toFixed(1)} s, outside the 15-30 s brief`); exit = exit || 2; }
      } catch (e) {
        console.error(`[walkthrough] chapter "${c.id}" FAILED: ${e.message.split('\n')[0]}`);
        failed.push(c.id); exit = 1;
      }
    }
  }

  // title cards, per-chapter files, the stitched walkthrough
  if (!only || stitchOnly) {
    const all = [], forStitch = [];
    for (const [i, c] of CHAPTERS.entries()) {
      const clip = path.join(dirs.clips, `${pad(i)}-${c.id}.mp4`);
      if (!fs.existsSync(clip)) throw new Error(`chapter ${c.id} is missing: record the chapters first`);
      const png = path.join(dirs.cards, `${pad(i)}.png`), card = path.join(dirs.cards, `${pad(i)}.mp4`);
      await renderCard(browser, png, { kicker: `פרק ${i + 1} מתוך ${CHAPTERS.length}`, title: c.title, sub: c.sub });
      stillToClip(png, 2.6, card);
      const ch = path.join(R, `ch${pad(i)}-${c.id}.mp4`);
      stitchAv([card, clip], ch, 0.4);
      all.push(ch); forStitch.push(card, clip);
    }
    const whole = path.join(R, 'kalmea-walkthrough.mp4');
    const secs = stitchAv(forStitch, whole, 0.4);
    log(`walkthrough: ${(secs / 60).toFixed(2)} min (${secs.toFixed(0)} s)  ->  ${whole}`);
    log('codec check (decoded, not requested):');
    for (const f of [...all, whole]) {
      const p = probeCodecs(f);
      log(`  ${path.basename(f)}  ${duration(f).toFixed(1)} s`);
      log(`     video: ${p.video}`); log(`     audio: ${p.audio}  decodes clean: ${p.decodes}`);
      if (!/h264/.test(p.video) || !/aac/.test(p.audio) || !p.decodes) { console.error(`[walkthrough] CODEC PROBLEM in ${f}`); exit = 1; }
    }
  }
  if (failed.length) console.error(`[walkthrough] chapters that failed: ${failed.join(', ')}`);
} catch (e) {
  console.error(`[walkthrough] ${e.message}`);
  exit = 1;
} finally {
  if (browser) await browser.close();
}
process.exit(exit);
