// marketing/cost-animation.mjs
//
// A 30 s vertical video (1080x1920, H.264 mp4, 30 fps) built in code and recorded FRAME BY FRAME: the page has no running
// animation at all - everything on screen is a pure function of the clock `t`, and this script sets t = frame / 30, takes
// a screenshot, and pipes the frames to ffmpeg. So the result is identical on every run and never drops or doubles a frame
// the way a screen recording of a live animation does.
//
//   0.0-4.0   the flower and the wordmark settle in
//   4.0-12.0  "כמה זה עולה בלי קלמיה", then the cost table draws line by line (the landing page's own rows and wording)
//  12.0-17.0  the total counts up to "עד 10,068 ₪ בחודש" and holds
//  22.0-30.0  the table leaves; it closes on "הכל נכנס למערכת אחת" and kalmea.app
//
// The rows are READ from app/LandingPage.jsx, so the video cannot drift from the page; the script refuses to render if the
// total is no longer 10,068 (the number the copy in this video says).
//
//   node cost-animation.mjs                  -> out/cost-animation.mp4
//   node cost-animation.mjs --frame=16.5     -> out/cost-frame.png, one still at t = 16.5 s (for checking)
//
// Hebrew is composed in the DOM (Chromium shapes it), with the number, the shekel sign and the words as separate flex
// children so no bidi rule can move a symbol to the wrong end of the line.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BASE, BRAND, OUT, openBrowser, log } from './lib.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

const FPS = 30, SECONDS = 30, W = 540, H = 960;
const stillAt = process.argv.find((a) => a.startsWith('--frame='))?.split('=')[1];

