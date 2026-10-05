// marketing/record-demo.mjs
//
// Records the Kalmea product demo as a REAL screen recording, driven by Playwright
// against the live demo tenant, and writes it as webm AND mp4.
//
//   npm run record            (from marketing/)
//
// The story (one phone-shaped take, no AI feature anywhere in it):
//   1. a client books a treatment on the public booking page
//   2. her side: that same appointment lands in the calendar
//   3. she takes the payment at the till
//   4. she opens the content studio
//
// Why it is a script and not a file: it clicks through the real product, so when the
// product changes the next run records the change - a stale video is a quiet lie.
// And because it clicks through the real product, a step that no longer works THROWS
// with the step's name (and leaves a screenshot in out/) instead of producing a video
// of a broken flow.
//
// Output (out/, git-ignored):
//   kalmea-demo.mp4    H.264, yuv420p, 30 fps, 1080x1920, +faststart  <- Instagram / Reels
//   kalmea-demo.webm   VP8, same picture                              <- what Playwright records natively
//   parts/             the two raw takes, as Playwright wrote them
//
// Knobs (environment): KALMEA_BASE (site to record, default production),
// KALMEA_DEMO_TENANT (tenant id of the demo business), KALMEA_DEMO_FIELD (cosmetics|nails).

import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const PARTS = path.join(OUT, 'parts');

// /demo/* signs in by setting the session cookie on its redirect response, and the script takes
// the cookie without following the redirect, so it works whichever host the redirect points at.
// The default is the vercel.app host this recording was verified on; KALMEA_BASE=https://kalmea.app
// records the custom domain (it serves as of 2026-10-05, a full run on it is not yet verified).
const BASE = (process.env.KALMEA_BASE || 'https://beautyos-theta.vercel.app').replace(/\/+$/, '');
const DEMO_TENANT = process.env.KALMEA_DEMO_TENANT || '00000000-0000-0000-0000-000000000001';
const DEMO_FIELD = process.env.KALMEA_DEMO_FIELD || 'cosmetics';

const VIEW = { width: 430, height: 764 }; // phone shape, 9:16
const SCALE = 2; // device pixel ratio of the page (renders crisper before the recorder samples it down)
const TARGET = { min: 40, max: 60 }; // seconds, the brief

// Who books. A different client each run (144 combinations, picked by the minute), so a
// second run the same day does not book the same person twice - the same phone would even
// attach to the same client record. First names the demo seed does not use, surnames with
// distinct initials: the calendar abbreviates ("ענבל כ."), and that short form is how we find her.
// The phones are obviously fake.
const FIRST = ['אביגיל', 'גילי', 'דורית', 'חן', 'ורד', 'זהבה', 'ליאור', 'ענבל', 'פנינה', 'צליל', 'קרן', 'תהל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'דהן', 'פרידמן', 'אשכנזי', 'ביטון', 'גולן', 'חזן', 'טל', 'שמעוני', 'רוזן'];
const pick = Math.floor(Date.now() / 60000) % (FIRST.length * LAST.length);
const CLIENT_NAME = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)]}`;
const CLIENT_SHORT = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)][0]}.`;
const CLIENT_PHONE = `050000${String(1000 + pick).padStart(4, '0')}`;

// What no recording may ever call: the AI features (the provider account may be empty,
// and a failed AI call mid-take is exactly what this video must not show). Only a request that
// could GENERATE counts - the studio reads its monthly allowance with a GET on the same path
// (checked: it is a counter read, no model call).
const AI_ROUTES = /\/api\/(advisor|designs\/(generate|ai-fill)|marketing\/|ai\/)/;

