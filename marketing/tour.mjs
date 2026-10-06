// marketing/tour.mjs
//
// The product tour: THIRTEEN clips, one per screen, 4-6 s each, recorded from the real app against the cosmetics demo tenant, and the
// same clips stitched into one video. Phone shape, a finger that glides to what it taps, and one pop-up tip per clip (a cream card,
// a green accent bar, the small flower mark in the corner) that slides in after ~0.8 s - never on frame 0.
//
//   npm run tour                         all 13 clips + the stitched tour
//   npm run tour -- --only=login,voice   just those clips (no stitch)
//   npm run tour -- --stitch-only        re-stitch the clips already in out/tour
//
// Output (out/tour/, git-ignored):  NN-<id>.mp4  (1080x1920, 30 fps, H.264 baseline + AAC silence)  and  kalmea-tour-13.mp4.
// After writing, every file is read back by decoding it and its real video/audio codec is printed.
//
// Rules that came from real mistakes:
//  - Nothing here is faked. A screen the demo data cannot reach is recorded as it really is, and the run says what is missing
//    (see the NOT-AS-BRIEFED notes below), rather than painting the screen.
//  - No AI route is ever called: the guard aborts the run on any non-GET to one. The voice clip opens the voice panel and shows
//    what she can say; it does not run a command (a demo tenant answers voice commands with a demo notice, not a result).
//  - "שלחי" buttons are never tapped: the demo sends nothing.
//  - Hebrew in the tips is drawn by Chromium in the brand font, one short line each, no digits, so no bidi rule can move anything.
//
// Run it right after the 02:00 UTC demo reset (the busy day is "today" then, in Israel's date).

import fs from 'node:fs';
import path from 'node:path';
import {
  BASE, OUT, log, pause, openBrowser, recordTake, finishClipAv, stitchAv, probeCodecs, duration,
} from './lib.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only')?.split(',').filter(Boolean);
const stitchOnly = process.argv.includes('--stitch-only');
const LEN = { min: 4, max: 6.2 }; // seconds per clip, the brief
const CLIP_MS = 5300;             // every play() is padded to this, so every clip lands inside the brief

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
// The new-appointment sheet opens on 09:00, taken on a busy day (the sheet turns red). Pick a time it does not mark taken.
const freeTime = async (h) => {
  const sel = h.page.locator('select:visible').filter({ has: h.page.locator('option', { hasText: /^\d\d:\d\d/ }) }).first();
  await sel.waitFor({ timeout: 8000 });
  const read = () => sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent || '' })));
  for (let i = 0; i < 40 && !(await read()).some((o) => /תפוס/.test(o.t)); i++) await pause(150);
  for (let attempt = 0; attempt < 3; attempt++) {
    const free = (await read()).filter((o) => !/תפוס|מחוץ/.test(o.t));
    if (!free.length) throw new Error('no free time in the sheet to show');
    await sel.selectOption((free[1] || free[0]).v); await pause(500);
    if (!(await h.page.getByText(/השעה תפוסה/).filter({ visible: true }).count())) return;
  }
  throw new Error('the sheet still says the time is taken');
};

