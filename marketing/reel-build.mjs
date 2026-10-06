// marketing/reel-build.mjs
//
// The Noa reel: 1080x1920, 30 fps, ~27.5 s, H.264, silent. Footage and the real app screens are cut and graded with ffmpeg;
// every Hebrew word and every graphic is drawn by Chromium frame by frame (a pure function of the clock t, so the result is
// the same on every run and Hebrew is shaped by the browser, never by ffmpeg's drawtext).
//
//   0.0-5.0   Noa to camera (blurred, extended background; her whole frame, uncropped; a small "made with AI" label)
//   5.0-8.0   the pain: the phones b-roll slowed, "עוד הודעה... ועוד אחת..."
//   8.0-11.0  before / after: the same chaos on top, her real calendar below
//  11.0-21.0  the real screens in a phone: booking -> confirmation -> calendar (reel-screens.mjs recorded them)
//  21.0-24.0  the calm moment: two treatment clips, "ועכשיו? את פשוט עובדת.", the logo flower
//  24.0-27.5  end card
//
//   node reel-build.mjs                  everything
//   node reel-build.mjs assets over under scenes final     (any subset, in this order)
//   node reel-build.mjs overstill=5.8,7.4,15       transparent-layer stills on grey -> out/reel/overstills/

import fs from 'node:fs';
import path from 'node:path';
import { BASE, BRAND, OUT, openBrowser, log, ff } from './lib.mjs';

const R = path.join(OUT, 'reel');
const D = (...p) => path.join(R, ...p);
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const FPS = 30, TOTAL = 27.5, S2_LEN = 10.5;
const marks = JSON.parse(fs.readFileSync(D('marks.json'), 'utf8'));
const T = marks.trim;

const args = process.argv.slice(2);
const stillsArg = args.find((a) => a.startsWith('overstill='));
const stages = args.filter((a) => !a.includes('='));
const want = (s) => !stillsArg && (stages.length === 0 || stages.includes(s));

for (const f of ['noa', 'broll-phones-chaos', 'broll-treatment-1', 'broll-treatment-2']) {
  if (!fs.existsSync(path.join(HERE, `${f}.mp4`))) throw new Error(`missing ${f}.mp4 in marketing/`);
}
const IN = (f) => path.join(HERE, `${f}.mp4`);

// ── grades: one warm family, tuned per clip so they sit together ──────────────────────────────
const G_NOA = 'eq=contrast=1.03:saturation=1.04,colorbalance=rs=.02:bs=-.03:rm=.015:bm=-.02';
const G_CHAOS = 'eq=contrast=1.05:saturation=1.08:brightness=0.01,colorbalance=rs=.05:gs=.01:bs=-.07:rm=.04:bm=-.05';
const G_TREAT = 'eq=contrast=1.03:saturation=1.05,colorbalance=rs=.03:bs=-.05:rm=.02:bm=-.03';
const SLOW = (k, fps = 30) => `setpts=${k}*PTS,minterpolate=fps=${fps}:mi_mode=mci:mc_mode=obmc:me_mode=bidir:me=epzs:mb_size=16:search_param=32`;
const ZOOM = (z, secs, w = 1080, h = 1920) => `scale=w='trunc(${w}*(1+${z}*t/${secs})/2)*2':h=-2:eval=frame:flags=bicubic,crop=${w}:${h}:(iw-${w})/2:(ih-${h})/2`;
const ENC = ['-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '30'];

// ═════════════════════════════ shared page pieces ═════════════════════════════════════════════
const FONTS = `@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
@font-face{font-family:KB;src:url(${BASE}/design-fonts/Assistant-700.ttf);font-weight:700}`;
const JS_UTIL = `
const clamp = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
const io = (x) => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const vis = (t, a, b, din, dout) => { din = din || .5; dout = dout || .4; return out3((t - a) / din) * (1 - io((t - (b - dout)) / dout)); };
const $ = (id) => document.getElementById(id);
`;

async function pageFor(browser, html, { alpha = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, locale: 'he-IL' });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  return page;
}

