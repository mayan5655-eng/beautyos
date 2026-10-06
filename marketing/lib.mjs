// marketing/lib.mjs
//
// What every recording here shares: a phone-shaped browser, a finger ripple, human pacing,
// brand-font captions, title cards, and ffmpeg. (record-demo.mjs, the first recorder, predates
// this file and keeps its own copies; it is shipped and verified, so it was left alone.)
//
// Rules that hold for everything built on it:
//   * a step that no longer works THROWS with its name and leaves a screenshot - never a video
//     of a broken flow;
//   * any non-GET request to an AI route aborts the run (the provider account may be empty, and
//     a failed AI call mid-take is exactly what a marketing video must not show);
//   * Hebrew is drawn by Chromium (captions, title cards), never by ffmpeg's drawtext, which has
//     no bidi: the repo's video lessons are paid for.

import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(HERE, 'out');

export const BASE = (process.env.KALMEA_BASE || 'https://kalmea.app').replace(/\/+$/, '');
export const DEMO_TENANT = process.env.KALMEA_DEMO_TENANT || '00000000-0000-0000-0000-000000000001';
export const DEMO_FIELD = process.env.KALMEA_DEMO_FIELD || 'cosmetics';

export const VIEW = { width: 430, height: 764 }; // phone shape, 9:16
export const SCALE = 2;                          // device pixel ratio of the page
export const BRAND = { deep: '#1F3A30', petal: '#E9A9A1', cream: '#FBF8F1', palePetal: '#FBEDE9', sage: '#DCE4D5' };

// Everything that could spend AI money. A GET on the same path (the studio reads its allowance) is not a call.
export const AI_ROUTES = /\/api\/(advisor|designs\/(generate|ai-fill)|marketing\/|ai\/|skin-scan\b|voice)/;

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (m) => console.log(`[tour] ${m}`);