// ── the 13 clips ─────────────────────────────────────────────────────────────────────────
export const CLIPS = [
  { // 1
    id: 'login', title: 'כניסה', owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await h.page.getByRole('button', { name: /כניסה/ }).waitFor({ timeout: 15000 }); await pause(400); },
    async play(h) {
      const t0 = Date.now(); h.tip('כניסה פשוטה לחשבון שלך', { at: 'bottom' });
      await pause(700);
      await h.tap(h.page.locator('input:visible').first(), { before: 100, after: 600 });
      await h.tap(h.page.locator('input:visible').nth(1), { before: 200, after: 500 });
      await hold(t0, CLIP_MS);
    },
  },
  { // 2
    id: 'dashboard', title: 'היום',
    setup: home,
    async play(h) {
      const t0 = Date.now(); h.tip('היום שלך: תורים והכנסות, במבט אחד', { at: 'bottom' });
      await pause(1500);
      await h.scrollBy(820, 1700);
      await hold(t0, CLIP_MS);
    },
  },
  { // 3
    id: 'calendar-week', title: 'יומן שבועי',
    setup: async (h) => { await goto('יומן')(h); await h.tap(button(h, /^שבוע$/), { before: 200, after: 900 }); },
    async play(h) {
      const t0 = Date.now(); h.tip('כל השבוע: תורים, ביטולים ושעות פנויות', { at: 'bottom' });
      await pause(1700);
      await h.scrollBy(300, 1900);
      await hold(t0, CLIP_MS);
    },
  },
  { // 4
    id: 'new-appointment', title: 'תור חדש',
    setup: goto('יומן'),
    async play(h) {
      const t0 = Date.now(); h.tip('קובעים תור בכמה נגיעות', { at: 'top', delay: 900 });
      await h.tap(button(h, /תור חדש/), { before: 250, after: 200 });
      await freeTime(h);
      await hold(t0, CLIP_MS - 500);
      await h.page.keyboard.press('Escape'); // never saved
      await hold(t0, CLIP_MS);
    },
  },
  { // 5
    id: 'clients', title: 'לקוחות',
    setup: goto('לקוחות'),
    async play(h) {
      const t0 = Date.now(); h.tip('כל הלקוחות שלך, במקום אחד', { at: 'bottom' });
      await pause(1600);
      await h.scrollBy(520, 1800);
      await hold(t0, CLIP_MS);
    },
  },
  { // 6
    id: 'client-card', title: 'כרטיס לקוחה',
    setup: async (h) => { await goto('לקוחות')(h); await h.tap(text(h, 'ליה דהן', { exact: true }), { before: 200, after: 1500 }); },
    async play(h) {
      const t0 = Date.now(); h.tip('ההיסטוריה והטיפולים שלה', { at: 'bottom' });
      await h.tap(button(h, /^היסטוריה/), { before: 700, after: 800 });
      await hold(t0, CLIP_MS);
    },
  },
  { // 7
    id: 'services', title: 'שירותים ומחירים',
    setup: openSettings,
    async play(h) {
      const t0 = Date.now(); h.tip('השירותים והמחירים שלך', { at: 'bottom' });
      await h.tap(button(h, /^שירותים$/), { before: 500, after: 900 });
      await hold(t0, CLIP_MS);
    },
  },
  { // 8
    id: 'payments', title: 'תשלומים',
    setup: goto('תשלום'),
    async play(h) {
      const t0 = Date.now(); h.tip('כל התשלומים וההכנסות, מסודרים', { at: 'bottom' });
      await pause(1600);
      await h.scrollBy(520, 1800);
      await hold(t0, CLIP_MS);
    },
  },
  { // 9  Needs the demo seed on a LICENSED status (lib/demoSeed.ts): an "עוסק פטור" gets only the annual figure and no month picker.
    //    Months: the receipts the seed writes cover this month and last month. The clip refuses to run if either shows ₪0, if the
    //    month picker is missing, or if a lock / upgrade / trial prompt is in frame.
    id: 'income-summary', title: 'סיכום הכנסות',
    setup: async (h) => { await goto('תשלום')(h); await h.tap(text(h, /סיכום הכנסות ודוחות/), { before: 200, after: 1400 }); },
    async play(h) {
      const t0 = Date.now(); h.tip('הכנסות לפי חודש: החודש והחודש שעבר', { at: 'top', delay: 900 }); // top: at the bottom it sat on the figures
      const monthly = button(h, /^חודשי$/);
      if (!(await monthly.count())) throw new Error('income summary: no month picker on screen - the demo tenant is not on a licensed status yet (has the nightly reset run since lib/demoSeed.ts changed?)');
      const select = h.page.locator('select:visible').first();
      const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
      const now = Number(new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', month: 'numeric' })) - 1;
      const grossOf = async () => {
        const t = await h.page.locator('#tax-report').innerText();
        const m = t.match(/מחזור ברוטו[\s\S]{0,40}?₪\s*([\d,]+)/) || t.match(/₪\s*([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, '')) : 0;
      };
      await h.tap(monthly, { before: 250, after: 500 });                // monthly: the picker now lists single months
      await select.selectOption({ label: months[now] }); await pause(500);
      const thisMonth = await grossOf();
      const box = await select.boundingBox();
      await h.page.evaluate(([x, y]) => window.__finger && window.__finger(x, y), [box.x + box.width / 2, box.y + box.height / 2]); await pause(900);
      await select.selectOption({ label: months[(now + 11) % 12] }); await pause(500); // last month
      const lastMonth = await grossOf();
      await h.page.evaluate(() => window.__fingerOff && window.__fingerOff());
      log(`   income summary: ${months[now]} ₪${thisMonth}, ${months[(now + 11) % 12]} ₪${lastMonth}`);
      if (!thisMonth || !lastMonth) throw new Error(`income summary: a month is empty (this ${thisMonth}, last ${lastMonth}) - it must show real numbers in both`);
      const body = await h.page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('svg,[aria-label],[title]')].map((e) => (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || '')).join(' '));
      if (/התחילי בחינם|תצוגת דמו|שדרגי|שדרוג|נעול|ניסיון/.test(body)) throw new Error('income summary: a trial / upgrade / lock / demo prompt is in frame');
      await hold(t0, CLIP_MS);
    },
  },
  { // 10  NOT AS BRIEFED: shows the voice panel (listening, and what she can say). A voice command is not run: no AI call is made.
    id: 'voice', title: 'שליטה בקול',
    setup: async (h) => {
      await h.page.addInitScript(() => { window.__keepVoice = true; window.SpeechRecognition = window.webkitSpeechRecognition = class { start() {} stop() {} }; });
      await home(h);
    },
    async play(h) {
      const t0 = Date.now(); h.tip('שליטה בקול: מה אפשר לומר?', { at: 'top', delay: 900 });
      await h.tap(h.page.locator('button.fab-voice').first(), { before: 500, after: 900 });
      await hold(t0, CLIP_MS);
    },
  },
  { // 11
    id: 'reminders', title: 'הודעות ותזכורות',
    setup: async (h) => { await goto('לקוחות')(h); await h.tap(button(h, /^הודעות$/), { before: 200, after: 1300 }); },
    async play(h) {
      const t0 = Date.now(); h.tip('תזכורות מוכנות ללקוחות, בלחיצה אחת', { at: 'bottom' });
      await pause(1700);
      await h.scrollBy(260, 1500);
      await hold(t0, CLIP_MS); // "שלחי" is never tapped
    },
  },
  { // 12
    id: 'marketing', title: 'שיווק ועיצובים',
    setup: goto('תוכן'),
    async play(h) {
      const t0 = Date.now(); h.tip('פוסטים ועיצובים מוכנים, בצבעי העסק', { at: 'bottom' });
      await h.tap(button(h, /^תבניות/), { before: 500, after: 900 });
      await h.scrollBy(330, 1500);
      await hold(t0, CLIP_MS);
    },
  },
  { // 13
    id: 'settings-brand', title: 'הגדרות ומיתוג',
    setup: async (h) => { await openSettings(h); await h.tap(button(h, /^מיתוג$/), { before: 200, after: 1200 }); },
    async play(h) {
      const t0 = Date.now(); h.tip('הצבעים והמיתוג של העסק שלך', { at: 'bottom' });
      await pause(800);
      await h.glide(text(h, /^צבע ראשי$/), 1400);
      await hold(t0, CLIP_MS);
    },
  },
];