// ═════════════════════════════ assets: masks, bezel ═════════════════════════════════════════
async function makeAssets(browser) {
  fs.mkdirSync(D('assets'), { recursive: true });
  const shot = async (file, w, h, body, bg) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg}">${body}</body></html>`);
    await page.screenshot({ path: D('assets', file), omitBackground: bg === 'transparent' });
    await ctx.close();
  };
  await shot('mask_phone.png', 760, 1350, '<div style="width:760px;height:1350px;border-radius:56px;background:#fff"></div>', '#000');
  await shot('mask_b.png', 540, 960, '<div style="width:540px;height:960px;border-radius:34px;background:#fff"></div>', '#000');
  await shot('feather.png', 1080, 1440, '<div style="width:1080px;height:1440px;background:linear-gradient(to bottom,#000 0,#fff 150px,#fff calc(100% - 150px),#000 100%)"></div>', '#000');
  // the bezel: a deep-green ring, transparent centre, soft shadow underneath. 956x1546 canvas, screen hole 760x1350 at (98,98)
  await shot('ring_phone.png', 956, 1546, `<div style="position:absolute;left:80px;top:80px;width:796px;height:1386px;box-sizing:border-box;border:18px solid ${BRAND.deep};border-radius:74px;box-shadow:0 44px 80px -26px rgba(24,48,36,.5),0 0 0 1.5px rgba(255,255,255,.14) inset"></div>`, 'transparent');
  log('assets done');
}

