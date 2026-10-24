// marketing/motion-lib.mjs
//
// The engine behind the animated videos: real demo clips inside a phone frame, Gveret Levin titles, pop-up windows, and a
// page where every element is a pure function of the clock t, rendered one frame at a time (no live animation, no dropped
// frames, same result on every run). (welcome-motion.mjs predates this file and keeps its own copy of the engine; it is
// approved and shipped as rendered, so it was left alone.)
//
// What it gives:
//   el / lines / ltr / title / phone / pop / bubble / wa / petals / endCard   building blocks (times are absolute seconds)
//   timeline()                      scenes listed with their own length; times inside a scene are relative to its start
//   page(scenes)                    the full HTML (base CSS + the __t runtime)
//   recordClips(defs, only)         real clips of the app (lib.mjs recordTake) -> out/motion/clips/<id>.webm (+ <id>.json marks)
//   render({ html, seconds, ... })  --frame=<t> still, or the full mp4 with a given audio track
//
// Rules carried over from welcome-motion.mjs: demo tenant only; any non-GET to an AI route aborts a take (recordTake); Hebrew is
// drawn by Chromium, one line per element with the breaks chosen by the caller, no digit at the start of a line, times / sums /
// phone numbers isolated with ltr(); nothing may run off the side of the frame (checked before rendering).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { BASE, BRAND, OUT, openBrowser, recordTake, ff, duration, log } from './lib.mjs';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

export const FPS = 30, W = 540, H = 960, DPR = 720 / 540;
export const DIR = path.join(OUT, 'motion'), SHOTS = path.join(DIR, 'shots'), CLIPS = path.join(DIR, 'clips');
export const MUSIC = path.join(path.dirname(OUT), 'in', 'music', 'gr0za-beauty-skincare-cosmetic-music-582613.mp3');
export const PRESENTER = `${BASE}/defaults/presenters/skin-presenter-1.jpg`;
for (const d of [SHOTS, CLIPS]) fs.mkdirSync(d, { recursive: true });