let takeStart = Date.now();
// where in the take we are, so the pauses can be tuned against the 40-60 s brief by measurement
const mark = (name) => { log(`  ${((Date.now() - takeStart) / 1000).toFixed(1).padStart(5)} s  ${name}`); return name; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[record] ${m}`);

// ── what a viewer sees: a ripple where a finger lands ──────────────────────────────
function rippleScript() {
  const CSS = '.__tap{position:fixed;z-index:2147483647;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;' +
    'background:rgba(233,169,161,.55);border:2px solid rgba(31,58,48,.6);pointer-events:none;animation:__tap .75s ease-out forwards}' +
    '@keyframes __tap{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.6);opacity:0}}';
  addEventListener('pointerdown', (e) => {
    if (!document.getElementById('__tapcss')) {
      const s = document.createElement('style'); s.id = '__tapcss'; s.textContent = CSS; document.documentElement.appendChild(s);
    }
    const d = document.createElement('div'); d.className = '__tap'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
    document.documentElement.appendChild(d); setTimeout(() => d.remove(), 800);
  }, true);
}

// Smoothly scroll so `locator` sits near the middle of the visible area (clear of the bottom nav).
async function glide(locator, ms = 900) {
  await locator.evaluate((el, ms) => new Promise((resolve) => {
    let s = el.parentElement;
    while (s && s !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 2) break;
      s = s.parentElement;
    }
    const root = !s || s === document.body;
    const scroller = root ? document.scrollingElement : s;
    const top = root ? 0 : scroller.getBoundingClientRect().top;
    const viewH = root ? innerHeight : scroller.clientHeight;
    const r = el.getBoundingClientRect();
    const delta = (r.top - top) - ((viewH - 90) / 2 - r.height / 2);
    const from = scroller.scrollTop, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      scroller.scrollTop = from + delta * ease(t);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }), ms);
}

async function inView(locator) {
  const box = await locator.boundingBox();
  if (!box) return false;
  return box.y >= 70 && box.y + box.height <= VIEW.height - 90;
}

// A person: look at it, finger lands, then wait a beat.
async function tap(locator, { before = 450, after = 700 } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  if (!(await inView(locator))) { await glide(locator); await pause(250); }
  await pause(before);
  await locator.tap();
  await pause(after);
}

async function type(locator, text, { after = 500 } = {}) {
  await tap(locator, { before: 300, after: 250 });
  await locator.pressSequentially(text, { delay: 55 });
  await pause(after);
}

// the bottom tab bar is the LAST visible button carrying the label (a desktop sidebar copy is hidden at phone width)
// She shows up in the lists as her full name (booked online) or abbreviated ("ענבל כ."); only a VISIBLE match counts,
// the same name also sits in hidden lists (pending approvals) earlier in the page.
const seen = (page) => page.getByText(new RegExp(`${CLIENT_NAME}|${CLIENT_SHORT.replace('.', '\\.')}`)).filter({ visible: true });

const nav = (page, label) => page.locator('button:visible', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).last();

// ── the browser ────────────────────────────────────────────────────────────────────
async function newTake(browser, name, step) {
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'he-IL',
    // size is VIEW, not VIEW * SCALE: the recorder ignores device pixel ratio, and a bigger canvas just leaves grey margins
    recordVideo: { dir: path.join(PARTS, name), size: VIEW },
  });
  return ctx;
}

const aiCalls = [];
function watchAi(page) {
  page.on('request', (r) => { if (r.method() !== 'GET' && AI_ROUTES.test(new URL(r.url()).pathname)) aiCalls.push(`${r.method()} ${r.url()}`); });
}

async function failShot(page, name, e) {
  try { await page.screenshot({ path: path.join(OUT, `failure-${name}.png`) }); } catch {}
  console.error(`\n[record] FAILED in "${name}": ${e.message.split('\n')[0]}`);
  console.error(`[record] screenshot: out/failure-${name}.png`);
}

// ── take 1: the client books ───────────────────────────────────────────────────────
async function clientTake(browser) {
  const ctx = await newTake(browser, 'client');
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.addInitScript(rippleScript);
  watchAi(page);
  let step = 'booking page';
  try {
    await page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' });
    const services = page.locator('#bk-services');
    await services.waitFor({ state: 'visible', timeout: 15000 });
    const readyAt = Date.now(); takeStart = readyAt;
    await pause(800); // read the business

    step = mark('pick a treatment');
    await glide(services, 800); await pause(700);
    await tap(services.locator('button', { hasText: 'קביעת תור' }).first(), { after: 900 });

    step = mark('pick a day and a time');
    await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
    await pause(600);
    // The nearest day first: the chips are not in date order in the DOM, and a booking a
    // week out would make her calendar walk a week forward on camera.
    const weekdays = page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
    const today = +new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' });
    const chips = [];
    for (let i = 0; i < Math.min(await weekdays.count(), 14); i++) {
      const dom = +(await weekdays.nth(i).evaluate((el) => (el.parentElement.innerText.match(/\d+/) || [])[0]));
      if (dom) chips.push({ i, ahead: (dom - today + 31) % 31 });
    }
    chips.sort((x, y) => x.ahead - y.ahead);
    const slots = page.locator('button.bk-btn:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
    let slotCount = 0;
    for (const chip of chips) {
      if (slotCount > 0) break;
      await tap(weekdays.nth(chip.i), { after: 400 });
      await slots.first().waitFor({ timeout: 3500 }).catch(() => {}); // availability loads after the tap
      slotCount = await slots.count();
    }
    if (slotCount === 0) throw new Error('no day in the next two weeks has a free time on the demo tenant');
    await pause(500);
    await tap(slots.first(), { after: 500 });
    await tap(page.getByRole('button', { name: /המשיכי/ }), { after: 600 });

    step = mark('her details');
    await type(page.getByPlaceholder('שם מלא'), CLIENT_NAME);
    await type(page.getByPlaceholder('טלפון נייד'), CLIENT_PHONE);
    await tap(page.locator('input[type=checkbox]'), { after: 700 });

    step = mark('confirm the booking');
    await tap(page.getByRole('button', { name: 'קביעת תור' }).last(), { after: 400 });
    await page.getByText('התור נקבע').waitFor({ timeout: 20000 });
    const when = (await page.locator('body').innerText()).match(/נתראה ב([^\n]+)/)?.[1]?.trim() || '';
    log(`booked: ${CLIENT_NAME} - ${when}`);
    await pause(1900); // read the confirmation

    const video = page.video();
    await ctx.close();
    return { file: await video.path(), trim: (readyAt - t0) / 1000, when };
  } catch (e) {
    await failShot(page, `client-${step.replace(/\W+/g, '-')}`, e);
    await ctx.close();
    throw e;
  }
}

// ── take 2: her side ───────────────────────────────────────────────────────────────
async function ownerTake(browser, booking) {
  const ctx = await newTake(browser, 'owner');
  // The demo link signs in by setting a session cookie on its redirect response; take the
  // cookie and ignore where it redirects (see the note on BASE).
  const r = await ctx.request.get(`${BASE}/demo/${DEMO_FIELD}`, { maxRedirects: 0 });
  if (r.status() !== 307 && r.status() !== 302) throw new Error(`/demo/${DEMO_FIELD} answered ${r.status()}, expected a redirect that signs in`);
  if (!(await ctx.cookies()).some((c) => /auth-token/.test(c.name))) throw new Error('the demo link did not set a session cookie');

  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.addInitScript(rippleScript);
  watchAi(page);
  let step = 'dashboard';
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await nav(page, 'יומן').waitFor({ state: 'visible', timeout: 20000 });
    const readyAt = Date.now(); takeStart = readyAt;
    await pause(800);

    step = mark('calendar');
    await tap(nav(page, 'יומן'), { after: 1100 });
    // walk forward to the day she booked ("רביעי 7/10 בשעה 10:00" -> 7/10)
    const day = (booking.when.match(/\d{1,2}\/\d{1,2}/) || [])[0];
    if (!day) throw new Error(`could not read the booked date from "${booking.when}"`);
    for (let i = 0; i < 21 && !(await page.getByText(day, { exact: false }).first().isVisible().catch(() => false)); i++) {
      await tap(page.locator('button[aria-label="יום הבא"]'), { before: 120, after: 260 }); // flicking through the days
    }
    await pause(300);
    const row = seen(page).first();
    await row.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      throw new Error(`the appointment for ${CLIENT_SHORT} is not in the calendar on the day she booked`);
    });
    await glide(row, 800); await pause(300);
    await row.evaluate((el) => { // a soft ring, so the eye finds the new row
      const card = el.closest('div:has(button)') || el.parentElement;
      card.style.transition = 'box-shadow .4s'; card.style.boxShadow = '0 0 0 3px #E9A9A1';
      setTimeout(() => { card.style.boxShadow = ''; }, 1800);
    });
    await pause(1500);

    step = mark('payment');
    await tap(nav(page, 'תשלום'), { after: 900 });
    await tap(page.getByRole('button', { name: /תשלום חדש/ }), { after: 600 });
    await type(page.getByPlaceholder('חיפוש לקוחה...'), CLIENT_NAME, { after: 300 });
    await tap(page.getByText(CLIENT_NAME, { exact: true }).first(), { after: 450 });
    const select = page.locator('select:visible').first();
    await select.waitFor({ timeout: 8000 });
    await pause(300);
    await select.selectOption({ index: 1 }); // her treatment, price filled in
    await pause(700);
    await tap(page.locator('button:visible', { hasText: '◦ ביט' }), { after: 800 });
    await tap(page.getByRole('button', { name: /רשמי תשלום/ }), { after: 400 });
    // Registering opens the payment confirmation ("אישור תשלום בלבד. אינו קבלה או חשבונית מס"):
    // the moment worth holding on. Her "send to client" button is deliberately not touched.
    await page.getByText('אינו קבלה או חשבונית מס').waitFor({ state: 'visible', timeout: 20000 });
    await pause(2000);
    await tap(page.getByRole('button', { name: 'סגירה' }), { after: 600 });
    await page.getByText('אינו קבלה או חשבונית מס').waitFor({ state: 'hidden', timeout: 10000 });
    // the payment must really be in her list now (this is a check as much as a shot)
    await seen(page).first().waitFor({ timeout: 15000 }).catch(() => { throw new Error('the payment did not show up in the list after registering it'); });

    step = mark('content studio');
    await tap(nav(page, 'תוכן'), { after: 1000 });
    await tap(page.locator('button:visible', { hasText: 'פוסטים ותבניות' }).first(), { after: 900 }); // the default tab, NOT a generate button
    const week = page.getByText('מה מפרסמים השבוע');
    await week.waitFor({ timeout: 15000 });
    await glide(week, 800); await pause(800);
    const open = page.locator('button:visible', { hasText: 'לפתוח ולערוך' }).first();
    await tap(open, { after: 200 });
    mark('editor opening');
    await page.getByText('בפוסט הזה').waitFor({ timeout: 25000 });
    mark('editor ready');
    await pause(500);
    await glide(page.getByText('בפוסט הזה'), 1100);
    await pause(900);

    const video = page.video();
    await ctx.close();
    return { file: await video.path(), trim: (readyAt - t0) / 1000 };
  } catch (e) {
    await failShot(page, `owner-${step.replace(/\W+/g, '-')}`, e);
    await ctx.close();
    throw e;
  }
}

// ── ffmpeg ─────────────────────────────────────────────────────────────────────────
function ff(args) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}
function duration(file) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || '');
  if (!m) throw new Error(`cannot read the duration of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

function assemble(a, b) {
  const FADE = 0.45;
  // each take: drop the loading flash at its start, then a common 30 fps / 1080x1920 picture
  const norm = (i, trim) => `[${i}:v]trim=start=${Math.max(0, trim - 0.1).toFixed(2)},setpts=PTS-STARTPTS,fps=30,` +
    `scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p[v${i}]`;
  const lenA = duration(a.file) - Math.max(0, a.trim - 0.1);
  const graph = `${norm(0, a.trim)};${norm(1, b.trim)};[v0][v1]xfade=transition=fade:duration=${FADE}:offset=${(lenA - FADE).toFixed(2)}[v]`;
  const common = ['-i', a.file, '-i', b.file, '-filter_complex', graph, '-map', '[v]', '-an'];
  const mp4 = path.join(OUT, 'kalmea-demo.mp4');
  const webm = path.join(OUT, 'kalmea-demo.webm');
  ff([...common, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', mp4]);
  ff([...common, '-c:v', 'libvpx', '-crf', '8', '-b:v', '6M', '-pix_fmt', 'yuv420p', '-r', '30', webm]);
  return { mp4, webm, seconds: duration(mp4) };
}

// ── main ───────────────────────────────────────────────────────────────────────────
fs.rmSync(PARTS, { recursive: true, force: true });
fs.mkdirSync(PARTS, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^failure-/.test(f)) fs.rmSync(path.join(OUT, f));

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.error('[record] could not start Chromium. First time on this machine? Run:  npx playwright-core install chromium');
  throw e;
}

let exit = 0;
try {
  log(`site: ${BASE}   client: ${CLIENT_NAME}`);
  const a = await clientTake(browser);
  const b = await ownerTake(browser, a);
  await browser.close();
  browser = null;

  if (aiCalls.length) throw new Error(`the recording touched an AI route, which it must never do:\n  ${aiCalls.join('\n  ')}`);

  const keep = path.join(PARTS, 'client.webm'), keep2 = path.join(PARTS, 'owner.webm');
  fs.copyFileSync(a.file, keep); fs.copyFileSync(b.file, keep2);
  const out = assemble({ file: keep, trim: a.trim }, { file: keep2, trim: b.trim });

  const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
  log(`done: ${out.seconds.toFixed(1)} s`);
  log(`  ${out.mp4}  (${mb(out.mp4)} MB)  <- upload this one to Instagram`);
  log(`  ${out.webm}  (${mb(out.webm)} MB)`);
  if (out.seconds < TARGET.min || out.seconds > TARGET.max) {
    console.error(`[record] WARNING: ${out.seconds.toFixed(1)} s is outside the ${TARGET.min}-${TARGET.max} s brief - adjust the pauses in record-demo.mjs`);
    exit = 2;
  }
} catch (e) {
  console.error(`[record] ${e.message}`);
  exit = 1;
} finally {
  if (browser) await browser.close();
}
process.exit(exit);