// ═════════════════════════════ the cream stage under the phone (scene 2 only) ══════════════════
const underHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
${FONTS}
html,body{margin:0;width:540px;height:960px;overflow:hidden;background:${BRAND.cream}}
.fl{position:absolute}
.glow{position:absolute;border-radius:50%}
</style></head><body>
<div class="glow" id="g1" style="width:640px;height:640px;left:-60px;top:220px;background:radial-gradient(circle,${BRAND.palePetal} 0%,${BRAND.cream}00 68%)"></div>
<div class="glow" id="g2" style="width:420px;height:420px;left:260px;top:-80px;background:radial-gradient(circle,${BRAND.sage}88 0%,${BRAND.cream}00 70%)"></div>
<img id="f1" class="fl" src="${BASE}/flower-full.png" style="width:330px;left:-120px;top:70px;opacity:.10">
<img id="f2" class="fl" src="${BASE}/flower-full.png" style="width:240px;left:380px;top:690px;opacity:.07;transform:scaleX(-1)">
<script>${JS_UTIL}
window.__t = (t) => {
  $('f1').style.transform = 'translate(' + (t * 5) + 'px,' + (t * -3) + 'px) rotate(' + (-14 + t * 1.2) + 'deg)';
  $('f2').style.transform = 'scaleX(-1) translate(' + (t * 6) + 'px,' + (t * 4) + 'px) rotate(' + (10 - t * 1.0) + 'deg)';
  $('g1').style.transform = 'translate(' + (t * -7) + 'px,' + (Math.sin(t / 2.2) * 14) + 'px)';
  $('g2').style.transform = 'translate(' + (t * 4) + 'px,' + (t * 6) + 'px)';
};
window.__t(0);
</script></body></html>`;

// ═════════════════════════════ the overlay: all the words and graphics, over the footage ════════
const overHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
${FONTS}
html,body{margin:0;width:540px;height:960px;overflow:hidden;background:transparent}
#stage{position:absolute;inset:0;overflow:hidden}
.abs{position:absolute;left:0;right:0;text-align:center}
.grad{position:absolute;left:0;right:0;opacity:0;pointer-events:none}
.big{position:absolute;left:0;right:0;text-align:center;font-family:KF,serif;font-weight:700;color:${BRAND.cream};line-height:1.15;text-shadow:0 2px 18px rgba(12,26,20,.45)}
.w{display:inline-block;opacity:0;margin:0 7px}
.chip{position:absolute;font:700 17px/1 KB,sans-serif;padding:9px 16px 10px;border-radius:14px;opacity:0;letter-spacing:.2px}
.chip.dark{background:rgba(31,58,48,.86);color:${BRAND.cream}}
.chip.pink{background:${BRAND.petal};color:${BRAND.deep}}
.cap{position:absolute;left:0;right:0;top:112px;display:flex;justify-content:center;opacity:0}
.cap .box{display:flex;align-items:center;gap:13px;padding:13px 24px 14px 20px;background:#FFFDF8;border:1px solid rgba(24,48,36,.08);border-radius:22px;box-shadow:0 1px 2px rgba(24,48,36,.06),0 16px 30px -14px rgba(24,48,36,.3)}
.cap .n{width:34px;height:34px;border-radius:50%;background:${BRAND.petal};color:${BRAND.deep};font:700 18px/34px KB,sans-serif;text-align:center;flex:none}
.cap .t{font:700 31px/1.2 KF,serif;color:${BRAND.deep};white-space:nowrap}
#end{position:absolute;inset:0;background:${BRAND.cream};opacity:0;overflow:hidden}
.sl{position:absolute;left:0;right:0;text-align:center;font:700 40px/1.2 KF,serif;color:${BRAND.deep};opacity:0;white-space:nowrap}
</style></head><body><div id="stage">

<div id="ai" class="chip dark" style="right:20px;top:64px;font-size:14px;padding:7px 12px 8px;background:rgba(251,248,241,.82);color:${BRAND.deep}">✦ נוצר ב-<span dir="ltr">AI</span></div>

<div id="gA" class="grad" style="bottom:0;height:640px;background:linear-gradient(to top,rgba(14,30,23,.9) 0%,rgba(14,30,23,.62) 40%,rgba(14,30,23,0) 100%)"></div>
<div id="a1" class="big" style="top:612px;font-size:50px"><span class="w">עוד</span><span class="w">הודעה...</span></div>
<div id="a2" class="big" style="top:688px;font-size:50px"><span class="w">ועוד</span><span class="w">אחת...</span></div>

<div id="divB" style="position:absolute;left:0;right:0;top:478px;height:4px;background:${BRAND.petal};opacity:0"></div>
<div id="ringB" style="position:absolute;left:135px;top:480px;width:270px;height:480px;box-sizing:border-box;border-radius:17px;box-shadow:0 0 0 1.5px ${BRAND.petal},0 16px 30px -14px rgba(24,48,36,.35);opacity:0"></div>
<div id="chipTop" class="chip dark" style="right:22px;top:92px;font-size:20px">לפני</div>
<div id="chipBot" class="chip pink" style="right:16px;top:520px;font-size:20px">אחרי</div>

<div id="cap1" class="cap"><div class="box"><span class="n">1</span><span class="t">הלקוחה בוחרת שעה</span></div></div>
<div id="cap2" class="cap"><div class="box"><span class="n">2</span><span class="t">מקבלת אישור מיידי</span></div></div>
<div id="cap3" class="cap"><div class="box"><span class="n">3</span><span class="t">והיומן מתעדכן לבד</span></div></div>

<div id="gC" class="grad" style="bottom:0;height:560px;background:linear-gradient(to top,rgba(14,30,23,.92) 0%,rgba(14,30,23,.65) 45%,rgba(14,30,23,0) 100%)"></div>
<img id="fl" src="${BASE}/flower-full.png" style="position:absolute;left:26px;top:84px;width:104px;opacity:0;filter:drop-shadow(0 6px 18px rgba(14,30,23,.35))">
<div id="c1" class="big" style="top:742px;font-size:70px"><span class="w">ועכשיו?</span></div>
<div id="c2" class="big" style="top:826px;font-size:56px"><span class="w">את</span><span class="w">פשוט</span><span class="w">עובדת.</span></div>

<div id="end">
  <div style="position:absolute;width:760px;height:760px;border-radius:50%;left:-110px;top:100px;background:radial-gradient(circle,${BRAND.palePetal} 0%,${BRAND.cream}00 68%)"></div>
  <img id="ewm" src="${BASE}/flower-full.png" style="position:absolute;width:360px;left:-130px;top:640px;opacity:.09;transform:rotate(-12deg)">
  <img id="elogo" src="${BASE}/kalmea-wordmark.png" style="position:absolute;width:300px;left:120px;top:226px;opacity:0">
  <div id="s1" class="sl" style="top:440px">פחות זמן על ניהול.</div>
  <div id="s2" class="sl" style="top:498px">יותר זמן בשבילך.</div>
  <div id="rule" style="position:absolute;left:238px;width:64px;height:3px;border-radius:2px;background:${BRAND.petal};top:586px;opacity:0"></div>
  <div id="url" class="abs" style="top:610px;font:600 27px/1 KA,sans-serif;color:#4a5a54;direction:ltr;opacity:0;letter-spacing:.4px">kalmea.app</div>
</div>
</div><script>${JS_UTIL}
const lineWords = (id, t0, t1, tOut) => { // words rise in one after another, the whole line leaves at tOut
  const el = $(id), ws = [...el.querySelectorAll('.w')];
  const out = 1 - io((window.__now - (tOut - .4)) / .4);
  ws.forEach((w, i) => { const p = out3((window.__now - (t0 + i * .2)) / .65); w.style.opacity = p * out; w.style.transform = 'translateY(' + (1 - p) * 18 + 'px)'; w.style.filter = 'blur(' + (1 - p) * 7 + 'px)'; });
};
const rise = (id, p, dy) => { const e = $(id); e.style.opacity = p; e.style.transform = 'translateY(' + (1 - p) * (dy || 14) + 'px)'; };
window.__t = (t) => {
  window.__now = t;
  // Noa: the AI label
  $('ai').style.opacity = vis(t, .5, 5.1, .6, .4);
  // A: the pain
  $('gA').style.opacity = vis(t, 4.8, 8.3, .6, .5);
  lineWords('a1', 5.2, 0, 8.2); lineWords('a2', 6.25, 0, 8.2);
  // B: before / after
  const b = vis(t, 8.3, 11.0, .5, .35);
  $('divB').style.opacity = b; $('ringB').style.opacity = vis(t, 8.5, 11.0, .6, .35);
  const ct = vis(t, 8.6, 11.0, .5, .35), cb = vis(t, 9.2, 11.0, .5, .35);
  $('chipTop').style.opacity = ct; $('chipTop').style.transform = 'translateY(' + (1 - ct) * -10 + 'px) scale(' + (.92 + .08 * ct) + ')';
  $('chipBot').style.opacity = cb; $('chipBot').style.transform = 'translateY(' + (1 - cb) * 10 + 'px) scale(' + (.92 + .08 * cb) + ')';
  // scene 2: three captions
  [[1, 11.05, 14.15], [2, 14.55, 17.55], [3, 18.05, 21.15]].forEach((c) => { const v = vis(t, c[1], c[2], .55, .4); const e = $('cap' + c[0]); e.style.opacity = v; e.style.transform = 'translateY(' + (1 - v) * 22 + 'px)'; });
  // C: the calm moment
  $('gC').style.opacity = vis(t, 20.75, 24.4, .6, .5);
  lineWords('c1', 21.45, 0, 24.3); lineWords('c2', 22.3, 0, 24.3);
  const f = out3((t - 21.2) / 1.6), fo = 1 - io((t - 23.7) / .6);
  const fl = $('fl'); fl.style.opacity = f * fo * .96;
  fl.style.transform = 'translateY(' + ((1 - f) * 24 + Math.sin(t * 1.3) * 3) + 'px) rotate(' + ((1 - f) * -14 + Math.sin(t * .9) * 2.2) + 'deg) scale(' + (.72 + .28 * f) + ')';
  // end card
  $('end').style.opacity = out3((t - 23.7) / .7);
  rise('elogo', out3((t - 24.15) / .8), 16); rise('s1', out3((t - 24.95) / .7), 14); rise('s2', out3((t - 25.75) / .7), 14);
  $('rule').style.opacity = out3((t - 26.2) / .5); rise('url', out3((t - 26.45) / .6), 10);
};
window.__t(0);
</script></body></html>`;