// ── the landing page's own rows ─────────────────────────────────────────────────────
const landing = fs.readFileSync(new URL('../app/LandingPage.jsx', import.meta.url), 'utf8');
const block = landing.slice(landing.indexOf('const COST_ROWS = ['), landing.indexOf('];', landing.indexOf('const COST_ROWS = [')));
const ROWS = [...block.matchAll(/label:\s*"([^"]+)",\s*low:\s*(\d+),\s*high:\s*(\d+)/g)].map((m) => ({ label: m[1], low: +m[2], high: +m[3] }));
const TOTAL_HIGH = ROWS.reduce((s, r) => s + r.high, 0);
if (ROWS.length < 4 || TOTAL_HIGH !== 10068) throw new Error(`the landing page's table no longer totals 10,068 (rows: ${ROWS.length}, total: ${TOTAL_HIGH}); update the copy of this video first`);

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#F0EADE}
.abs{position:absolute;left:0;right:0;text-align:center}
.kf{font-family:KF,serif;font-weight:700;color:${BRAND.deep}}
.ka{font-family:KA,sans-serif;font-weight:600}
#card{position:absolute;left:34px;right:34px;top:178px;background:#fff;border-radius:19px;border:1px solid rgba(24,48,36,.08);box-shadow:0 1px 2px rgba(24,48,36,.04),0 18px 34px -20px rgba(24,48,36,.22);overflow:hidden}
.row{display:flex;align-items:center;justify-content:space-between;padding:0 22px;height:70px;border-bottom:1px solid #ECE4F0}
.row:last-child{border-bottom:none}
.row .l{font:600 20px KA;color:#2A2233}
.row .v{font:600 20px KA;color:#5C4F63;direction:ltr;unicode-bidi:plaintext}
#totalline{display:flex;justify-content:center;align-items:baseline;gap:12px;direction:rtl}
#totalline span{font:700 60px/1.1 KF;color:${BRAND.deep}}
#totalline .n{direction:ltr;unicode-bidi:isolate}
#stage{position:absolute;inset:0;overflow:hidden}
</style></head><body><div id="stage">
<img id="wm" src="${BASE}/flower-full.png" style="position:absolute;left:-90px;top:-70px;width:330px;opacity:.07">
<img id="introflower" src="${BASE}/flower-full.png" class="abs" style="left:170px;right:auto;width:200px;top:250px">
<img id="introword" src="${BASE}/kalmea-wordmark.png" style="position:absolute;left:105px;width:330px;top:470px">
<img id="head" src="${BASE}/kalmea-wordmark.png" style="position:absolute;left:185px;width:170px;top:46px;opacity:0">
<div id="eyebrow" class="abs kf" style="top:118px;font-size:32px;opacity:0">כמה זה עולה בלי קלמיה</div>
<div id="card">${ROWS.map((r) => `<div class="row" style="opacity:0"><span class="l">${r.label}</span><span class="v">₪${r.low.toLocaleString('he-IL')}–₪${r.high.toLocaleString('he-IL')}</span></div>`).join('')}</div>
<div id="tlabel" class="abs ka" style="top:640px;font-size:22px;color:#5C4F63;opacity:0">סך הכל, לפני קלמיה</div>
<div id="total" class="abs" style="top:690px;opacity:0"><div id="totalline"><span>עד</span><span class="n" id="num">0</span><span>₪</span><span>בחודש</span></div></div>
<img id="endflower" src="${BASE}/flower-full.png" style="position:absolute;left:210px;width:120px;top:250px;opacity:0">
<div id="close1" class="abs kf" style="top:400px;font-size:58px;line-height:1.2;opacity:0">הכל נכנס<br>למערכת אחת</div>
<div id="url" class="abs" style="top:600px;opacity:0"><div style="width:54px;height:3px;background:${BRAND.petal};border-radius:2px;margin:0 auto 20px"></div><div class="ka" style="font-size:28px;color:#4a5a54;direction:ltr">kalmea.app</div></div>
</div><script>
const clamp = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
const inOut = (x) => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const $ = (id) => document.getElementById(id);
const rows = [...document.querySelectorAll('.row')];
const TOTAL = ${TOTAL_HIGH};
// everything below is a pure function of t (seconds)
window.__t = (t) => {
  // intro: flower settles (0.2-1.9), wordmark rises (1.0-2.4), both leave (3.2-3.9)
  const f = out3((t - .2) / 1.7), w = out3((t - 1.0) / 1.4), leave = 1 - inOut((t - 3.2) / .7);
  $('introflower').style.opacity = f * leave;
  $('introflower').style.transform = 'translateY(' + (1 - f) * 26 + 'px) rotate(' + (1 - f) * -9 + 'deg) scale(' + (.88 + .12 * f) + ')';
  $('introword').style.opacity = w * leave;
  $('introword').style.transform = 'translateY(' + (1 - w) * 16 + 'px)';
  // header wordmark
  $('head').style.opacity = out3((t - 3.7) / .6) * (1 - inOut((t - 22) / .8));
  // eyebrow
  const e = out3((t - 4.2) / .7) * (1 - inOut((t - 22) / .8));
  $('eyebrow').style.opacity = e; $('eyebrow').style.transform = 'translateY(' + (1 - out3((t - 4.2) / .7)) * 12 + 'px)';
  // rows draw one by one, 1.1 s apart from 5.2 s
  const leaveTable = 1 - inOut((t - 22) / .8);
  rows.forEach((r, i) => { const p = out3((t - (5.2 + i * 1.1)) / .55); r.style.opacity = p * leaveTable; r.style.transform = 'translateY(' + (1 - p) * 14 + 'px)'; });
  $('card').style.opacity = out3((t - 4.9) / .4) * leaveTable;
  // total label, then the count-up (12.4-16.4), holds
  $('tlabel').style.opacity = out3((t - 12.0) / .6) * leaveTable;
  const tot = out3((t - 12.4) / 4.0);
  $('total').style.opacity = out3((t - 12.4) / .5) * leaveTable;
  $('num').textContent = Math.round(TOTAL * tot).toLocaleString('en-US');
  // closing
  const c = out3((t - 23.0) / 1.0), ef = out3((t - 22.6) / 1.2);
  $('endflower').style.opacity = ef; $('endflower').style.transform = 'translateY(' + (1 - ef) * 20 + 'px) rotate(' + (1 - ef) * 8 + 'deg)';
  $('close1').style.opacity = c; $('close1').style.transform = 'translateY(' + (1 - c) * 14 + 'px)';
  const u = out3((t - 26.0) / .8);
  $('url').style.opacity = u; $('url').style.transform = 'translateY(' + (1 - u) * 10 + 'px)';
};
window.__t(0);
</script></body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await openBrowser();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: 'he-IL' });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));

if (stillAt) {
  await page.evaluate((t) => window.__t(t), +stillAt);
  const f = path.join(OUT, 'cost-frame.png');
  await page.screenshot({ path: f });
  log(`still at t=${stillAt}s -> ${f}`);
  await browser.close();
  process.exit(0);
}

const outFile = path.join(OUT, 'cost-animation.mp4');
const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', '-r', String(FPS), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'ignore', 'pipe'] });
let encErr = ''; enc.stderr.on('data', (d) => { encErr += d; });
const done = new Promise((res) => enc.on('close', res));
const N = FPS * SECONDS;
for (let i = 0; i < N; i++) {
  await page.evaluate((t) => window.__t(t), i / FPS);
  const png = await page.screenshot({ type: 'png' });
  if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r));
  if (i % 150 === 0) log(`frame ${i}/${N}`);
}
enc.stdin.end();
const code = await done;
await browser.close();
if (code !== 0) { console.error(encErr.slice(-800)); process.exit(1); }
log(`${N} frames -> ${outFile}`);