export const b64 = (f, type) => {
  if (!fs.existsSync(f)) throw new Error(`missing ${f}`);
  return `data:${type};base64,${fs.readFileSync(f).toString('base64')}`;
};
const GVERET = () => b64(new URL('../fonts/GveretLevin.woff2', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'font/woff2');
export const clipSrc = (id) => {
  const f = path.join(CLIPS, `${id}.webm`);
  if (!fs.existsSync(f)) throw new Error(`missing clip ${f}: record it first (--clips)`);
  return b64(f, 'video/webm');
};
/** The marks a clip's play() recorded (seconds into the clip), e.g. where a second scene should pick it up. */
/** Length of a recorded clip in seconds. */
export const clipDuration = (id) => duration(path.join(CLIPS, `${id}.webm`));
export const clipMarks = (id) => { const f = path.join(CLIPS, `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; };

// ── building blocks ────────────────────────────────────────────────────────────────────────────────
export const el = (cls, tin, tout, a, inner, style = '', extra = '') => `<div class="el ${cls}" data-in="${tin}" data-out="${tout}" data-a="${a}" ${extra} style="${style}">${inner}</div>`;
export const lines = (ls) => ls.map((l) => `<div>${l}</div>`).join('');
export const ltr = (s) => `<span class="ltr">${s}</span>`;
export const title = (tin, tout, l1, l2, cls = '') => el(`title ${cls}`, tin, tout, 'up', lines(l2 ? [l1, l2] : [l1]));
/** The phone, playing a real clip from `offset` seconds into it, starting when it lands, and holding at `until` (clip seconds); `rate` > 1 plays it faster (a long real take fits its narration). */
export const phone = (tin, tout, id, a = 'rise', offset = 0, until = 999, rate = 1) => el('phone', tin, tout, a,
  `<video muted playsinline preload="auto" data-start="${+(tin + 0.2).toFixed(2)}" data-offset="${offset}" data-until="${until}" data-rate="${rate}" src="${clipSrc(id)}"></video>`, 'left:125px', 'data-float="3"');
/** A pop-up window, like a phone notification. */
export const pop = (tin, tout, head, ls, style, icon = 'flower') => el('pop', tin, tout, 'drop',
  `<img src="${BASE}/brand-icons/icon-${icon}.png"><div class="pb"><div class="ph"><b>${head}</b><span>עכשיו</span></div>${lines(ls)}</div>`, style, 'data-float="3"');
export const bubble = (cls, ls, tin, tout, style, a = 'pop', fl = 4) => el(`bub ${cls}`, tin, tout, a, lines(ls), style, `data-float="${fl}"`);
export const wa = (kicker, ls, tin, tout, style, extra = '') => el('bub wa', tin, tout, 'pop', `<div class="k">${kicker}</div>${lines(ls)}${extra}`, style, 'data-float="4"');
export const petals = (cx, cy, tin, n = 10) => Array.from({ length: n }, (_, i) => {
  const ang = (i / n) * Math.PI * 2, d = 120 + (i % 3) * 45;
  return `<img class="el petal" src="${BASE}/flower-pink-solid.png" data-in="${tin}" data-out="${+(tin + 1.4).toFixed(2)}" data-a="burst" data-dx="${Math.round(Math.cos(ang) * d)}" data-dy="${Math.round(Math.sin(ang) * d)}" style="left:${cx}px;top:${cy}px">`;
}).join('');
/** The closing card: the product's AI presenter (labelled), two handwritten lines, the support line, the wordmark. */
export const endCard = (tin, l1, l2) => `
  ${el('end-photo', tin, 999, 'pop', `<img src="${PRESENTER}">`)}
  ${el('ailabel', +(tin + 0.5).toFixed(2), 999, 'fade', 'דמות AI להמחשה')}
  ${el('title big', +(tin + 0.5).toFixed(2), 999, 'up', lines([l1, l2]), 'top:490px')}
  ${el('phoneno', +(tin + 1.3).toFixed(2), 999, 'up', `<div class="ltr">050-7321978</div>`)}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${+(tin + 1.9).toFixed(2)}" data-out="999" data-a="pop" style="left:180px;top:745px;width:180px">
  ${petals(270, 300, +(tin + 0.3).toFixed(2), 12)}`;

/** Scenes with their own length; `build(at, end, t0)` gets at(s) = absolute time of s seconds into the scene. */
export function timeline() {
  const scenes = [];
  let clock = 0;
  return {
    scene(len, build) { const t0 = clock; const end = +(t0 + len - 0.3).toFixed(2); scenes.push(build((s) => +(t0 + s).toFixed(2), end, t0)); clock += len; return t0; },
    get seconds() { return +clock.toFixed(2); },
    get html() { return scenes.join('\n'); },
  };
}

// ── the page ──────────────────────────────────────────────────────────────────────────────────────
const CSS = `
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.cream}}
#stage{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
.el{position:absolute;opacity:0;will-change:transform,opacity}
.title{left:18px;right:18px;top:64px;text-align:center;font:48px/1.12 KG,serif;color:${BRAND.deep}}
.title.big{font-size:62px}
.phone{top:300px;width:290px;height:515px;border-radius:34px;overflow:hidden;background:#fff;border:7px solid ${BRAND.deep};box-shadow:0 30px 60px -24px rgba(31,58,48,.45)}
.phone video{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.pop{left:30px;right:30px;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.97);border-radius:22px;padding:12px 16px;box-shadow:0 24px 44px -16px rgba(31,58,48,.5);border:1px solid rgba(31,58,48,.08)}
.pop img{width:44px;height:44px;border-radius:12px;background:${BRAND.palePetal};padding:4px;box-sizing:border-box}
.pop .pb{flex:1;font:600 18px/1.35 KA;color:#3B4842}
.pop .ph{display:flex;justify-content:space-between;align-items:baseline}.pop .ph b{font:700 20px KF;color:${BRAND.deep}}.pop .ph span{font:600 13px KA;color:#8A948F}
.bub{max-width:380px;padding:12px 18px;border-radius:22px;font:600 20px/1.35 KA,sans-serif;box-shadow:0 14px 30px -14px rgba(31,58,48,.38);white-space:nowrap}
.bub div:empty{height:10px}
.ai{background:#FFFDF8;color:${BRAND.deep};border:2px solid ${BRAND.petal};border-bottom-right-radius:6px}
.tag{background:${BRAND.petal};color:${BRAND.deep};font:700 19px KA;border-radius:999px}
.wa{background:#FFFFFF;color:#26332D;border-right:5px solid #25D366;border-radius:16px}
.wa .k{font:700 14px KA;color:#25A55A;margin-bottom:4px}
.btns{display:flex;gap:8px;margin-top:12px}.btns span{flex:1;text-align:center;font:700 17px KA;color:#1B7F4B;background:#EAF7EF;border-radius:10px;padding:7px 10px}
.note{font:600 14px KA;color:#6B756F}
.thumb{width:${55 * 2.3}px;height:${100 * 2.3}px;border-radius:14px;box-shadow:0 18px 34px -16px rgba(31,58,48,.5);border:3px solid #fff}
.petal{width:30px;height:30px}
.ltr{direction:ltr;unicode-bidi:isolate}
.end-photo{left:120px;top:140px;width:300px;height:300px;border-radius:50%;overflow:hidden;border:8px solid #fff;box-shadow:0 26px 50px -20px rgba(31,58,48,.5)}
.end-photo img{width:100%;height:100%;object-fit:cover;object-position:50% 18%}
.ailabel{font:600 13px KA;color:${BRAND.deep};background:#fff;padding:4px 10px;border-radius:10px;left:200px;top:430px}
.phoneno{left:0;right:0;top:665px;text-align:center;font:700 32px KA;color:#4F5F58}`;

// every element is a function of t; clips are seeked to their frame and awaited before the screenshot
const RUNTIME = `
const clamp = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
const inOut = (x) => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const back = (x) => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const els = [...document.querySelectorAll('.el')].map((e, i) => ({ e, i, tin: +e.dataset.in, tout: +e.dataset.out, a: e.dataset.a, fl: +(e.dataset.float || 0), rot: +(e.dataset.rot || 0), dx: +(e.dataset.dx || 0), dy: +(e.dataset.dy || 0), v: e.querySelector('video') }));
window.__t = async (t) => {
  document.getElementById('b1').style.transform = 'translate(' + Math.sin(t * .4) * 30 + 'px,' + Math.cos(t * .3) * 24 + 'px)';
  document.getElementById('b2').style.transform = 'translate(' + Math.cos(t * .35) * 28 + 'px,' + Math.sin(t * .45) * 22 + 'px)';
  const seeks = [];
  for (const o of els) {
    const k = (t - o.tin) / .55, p = out3(k), q = inOut((t - o.tout) / .4);
    let op = clamp(k * 2) * (1 - q), tr = '';
    const fl = o.fl ? ' translateY(' + (Math.sin(t * 1.7 + o.i) * o.fl).toFixed(2) + 'px)' : '';
    switch (o.a) {
      case 'pop': tr = 'scale(' + (.3 + .7 * back(k)) + ')'; break;
      case 'up': tr = 'translateY(' + (1 - p) * 36 + 'px)'; break;
      case 'rise': tr = 'translateY(' + (1 - out3((t - o.tin) / .8)) * 700 + 'px)'; break;
      case 'left': tr = 'translateX(' + -(1 - p) * 600 + 'px) rotate(' + -(1 - p) * 8 + 'deg)'; break;
      case 'right': tr = 'translateX(' + (1 - p) * 600 + 'px) rotate(' + (1 - p) * 8 + 'deg)'; break;
      case 'drop': tr = 'translateY(' + -(1 - back(k)) * 220 + 'px) rotate(' + Math.sin(clamp((t - o.tin - .5) / .6) * Math.PI * 4) * 2 * (1 - clamp((t - o.tin - .5) / .6)) + 'deg)'; break;
      case 'spin': tr = 'scale(' + (.3 + .7 * back(k)) + ') rotate(' + (1 - p) * -120 + 'deg)'; break;
      case 'fly': tr = 'translate(' + (1 - p) * (o.i % 2 ? 260 : -260) + 'px,' + (1 - p) * 180 + 'px) rotate(' + (o.rot + (1 - p) * 30) + 'deg) scale(' + (.5 + .5 * back(k)) + ')'; break;
      case 'burst': { const b = out3((t - o.tin) / 1.1); tr = 'translate(' + o.dx * b + 'px,' + o.dy * b + 'px) rotate(' + b * 220 + 'deg) scale(' + (1 - b * .4) + ')'; op = clamp(k * 3) * (1 - clamp((t - o.tin - .6) / .8)); break; }
      default: tr = '';
    }
    o.e.style.opacity = op.toFixed(3);
    o.e.style.transform = tr + fl;
    if (o.v && op > 0) {
      const want = Math.max(0, Math.min((o.v.duration || 0) - .05, +(o.v.dataset.until || 999), (t - +o.v.dataset.start) * +(o.v.dataset.rate || 1) + +(o.v.dataset.offset || 0)));
      if (Math.abs(o.v.currentTime - want) > .001) seeks.push(new Promise((r) => { o.v.addEventListener('seeked', r, { once: true }); o.v.currentTime = want; }));
    }
  }
  await Promise.all(seeks);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};`;

export function page(body, extraCss = '') {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:KG;src:url(${GVERET()}) format('woff2')}
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
${CSS}
${extraCss}
</style></head><body><div id="stage">
<div class="blob" id="b1" style="width:420px;height:420px;background:${BRAND.palePetal};left:-140px;top:-100px"></div>
<div class="blob" id="b2" style="width:360px;height:360px;background:${BRAND.sage}88;right:-130px;bottom:-90px"></div>
<img src="${BASE}/flower-full.png" style="position:absolute;left:-60px;bottom:-50px;width:240px;opacity:.07">
${body}
</div><script>${RUNTIME}</script></body></html>`;
}

// ── real clips ───────────────────────────────────────────────────────────────────────────────────
/**
 * defs: { id: { owner?, setup(h), play(h, mark) } }. play may call mark('name') to note where something happens in the clip
 * (seconds into the finished clip), saved next to it as <id>.json. Every frame is a keyframe: the renderer seeks 30 times a second.
 */
export async function recordClips(defs, only) {
  const browser = await openBrowser();
  try {
    for (const [id, c] of Object.entries(defs)) {
      if (only && !only.includes(id)) continue;
      log(`clip ${id}`);
      const raw = path.join(OUT, 'parts', `motion-${id}`);
      fs.rmSync(raw, { recursive: true, force: true });
      const marks = {};
      let playStart = 0;
      const setup = async (h) => { await h.page.addInitScript(() => { window.__hideDemoBanner = true; }); await c.setup(h); };
      const play = async (h) => { playStart = Date.now(); await c.play(h, (name) => { marks[name] = (Date.now() - playStart) / 1000; }); };
      const take = await recordTake(browser, raw, { owner: c.owner !== false, setup, play, label: `motion-${id}` });
      if (take.aiCalls.length) throw new Error(`clip ${id} touched an AI route: ${take.aiCalls.join(', ')}`);
      const out = path.join(CLIPS, `${id}.webm`);
      // the clip starts 0.1 s before play() did, so a mark at m seconds into play() is at m + 0.1 in the clip
      ff(['-ss', Math.max(0, take.trim - 0.1).toFixed(2), '-i', take.file, '-an', '-vf', 'fps=30', '-c:v', 'libvpx', '-g', '1', '-b:v', '2500k', '-crf', '8', out]);
      for (const k of Object.keys(marks)) marks[k] = +(marks[k] + 0.1).toFixed(2);
      fs.writeFileSync(path.join(CLIPS, `${id}.json`), JSON.stringify(marks));
      log(`   ${duration(out).toFixed(1)} s ${Object.keys(marks).length ? JSON.stringify(marks) : ''}`);
    }
  } finally {
    await browser.close();
  }
}

// ── render ───────────────────────────────────────────────────────────────────────────────────────
/**
 * still: a time in seconds -> writes `stillFile` and returns. Otherwise renders `seconds` of frames into `outFile` (720x1280, 30 fps,
 * H.264 Main) with `audio` (a file of exactly that length) as AAC.
 */
export async function render({ html, seconds, outFile, audio, still, stillFile = path.join(DIR, 'frame.png') }) {
  const browser = await openBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, locale: 'he-IL' });
    const pg = await ctx.newPage();
    await pg.setContent(html, { waitUntil: 'networkidle', timeout: 180000 });
    await pg.evaluate(() => document.fonts.ready);
    await pg.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await pg.evaluate(() => Promise.all([...document.querySelectorAll('video')].map((v) => (v.readyState >= 2 ? 0 : new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('a clip did not load')); })))));
    if (!(await pg.evaluate(() => document.fonts.check('48px KG')))) throw new Error('Gveret Levin did not load');
    const broken = await pg.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src.slice(0, 80)));
    if (broken.length) throw new Error(`images did not load: ${broken.join(', ')}`);
    const wide = await pg.evaluate(() => [...document.querySelectorAll('.bub,.title,.pop')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.slice(0, 30), l: r.left, r: r.right }; }).filter((x) => x.l < 4 || x.r > 536));
    if (wide.length) throw new Error(`runs off the frame: ${wide.map((x) => `"${x.t}" ${Math.round(x.l)}-${Math.round(x.r)}`).join('; ')}`);

    if (still != null) {
      await pg.evaluate((t) => window.__t(t), +still);
      await pg.screenshot({ path: stillFile });
      return stillFile;
    }
    const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
      '-map', '0:v', '-map', '1:a', '-vf', 'scale=720:1280:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1',
      '-preset', 'slow', '-crf', '21', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-t', String(seconds), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'ignore', 'pipe'] });
    let encErr = ''; enc.stderr.on('data', (d) => { encErr += d; });
    const done = new Promise((res) => enc.on('close', res));
    const N = Math.round(FPS * seconds);
    for (let i = 0; i < N; i++) {
      await pg.evaluate((t) => window.__t(t), i / FPS);
      const png = await pg.screenshot({ type: 'png' });
      if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r));
      if (i % 300 === 0) log(`frame ${i}/${N}`);
    }
    enc.stdin.end();
    if ((await done) !== 0) throw new Error(`ffmpeg: ${encErr.slice(-800)}`);
    return outFile;
  } finally {
    await browser.close();
  }
}