async function renderSequence(browser, html, dir, from, to, call = 'window.__t(T)') {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const page = await pageFor(browser, html);
  const n = Math.round((to - from) * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.__t(t), from + i / FPS);
    await page.screenshot({ path: path.join(dir, String(i + 1).padStart(4, '0') + '.png'), omitBackground: true });
    if (i % 100 === 0) log(`${path.basename(dir)} ${i}/${n}`);
  }
  await page.context().close();
}

// ═════════════════════════════ scenes ═════════════════════════════════════════════════════════
const SC = (n) => D('scenes', n + '.mp4');
function buildScenes() {
  fs.mkdirSync(D('scenes'), { recursive: true });

  // 0. Noa: her whole frame over a blurred, extended copy of itself, feathered into it
  ff(['-i', IN('noa'), '-loop', '1', '-framerate', '30', '-t', '5.3', '-i', D('assets', 'feather.png'),
    '-filter_complex',
    `[0:v]fps=30,tpad=stop_mode=clone:stop_duration=0.6,trim=duration=5.25,setpts=PTS-STARTPTS,${G_NOA},split[a][b];` +
    `[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=45,eq=brightness=0.05:saturation=1.05,drawbox=x=0:y=0:w=iw:h=ih:color=0xFBF8F1@0.55:t=fill[bg];` +
    `[b]scale=1080:1440:flags=lanczos,format=yuva420p[f0];[1:v]format=gray[m];[f0][m]alphamerge[fg];` +
    `[bg][fg]overlay=0:240:format=auto,${ZOOM(0.035, 5.25)},format=yuv420p[v]`,
    '-map', '[v]', '-t', '5.25', ...ENC, SC('s0')]);
  log('scene 0 (Noa) done');

  // A. the pain: the chaos clip, cropped to a 9:16 window around her (sign and monitor out of frame), slowed 3x, interpolated
  ff(['-i', IN('broll-phones-chaos'),
    '-filter_complex',
    `[0:v]crop=405:720:530:0,${SLOW(3.0)},scale=1080:1920:flags=lanczos,unsharp=5:5:0.45,${G_CHAOS},tpad=stop_mode=clone:stop_duration=0.6,${ZOOM(0.03, 3.5)},format=yuv420p[v]`,
    '-map', '[v]', '-t', '3.5', ...ENC, SC('sA')]);
  log('scene A done');

  // B. before / after: chaos on top (first 0.8 s, slowed, played forward then back), her real calendar below on cream
  const ownerSS = (T.owner + 1.0).toFixed(2);
  ff(['-i', IN('broll-phones-chaos'), '-ss', ownerSS, '-t', '3.7', '-i', D('owner.webm'), '-loop', '1', '-framerate', '30', '-t', '3.7', '-i', D('assets', 'mask_b.png'),
    '-f', 'lavfi', '-i', 'color=c=0xFBF8F1:s=1080x1920:r=30:d=3.5',
    '-filter_complex',
    `[0:v]trim=0.1:0.9,setpts=PTS-STARTPTS,crop=810:720:225:0,${SLOW(2.2)},scale=1080:960:flags=lanczos,${G_CHAOS},split[f][r];[r]reverse[rr];[f][rr]concat=n=2:v=1:a=0,trim=duration=3.5,setpts=PTS-STARTPTS,${ZOOM(0.035, 3.5, 1080, 960)}[top];` +
    `[1:v]fps=30,scale=540:960:flags=lanczos,format=yuva420p[b0];[2:v]format=gray[m];[b0][m]alphamerge[bot];` +
    `[3:v][top]overlay=0:0[c1];[c1][bot]overlay=270:960:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-t', '3.5', ...ENC, SC('sB')]);
  log('scene B done');

  // 2. the real screens in a phone on the cream stage (the stage frames are rendered first)
  const a0 = (T.client + 5.6).toFixed(2), b0 = (T.client + 23.1).toFixed(2), c0 = T.owner.toFixed(2);
  ff(['-framerate', '30', '-i', D('under', '%04d.png'),
    '-ss', a0, '-t', '7.4', '-i', D('client.webm'),
    '-ss', b0, '-t', '3.8', '-i', D('client.webm'),
    '-ss', c0, '-t', '3.8', '-i', D('owner.webm'),
    '-loop', '1', '-framerate', '30', '-t', '10.7', '-i', D('assets', 'mask_phone.png'),
    '-loop', '1', '-framerate', '30', '-t', '10.7', '-i', D('assets', 'ring_phone.png'),
    '-f', 'lavfi', '-i', `color=c=black@0.0:s=1080x1920:r=30:d=10.7,format=rgba`,
    '-filter_complex',
    `[1:v]setpts=PTS/2,fps=30,scale=760:1350:flags=lanczos,format=yuv420p[a];` +
    `[2:v]fps=30,scale=760:1350:flags=lanczos,format=yuv420p[b];[3:v]fps=30,scale=760:1350:flags=lanczos,format=yuv420p[c];` +
    `[a][b]xfade=transition=fade:duration=0.3:offset=3.4[ab];[ab][c]xfade=transition=fade:duration=0.3:offset=6.9[abc];` +
    `[abc]trim=duration=10.5,setpts=PTS-STARTPTS,format=yuva420p[v0];[4:v]format=gray[m];[v0][m]alphamerge[vm];` +
    `[6:v]format=yuva420p[tc];[tc][vm]overlay=160:425:format=auto[t1];[t1][5:v]overlay=62:327:format=auto[unit];` +
    `[unit]split[u1][u2];[u1]format=yuv420p,${ZOOM(0.05, 10.5)}[uc];[u2]alphaextract,${ZOOM(0.05, 10.5)}[ua];[uc][ua]alphamerge[uz];[0:v][uz]overlay=0:0:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-t', String(S2_LEN), ...ENC, SC('s2')]);
  log('scene 2 done');

  // C. the calm moment: two treatment clips, each slowed, crossfaded
  ff(['-i', IN('broll-treatment-1'), '-i', IN('broll-treatment-2'),
    '-filter_complex',
    `[0:v]crop=405:720:480:0,${SLOW(2.4)},scale=1080:1920:flags=lanczos,unsharp=5:5:0.4,${G_TREAT},fps=30,trim=duration=2.0,setpts=PTS-STARTPTS,format=yuv420p[a];` +
    `[1:v]crop=405:720:520:0,${SLOW(3.0)},scale=1080:1920:flags=lanczos,unsharp=5:5:0.4,${G_TREAT},fps=30,trim=duration=2.0,setpts=PTS-STARTPTS,format=yuv420p[b];` +
    `[a][b]xfade=transition=fade:duration=0.5:offset=1.5,${ZOOM(0.035, 3.5)},format=yuv420p[v]`,
    '-map', '[v]', '-t', '3.5', ...ENC, SC('sC')]);
  log('scene C done');
}

function buildFinal() {
  const out = D('..', 'noa-reel.mp4');
  // two passes: padding the chain and overlaying in one graph ends the video at the last scene (the overlay input's sync cuts the padding)
  const bg = D('bg.mp4');
  ff(['-i', SC('s0'), '-i', SC('sA'), '-i', SC('sB'), '-i', SC('s2'), '-i', SC('sC'),
    '-filter_complex',
    `[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.75[x1];[x1][2:v]xfade=transition=smoothup:duration=0.5:offset=7.75[x2];` +
    `[x2][3:v]xfade=transition=fade:duration=0.5:offset=10.75[x3];[x3][4:v]xfade=transition=fade:duration=0.5:offset=20.75[x4];` +
    `[x4]tpad=stop_mode=clone:stop_duration=3.5,trim=duration=${TOTAL},setpts=PTS-STARTPTS[bg]`,
    '-map', '[bg]', ...ENC, '-crf', '10', bg]);
  ff(['-i', bg, '-framerate', '30', '-i', D('over', '%04d.png'),
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]',
    '-map', '[v]', '-t', String(TOTAL), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', out]);
  log(`final -> ${out}`);
}

// ═════════════════════════════ run ═════════════════════════════════════════════════════════
fs.mkdirSync(R, { recursive: true });
const browser = await openBrowser();
try {
  if (stillsArg) {
    const times = stillsArg.split('=')[1].split(',').map(Number);
    fs.mkdirSync(D('overstills'), { recursive: true });
    const page = await pageFor(browser, overHtml);
    await page.evaluate(() => { document.documentElement.style.background = '#5b6660'; document.body.style.background = '#5b6660'; });
    for (const t of times) {
      await page.evaluate((x) => window.__t(x), t);
      await page.screenshot({ path: D('overstills', `t-${t}.png`) });
    }
    log(`over stills at ${times.join(', ')} -> ${D('overstills')}`);
  }
  if (want('assets')) await makeAssets(browser);
  if (want('under')) await renderSequence(browser, underHtml, D('under'), 0, S2_LEN + 0.2);
  if (want('over')) await renderSequence(browser, overHtml, D('over'), 0, TOTAL);
} finally { await browser.close(); }
if (want('scenes')) buildScenes();
if (want('final')) buildFinal();