// ── in the page: finger ripple, captions, and the two floating helpers out of the way ──
function pageDressing(brand) {
  const css = `
.__tap{position:fixed;z-index:2147483647;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(233,169,161,.55);border:2px solid rgba(31,58,48,.6);pointer-events:none;animation:__tap .75s ease-out forwards}
@keyframes __tap{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.6);opacity:0}}
@font-face{font-family:KalmeaCap;src:url(/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
#__cap{position:fixed;z-index:2147483646;left:14px;right:14px;bottom:92px;display:flex;justify-content:center;pointer-events:none;direction:rtl;opacity:0;transform:translateY(10px);transition:opacity .35s ease,transform .35s ease}
#__cap.on{opacity:1;transform:none}
/* the pop-up card: line icon + benefit title + one line of what is on screen. White (cream-tinted), 19px, two-layer shadow;
   slides in 12px and fades over 250ms, holds, fades out. Replaces the plain caption pill. */
#__card{position:fixed;z-index:2147483646;left:16px;right:16px;display:flex;justify-content:center;pointer-events:none;direction:rtl;opacity:0;transform:translateY(12px);transition:opacity .25s ease,transform .25s ease}
#__card.top{top:84px}#__card.bottom{bottom:92px}
#__card.top{transform:translateY(-12px)}
#__card.on{opacity:1;transform:none}
#__card .box{display:flex;align-items:center;gap:14px;max-width:398px;width:100%;box-sizing:border-box;padding:14px 18px;background:#FFFDF8;border:1px solid rgba(24,48,36,.08);border-radius:19px;box-shadow:0 1px 2px rgba(24,48,36,.06),0 14px 30px -12px rgba(24,48,36,.28)}
#__card img{width:44px;height:44px;object-fit:contain;flex:none}
#__card .t{font:700 21px/1.25 KalmeaCap,'Frank Ruhl Libre',serif;color:${brand.deep}}
#__card .s{font:600 14.5px/1.4 Assistant,system-ui,sans-serif;color:#656A56;margin-top:3px}
/* the tour's pop-up tip: a cream card with a green accent bar on the reading side (right, RTL) and the small flower mark in the
   corner. Hidden at first; shown after a delay (~0.8 s), so it never sits on frame 0. */
#__tip{position:fixed;z-index:2147483646;left:16px;right:16px;display:flex;justify-content:center;pointer-events:none;direction:rtl;opacity:0;transform:translateY(14px);transition:opacity .45s ease,transform .45s ease}
#__tip.top{top:84px;transform:translateY(-14px)}#__tip.bottom{bottom:92px}
#__tip.on{opacity:1;transform:none}
#__tip .box{position:relative;max-width:398px;width:100%;box-sizing:border-box;padding:15px 22px 16px 46px;background:${brand.cream};border:1px solid rgba(31,58,48,.10);border-right:6px solid ${brand.deep};border-radius:18px;box-shadow:0 1px 2px rgba(24,48,36,.06),0 16px 32px -14px rgba(24,48,36,.32)}
#__tip .mark{position:absolute;left:12px;top:11px;width:24px;height:24px;object-fit:contain;opacity:.95}
#__tip .t{font:700 22px/1.3 KalmeaCap,'Frank Ruhl Libre',serif;color:${brand.deep};text-align:right}
/* the finger: glides to what is about to be tapped, so a tap never appears out of nowhere */
#__fing{position:fixed;z-index:2147483647;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(233,169,161,.7);border:2px solid ${brand.deep};box-shadow:0 4px 12px rgba(24,48,36,.25);pointer-events:none;opacity:0;transition:left .5s cubic-bezier(.4,0,.2,1),top .5s cubic-bezier(.4,0,.2,1),opacity .25s ease}
#__cap span{background:${brand.deep}F0;color:${brand.cream};font:700 22px/1.35 KalmeaCap,'Frank Ruhl Libre',serif;padding:11px 20px 12px;border-radius:18px;border-bottom:3px solid ${brand.petal};text-align:center;box-shadow:0 8px 24px rgba(31,58,48,.28);max-width:100%}`;
  const ensure = () => {
    if (!document.documentElement) return null;
    if (!document.getElementById('__dress')) {
      const s = document.createElement('style'); s.id = '__dress'; s.textContent = css; document.documentElement.appendChild(s);
    }
    return true;
  };
  addEventListener('pointerdown', (e) => {
    if (!ensure()) return;
    const d = document.createElement('div'); d.className = '__tap'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
    document.documentElement.appendChild(d); setTimeout(() => d.remove(), 800);
  }, true);
  // The voice-control button and the "stuck?" bubble float over the bottom of every screen where a
  // caption has to sit. They are hidden for the recording only; nothing else about the screen changes.
  setInterval(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.innerText || '').trim();
      if ((!window.__keepVoice && /^שליטה קולית/.test(b.getAttribute('aria-label') || '')) || t === 'תקועה?') b.style.visibility = 'hidden';
    }
    // The tour hides the demo-account banner ("זו תצוגת דמו ... התחילי בחינם"): a signed-up trial user does not see it, and the
    // video must not show a sign-up prompt. Opt-in (window.__hideDemoBanner), so the older recordings are unchanged.
    if (window.__hideDemoBanner) {
      for (const d of document.querySelectorAll('div')) {
        const t = d.innerText || '';
        if (t.length < 120 && t.includes('זו תצוגת דמו') && t.includes('התחילי בחינם')) d.style.display = 'none';
      }
    }
  }, 400);
  // __tip({ text, at: 'top'|'bottom', delay: ms (default 800), hold: ms (default 3400) }): the tour's one-line pop-up
  window.__tipT1 = null; window.__tipT2 = null;
  window.__tip = (spec) => {
    if (!ensure()) return;
    let el = document.getElementById('__tip');
    if (!el) { el = document.createElement('div'); el.id = '__tip'; document.documentElement.appendChild(el); }
    clearTimeout(window.__tipT1); clearTimeout(window.__tipT2);
    el.className = spec.at === 'top' ? 'top' : 'bottom';
    el.innerHTML = '<div class="box"><img class="mark" alt="" src="/flower-pink-solid.png"><div class="t"></div></div>';
    el.querySelector('.t').textContent = spec.text;
    const delay = spec.delay == null ? 800 : spec.delay;
    window.__tipT1 = setTimeout(() => requestAnimationFrame(() => el.classList.add('on')), delay);
    window.__tipT2 = setTimeout(() => el.classList.remove('on'), delay + (spec.hold || 3400));
  };
  window.__tipOff = () => { clearTimeout(window.__tipT1); clearTimeout(window.__tipT2); const el = document.getElementById('__tip'); if (el) el.classList.remove('on'); };
  window.__finger = (x, y) => {
    if (!ensure()) return;
    let el = document.getElementById('__fing');
    if (!el) { el = document.createElement('div'); el.id = '__fing'; el.style.left = (innerWidth * 0.78) + 'px'; el.style.top = (innerHeight * 0.82) + 'px'; document.documentElement.appendChild(el); }
    requestAnimationFrame(() => { el.style.opacity = 1; el.style.left = x + 'px'; el.style.top = y + 'px'; });
  };
  window.__fingerOff = () => { const el = document.getElementById('__fing'); if (el) el.style.opacity = 0; };
  // __card({ icon, title, sub, at: 'top'|'bottom', hold: ms }): shows the card, hides itself after `hold` (default 3000)
  const ICONS = { calendar: 'icon-calendar', envelope: 'icon-envelope', wallet: 'icon-wallet', person: 'icon-person', frame: 'icon-frame', flower: 'icon-flower', sparkle: 'icon-sparkle', heart: 'icon-heart', play: 'icon-play', question: 'icon-question' };
  window.__cardTimer = null;
  window.__card = (spec) => {
    if (!ensure()) return;
    let el = document.getElementById('__card');
    if (!el) { el = document.createElement('div'); el.id = '__card'; document.documentElement.appendChild(el); }
    clearTimeout(window.__cardTimer);
    const show = () => {
      el.className = spec.at === 'top' ? 'top' : 'bottom';
      el.innerHTML = '<div class="box"><img alt="" src="/brand-icons/' + (ICONS[spec.icon] || 'icon-flower') + '.png"><div><div class="t"></div><div class="s"></div></div></div>';
      el.querySelector('.t').textContent = spec.title; el.querySelector('.s').textContent = spec.sub || '';
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
      window.__cardTimer = setTimeout(() => el.classList.remove('on'), spec.hold || 3000);
    };
    if (el.classList.contains('on')) { el.classList.remove('on'); setTimeout(show, 260); } else show();
  };
  window.__cardOff = () => { clearTimeout(window.__cardTimer); const el = document.getElementById('__card'); if (el) el.classList.remove('on'); };
  window.__say = (text) => {
    if (!ensure()) return;
    let el = document.getElementById('__cap');
    if (!el) { el = document.createElement('div'); el.id = '__cap'; el.innerHTML = '<span></span>'; document.documentElement.appendChild(el); }
    const span = el.firstChild;
    if (!text) { el.classList.remove('on'); return; }
    const swap = () => { span.textContent = text; el.classList.add('on'); };
    if (el.classList.contains('on')) { el.classList.remove('on'); setTimeout(swap, 280); } else swap();
  };
}

