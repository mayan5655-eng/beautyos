// marketing/video-src/vlib.mjs
//
// Shared pieces for the three code-built marketing videos (price.mjs, voice.mjs, beforeafter.mjs).
//
// Method: every video is one HTML page whose whole picture is a pure function of the clock, window.__t(seconds). This
// script sets t = frame / FPS, takes a screenshot and pipes it to ffmpeg, so the result is identical on every run and
// never drops a frame. No paid service, no voice, no music: silent videos with Hebrew on-screen text.
//
// Tooling and licences (all free for commercial use by a small company):
//   - Playwright (Apache-2.0) drives Chromium and takes the screenshots.
//   - ffmpeg via the ffmpeg-static npm package encodes H.264/VP9 (the package is GPL-3.0-or-later; it is a build tool
//     here, nothing of it ships in the product, and the videos it produces carry no licence obligation).
//   - Fonts: Frank Ruhl Libre, Assistant (SIL OFL 1.1, served from public/design-fonts) and Gveret Levin (OFL).
//
// Canvas: 1080x1920 (540x960 CSS px at deviceScaleFactor 2). Reels/Stories safe zone: text between y 250 and 1580 and
// at least 64 px from the sides, which is CSS y 125..790 and x 32..508. Pass --safe to draw it on stills.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BASE, BRAND, openBrowser, log } from '../lib.mjs';

const require = createRequire(import.meta.url);
export const ffmpeg = require('ffmpeg-static');

export const W = 540, H = 960, FPS = 30;
export { BASE, BRAND };
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUTDIR = path.join(HERE, '..', 'videos');
const REPO = path.join(HERE, '..', '..');

const handFont = fs.readFileSync(path.join(REPO, 'fonts', 'GveretLevin.woff2')).toString('base64');

export const baseCss = `
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-900.ttf);font-weight:900}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-700.ttf);font-weight:700}
@font-face{font-family:KH;src:url(data:font/woff2;base64,${handFont}) format("woff2")}
:root{--cream:#F0EADE;--deep:#183024;--green:#46B37B;--ink:#2A2233;--ink2:#5C4F63;--petal:#E9A9A1;--hl:#B26557;--line:#E7DFEC}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--cream);direction:rtl}
body{font-family:KA,sans-serif;font-weight:600;color:var(--ink)}
.abs{position:absolute}
.c{left:0;right:0;text-align:center}
.kf{font-family:KF,serif;font-weight:700;color:var(--deep)}
.ltr{direction:ltr;unicode-bidi:isolate}
#safe{position:absolute;left:32px;right:32px;top:125px;height:665px;border:1px dashed #f0f;pointer-events:none;z-index:9999;display:none}
`;

export const baseJs = `
const clamp=(x)=>Math.max(0,Math.min(1,x));
const out3=(x)=>1-Math.pow(1-clamp(x),3);
const inOut=(x)=>{x=clamp(x);return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2};
const back=(x)=>{x=clamp(x);const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const $=(id)=>document.getElementById(id);
const win=(t,a,b)=>clamp((t-a)/(b-a));          // 0..1 progress between a and b
const fade=(t,a,b,c,d)=>out3((t-a)/(b-a))*(1-inOut((t-c)/(d-c))); // in over a..b, out over c..d
const ils=(n)=>'₪'+Math.round(n).toLocaleString('en-US');
`;

export function doc(css, body, script) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${baseCss}${css}</style></head><body>${body}<div id="safe"></div><script>${baseJs}${script}</script></body></html>`;
}

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const has = (n) => args.includes(`--${n}`);

function run(cmd, a) {
  const r = spawnSync(cmd, a, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${(r.stderr || '').slice(-400)}`);
}

export async function render({ name, seconds, html, posterAt }) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const stills = flag('still');
  const browser = await openBrowser();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: stills ? 1 : 2, locale: 'he-IL' });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  if (has('safe')) await page.evaluate(() => { document.getElementById('safe').style.display = 'block'; });

  if (stills) {
    const dir = path.join(OUTDIR, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of stills.split(',')) {
      await page.evaluate((x) => window.__t(x), Number(t));
      await page.screenshot({ path: path.join(dir, `${name}-${String(t).replace('.', '_')}.png`) });
    }
    await browser.close();
    log(`${name}: stills at ${stills}`);
    return;
  }

  const mp4 = path.join(OUTDIR, `${name}-1080x1920.mp4`);
  const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(FPS), '-an', '-movflags', '+faststart', mp4]);
  let err = ''; enc.stderr.on('data', (d) => { err += d; });
  const done = new Promise((res) => enc.on('close', res));
  const N = Math.round(seconds * FPS);
  for (let i = 0; i < N; i++) {
    await page.evaluate((t) => window.__t(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r));
    if (i % 150 === 0) log(`${name}: frame ${i}/${N}`);
  }
  enc.stdin.end();
  const code = await done;
  if (!stills && posterAt != null) {
    await page.evaluate((t) => window.__t(t), posterAt);
    await page.screenshot({ path: path.join(OUTDIR, `${name}-poster-full.png`) });
  }
  await browser.close();
  if (code !== 0) throw new Error(`encode failed: ${err.slice(-400)}`);

  // light landing-page versions: 720x1280, 2 MB or less, muted, plus a WebM and a poster
  let crf = 27, light = path.join(OUTDIR, `${name}-720x1280.mp4`);
  for (; crf <= 36; crf += 3) {
    run(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-an', '-movflags', '+faststart', light]);
    if (fs.statSync(light).size <= 2 * 1024 * 1024) break;
  }
  const webm = path.join(OUTDIR, `${name}-720x1280.webm`);
  run(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-an', webm]);
  const poster = path.join(OUTDIR, `${name}-poster.jpg`);
  run(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(posterAt ?? seconds / 2), '-i', mp4, '-frames:v', '1', '-vf', 'scale=720:1280:flags=lanczos', '-q:v', '4', poster]);
  const fp = (f) => `${path.basename(f)} ${(fs.statSync(f).size / 1024 / 1024).toFixed(2)} MB`;
  log(`${name}: ${fp(mp4)}; ${fp(light)} (crf ${crf}); ${fp(webm)}; ${fp(poster)}`);
}
