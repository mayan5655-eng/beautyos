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
      if (/^שליטה קולית/.test(b.getAttribute('aria-label') || '') || t === 'תקועה?') b.style.visibility = 'hidden';
    }
  }, 400);
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
  const tap = async (loc, { before = 450, after = 700 } = {}) => {
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    if (!(await inView(loc))) { await glide(loc); await pause(250); }
    await pause(before);
    await loc.tap();
    await pause(after);
  };
  const type = async (loc, text, { after = 500 } = {}) => {
    await tap(loc, { before: 300, after: 250 });
    await loc.pressSequentially(text, { delay: 60 });
    await pause(after);
  };
  const nav = (label) => page.locator('button:visible', { hasText: new RegExp(`^\\s*(\\d+\\s*)?${label}\\s*$`) }).last();
  const say = (text) => page.evaluate((t) => window.__say && window.__say(t), text);
  const hush = () => say('');
  return { page, name, aiCalls, glide, scrollBy, tap, type, nav, say, hush, pause, inView };
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
html,body{margin:0;height:100%;background:${BRAND.cream}}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden}
.glow{position:absolute;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,${BRAND.palePetal} 0%,${BRAND.cream}00 68%);top:50%;left:50%;transform:translate(-50%,-50%)}
.mark{position:absolute;top:70px;width:210px}
.k{position:relative;font:600 22px KA;letter-spacing:.5px;color:${BRAND.petal};margin-bottom:22px}
.t{position:relative;font:700 66px/1.18 KF;color:${BRAND.deep};margin:0 40px}
.rule{position:relative;width:64px;height:3px;background:${BRAND.petal};margin:30px 0 24px;border-radius:2px}
.s{position:relative;font:600 25px/1.5 KA;color:#5E6F68;margin:0 54px}
</style></head><body><div class="glow"></div><img class="mark" src="${BASE}/kalmea-wordmark.png">
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