// ── run ───────────────────────────────────────────────────────────────────────────────────
const pad = (n) => String(n + 1).padStart(2, '0');
const outDir = path.join(OUT, 'tour');
fs.mkdirSync(outDir, { recursive: true });

const chosen = CLIPS.map((c, i) => ({ ...c, n: i })).filter((c) => !only || only.includes(c.id));
if (only && chosen.length !== only.length) { console.error(`[tour] unknown clip in --only: ${only.filter((o) => !CLIPS.some((c) => c.id === o)).join(', ')}`); process.exit(1); }

let exit = 0;
let browser;
try {
  browser = await openBrowser();
  if (!stitchOnly) {
    for (const c of chosen) {
      log(`${pad(c.n)} ${c.id}`);
      const dir = path.join(OUT, 'parts', `t13-${c.id}`);
      fs.rmSync(dir, { recursive: true, force: true });
      const setup = async (h) => { await h.page.addInitScript(() => { window.__hideDemoBanner = true; }); await c.setup(h); };
      const take = await recordTake(browser, dir, { owner: c.owner !== false, setup, play: c.play, label: c.id });
      if (take.aiCalls.length) throw new Error(`the "${c.id}" take touched an AI route, which it must never do:\n  ${take.aiCalls.join('\n  ')}`);
      const mp4 = path.join(outDir, `${pad(c.n)}-${c.id}.mp4`);
      const secs = finishClipAv(take.file, take.trim, mp4, 6);
      fs.copyFileSync(take.file, path.join(dir, `${c.id}.webm`));
      log(`   ${secs.toFixed(1)} s  -> ${path.relative(process.cwd(), mp4)}`);
      if (secs < LEN.min || secs > LEN.max) { console.error(`[tour] WARNING: ${c.id} is ${secs.toFixed(1)} s, outside ${LEN.min}-${LEN.max} s`); exit = 2; }
    }
  }
  if (!only) {
    const files = CLIPS.map((c, i) => path.join(outDir, `${pad(i)}-${c.id}.mp4`));
    for (const f of files) if (!fs.existsSync(f)) throw new Error(`missing ${path.basename(f)}: record the clips first (npm run tour)`);
    const tour = path.join(outDir, 'kalmea-tour-13.mp4');
    const secs = stitchAv(files, tour);
    log(`stitched: ${secs.toFixed(1)} s  ->  ${tour}`);
  }
  // read every finished file back by decoding it
  log('codec check (decoded, not requested):');
  for (const f of fs.readdirSync(outDir).filter((x) => x.endsWith('.mp4')).sort()) {
    const full = path.join(outDir, f), p = probeCodecs(full);
    log(`  ${f}  ${duration(full).toFixed(1)} s  ${(fs.statSync(full).size / 1024).toFixed(0)} KB`);
    log(`     video: ${p.video}`);
    log(`     audio: ${p.audio}`);
    if (!/h264/.test(p.video) || !/aac/.test(p.audio) || !p.decodes) { console.error(`[tour] CODEC PROBLEM in ${f} (decodes: ${p.decodes} ${p.decodeErr})`); exit = 1; }
  }
} catch (e) {
  console.error(`[tour] ${e.message}`);
  exit = 1;
} finally {
  if (browser) await browser.close();
}
process.exit(exit);