// ── what a person does ─────────────────────────────────────────────────────────────────
export function makeHelpers(page, name) {
  const aiCalls = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && AI_ROUTES.test(new URL(r.url()).pathname)) aiCalls.push(`${r.method()} ${r.url()}`);
  });
  const inView = async (loc) => {
    const box = await loc.boundingBox();
    return !!box && box.y >= 70 && box.y + box.height <= VIEW.height - 90;
  };
  const glide = async (loc, ms = 900) => {
    await loc.evaluate((el, ms) => new Promise((resolve) => {
      let s = el.parentElement;
      while (s && s !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 2) break;
        s = s.parentElement;
      }
      const root = !s || s === document.body;
      const sc = root ? document.scrollingElement : s;
      const top = root ? 0 : sc.getBoundingClientRect().top;
      const viewH = root ? innerHeight : sc.clientHeight;
      const r = el.getBoundingClientRect();
      const delta = (r.top - top) - ((viewH - 90) / 2 - r.height / 2);
      const from = sc.scrollTop, t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const step = (now) => { const t = Math.min(1, (now - t0) / ms); sc.scrollTop = from + delta * ease(t); t < 1 ? requestAnimationFrame(step) : resolve(); };
      requestAnimationFrame(step);
    }), ms);
  };
  // scroll the page (or the screen's scroller) by a distance, smoothly
  const scrollBy = (dy, ms = 1100) => page.evaluate(({ dy, ms }) => new Promise((resolve) => {
    const cands = [document.scrollingElement, ...document.querySelectorAll('*')].filter((e) => e && e.scrollHeight > e.clientHeight + 40 && /(auto|scroll|visible)/.test(getComputedStyle(e).overflowY));
    const sc = cands.find((e) => e === document.scrollingElement) || cands[0] || document.scrollingElement;
    const from = sc.scrollTop, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => { const t = Math.min(1, (now - t0) / ms); sc.scrollTop = from + dy * ease(t); t < 1 ? requestAnimationFrame(step) : resolve(); };
    requestAnimationFrame(step);
  }), { dy, ms });
  // The bottom tab bar is fixed to the screen. It sits inside the bottom margin inView() keeps clear for captions, so it
  // counted as "not in view" and every tap on it scrolled the whole page ~400 px to centre it: each clip that started from a
  // tab began already scrolled down (found 2026-10-06 reading the contact sheets). Fixed things are never scrolled to.
  const isFixed = (loc) => loc.evaluate((el) => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; });
  const tap = async (loc, { before = 450, after = 700 } = {}) => {
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    if (!(await inView(loc)) && !(await isFixed(loc))) { await glide(loc); await pause(250); }
    await pause(before);
    // the finger glides to the target first (0.5 s ease), a beat on it, then the tap: deliberate, never a jump
    const box = await loc.boundingBox();
    if (box) {
      await page.evaluate(([x, y]) => window.__finger && window.__finger(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
      await pause(640);
    }
    await loc.tap();
    await pause(after);
    await page.evaluate(() => window.__fingerOff && window.__fingerOff());
  };
  const type = async (loc, text, { after = 500 } = {}) => {
    await tap(loc, { before: 300, after: 250 });
    await loc.pressSequentially(text, { delay: 60 });
    await pause(after);
  };
  const nav = (label) => page.locator('button:visible', { hasText: new RegExp(`^\\s*(\\d+\\s*)?${label}\\s*$`) }).last();
  const say = (text) => page.evaluate((t) => window.__say && window.__say(t), text);
  const hush = () => say('');
  // The pop-up card (replaces the caption pill). Returns after it has slid in (~300 ms); it hides itself after `hold` ms.
  const card = async (spec) => { await page.evaluate((s) => window.__card && window.__card(s), spec); await pause(300); };
  const cardOff = () => page.evaluate(() => window.__cardOff && window.__cardOff());
  // The tour's one-line pop-up: slides in after ~0.8 s (never on frame 0), hides itself after `hold` ms.
  const tip = (text, opts = {}) => page.evaluate(([t, o]) => window.__tip && window.__tip({ text: t, ...o }), [text, opts]);
  const tipOff = () => page.evaluate(() => window.__tipOff && window.__tipOff());
  return { page, name, aiCalls, glide, scrollBy, tap, type, nav, say, hush, card, cardOff, tip, tipOff, pause, inView };
}

// ── one take: a fresh phone, signed in as the demo owner (or not), recorded ────────────
export async function recordTake(browser, dir, { owner = true, setup, play, label }) {
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'he-IL',
    permissions: [],
    // size is VIEW, not VIEW * SCALE: the recorder ignores device pixel ratio, a bigger canvas just leaves grey margins
    recordVideo: { dir, size: VIEW },
  });
  if (owner) {
    // /demo/<field> signs in by setting a session cookie on its redirect response: take the cookie, ignore the redirect.
    const r = await ctx.request.get(`${BASE}/demo/${DEMO_FIELD}`, { maxRedirects: 0 });
    if (r.status() !== 307 && r.status() !== 302) throw new Error(`/demo/${DEMO_FIELD} answered ${r.status()}, expected a redirect that signs in`);
    if (!(await ctx.cookies()).some((c) => /auth-token/.test(c.name))) throw new Error('the demo link did not set a session cookie');
  }
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.addInitScript(pageDressing, BRAND);
  const h = makeHelpers(page, label);
  let stage = 'setup';
  try {
    await setup(h);                       // getting to the screen: trimmed off the clip
    const readyAt = Date.now();
    stage = 'play';
    await play(h);
    const video = page.video();
    await ctx.close();
    return { file: await video.path(), trim: (readyAt - t0) / 1000, aiCalls: h.aiCalls };
  } catch (e) {
    try { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `failure-${label}-${stage}.png`) }); } catch {}
    console.error(`\n[tour] FAILED in "${label}" (${stage}): ${e.message.split('\n')[0]}`);
    console.error(`[tour] screenshot: out/failure-${label}-${stage}.png`);
    await ctx.close().catch(() => {});
    throw e;
  }
}

export async function openBrowser() {
  try { return await chromium.launch(); } catch (e) {
    console.error('[tour] could not start Chromium. First time on this machine? Run:  npx playwright-core install chromium');
    throw e;
  }
}

// ── title cards: Hebrew drawn by Chromium in the brand fonts, then a still image ──────
export async function renderCard(browser, file, { kicker, title, sub }) {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, locale: 'he-IL' });
  const page = await ctx.newPage();
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
html,body{margin:0;width:540px;height:960px;overflow:hidden;background:${BRAND.cream}}
.bg{position:absolute;inset:0;overflow:hidden}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden}
.glow{position:absolute;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,${BRAND.palePetal} 0%,${BRAND.cream}00 68%);top:50%;left:50%;transform:translate(-50%,-50%)}
.mark{position:absolute;top:70px;width:210px}
.k{position:relative;font:600 22px KA;letter-spacing:.5px;color:${BRAND.petal};margin-bottom:22px}
.t{position:relative;font:700 66px/1.18 KF;color:${BRAND.deep};margin:0 40px}
.rule{position:relative;width:64px;height:3px;background:${BRAND.petal};margin:30px 0 24px;border-radius:2px}
.s{position:relative;font:600 25px/1.5 KA;color:#5E6F68;margin:0 54px}
</style></head><body><div class="bg"><div class="glow"></div></div><img class="mark" src="${BASE}/kalmea-wordmark.png">
${kicker ? `<div class="k">${kicker}</div>` : ''}<div class="t">${title}</div>${sub ? `<div class="rule"></div><div class="s">${sub}</div>` : ''}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await pause(300);
  await page.screenshot({ path: file });
  await ctx.close();
}

// ── ffmpeg ────────────────────────────────────────────────────────────────────────────
export function ff(args) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}
export function duration(file) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || '');
  if (!m) throw new Error(`cannot read the duration of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

const NORM = 'fps=30,scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p';

/** A raw take -> a finished 1080x1920 30 fps mp4, setup trimmed off the front. */
export function finishClip(rawWebm, trim, outMp4) {
  ff(['-ss', Math.max(0, trim - 0.1).toFixed(2), '-i', rawWebm, '-vf', NORM, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', outMp4]);
  return duration(outMp4);
}

/** A still -> a clip of `seconds`. */
export function stillToClip(png, seconds, outMp4) {
  ff(['-loop', '1', '-framerate', '30', '-t', String(seconds), '-i', png, '-vf', NORM, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', outMp4]);
  return duration(outMp4);
}

/** Join clips in order with a short cross-fade between each. */
export function stitch(files, outMp4, FADE = 0.45) {
  const lens = files.map(duration);
  const inputs = files.flatMap((f) => ['-i', f]);
  let graph = '';
  let prev = '[0:v]';
  let acc = lens[0];
  for (let i = 1; i < files.length; i++) {
    const out = i === files.length - 1 ? '[v]' : `[x${i}]`;
    graph += `${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${(acc - FADE).toFixed(3)}${out};`;
    prev = out;
    acc += lens[i] - FADE;
  }
  ff([...inputs, '-filter_complex', graph.replace(/;$/, ''), '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', outMp4]);
  return duration(outMp4);
}

// ── H.264 + AAC for Instagram ─────────────────────────────────────────────────────────────
// ffmpeg is told the codecs outright (libx264 baseline, AAC-LC), so nothing is negotiated from a MIME string the way a browser
// recorder does (that is how "h264" once became VP9-in-mp4). Baseline is "avc1.42E0xx"; the level is 4.0 (xx = 28) because
// level 3.0 (xx = 1E) cannot carry a 1080x1920 frame. The audio is a real AAC track of silence: the voice-over goes on top later.
const AV_OUT = ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '4.0', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-shortest'];
const SILENCE = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];

/** A raw take -> 1080x1920 30 fps H.264 (baseline) + AAC mp4, setup trimmed off the front, at most maxSec long. */
export function finishClipAv(rawWebm, trim, outMp4, maxSec = 6) {
  ff(['-ss', Math.max(0, trim - 0.1).toFixed(2), '-i', rawWebm, ...SILENCE, '-vf', NORM, '-map', '0:v', '-map', '1:a', '-t', String(maxSec), ...AV_OUT, outMp4]);
  return duration(outMp4);
}

/** Clips joined with a short cross-fade, H.264 + AAC. */
export function stitchAv(files, outMp4, FADE = 0.4) {
  const lens = files.map(duration);
  const inputs = files.flatMap((f) => ['-i', f]);
  let graph = '', prev = '[0:v]', acc = lens[0];
  for (let i = 1; i < files.length; i++) {
    const out = i === files.length - 1 ? '[v]' : `[x${i}]`;
    graph += `${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${(acc - FADE).toFixed(3)}${out};`;
    prev = out; acc += lens[i] - FADE;
  }
  ff([...inputs, ...SILENCE, '-filter_complex', graph.replace(/;$/, ''), '-map', '[v]', '-map', `${files.length}:a`, ...AV_OUT, outMp4]);
  return duration(outMp4);
}

/** What the finished file really contains, read back by decoding it: the video and audio stream lines, and a full decode pass. */
export function probeCodecs(file) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const lines = (r.stderr || '').split('\n').map((l) => l.trim());
  const video = (lines.find((l) => /Stream #.*Video:/.test(l)) || '').replace(/^Stream #\S+\s*/, '');
  const audio = (lines.find((l) => /Stream #.*Audio:/.test(l)) || '').replace(/^Stream #\S+\s*/, '');
  const dec = spawnSync(ffmpegPath, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  return { video, audio, decodes: dec.status === 0 && !(dec.stderr || '').trim(), decodeErr: (dec.stderr || '').trim().slice(0, 200) };
}
