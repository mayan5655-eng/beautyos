// marketing/ai-videos.mjs
//
// Fixes the four Higgsfield clips for Kalmea marketing. Originals are NEVER touched: everything is read from
// marketing/in/ai-videos/ (copies) and written to marketing/out/ai-videos/.
//
//   node ai-videos.mjs            builds everything
//
// Why a browser for the Hebrew: ffmpeg's drawtext has no bidi, and the AI video models invent letters. Chromium (Playwright) lays out
// real Hebrew, right to left, in the brand fonts; the result is a transparent PNG that ffmpeg overlays. See the repo's video lessons
// (.claude/skills/kalmea): Hebrew is drawn by Chromium, never by ffmpeg.
//
// The fake Hebrew the model drew is covered by a frosted-glass band (the video behind it, blurred, under a cream tint) with the real
// caption inside it. Positions were measured on the 1280x720 frames; the numbers sit in SPEC below.

import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(HERE, 'in', 'ai-videos');
const OUT = path.join(HERE, 'out', 'ai-videos');
const ASSETS = path.join(OUT, '_assets');
const TMP = path.join(OUT, '_tmp');
const PUB = path.join(HERE, '..', 'public');
for (const d of [OUT, ASSETS, TMP]) fs.mkdirSync(d, { recursive: true });

const find = (prefix) => {
  const f = fs.readdirSync(IN).find((n) => n.startsWith('higgsfield-' + prefix) && n.endsWith('.mp4'));
  if (!f) throw new Error('missing input ' + prefix);
  return path.join(IN, f);
};
// Which file is which (see the summary): A = flower + phone (5 s, ends on the real Kalmea logo card), B = two phones (5 s, opens with a
// 2 s shot of the woman in the cream suit), HEAD_SUIT = the woman in the cream suit (18 s), HEAD_COSM = the cosmetician in the clinic (15 s).
const SRC = { A: find('623815bb'), B: find('d05a6f0b'), HEAD_COSM: find('9703660b'), HEAD_SUIT: find('add54083') };

const ff = (args, label) => {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); throw new Error('ffmpeg failed: ' + label); }
  console.log('  ok', label);
};
const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

// ── brand ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GREEN = '#1F3A30', CREAM = '#FBF8F1', PETAL = '#E9A9A1', PALE = '#FBEDE9';
const fontCss = `
@font-face{font-family:KFrank;src:url(${pathToFileURL(path.join(PUB, 'design-fonts', 'FrankRuhlLibre-700.ttf'))});font-weight:700}
@font-face{font-family:KAssist;src:url(${pathToFileURL(path.join(PUB, 'design-fonts', 'Assistant-700.ttf'))});font-weight:700}
@font-face{font-family:KAssist;src:url(${pathToFileURL(path.join(PUB, 'design-fonts', 'Assistant-400.ttf'))});font-weight:400}
html,body{margin:0;padding:0;background:transparent;overflow:hidden}*{box-sizing:border-box}`;

// ── what goes where (measured on the 1280x720 frames) ─────────────────────────────────────────────────────────────────────────
const SPEC = {
  A: {
    text: 'כל העסק שלך, במקום אחד',
    // All three fake captions (phone / salon / peony shots) sit between y=295 and y=430, x=175..1100: one band covers them all.
    band: { x: 140, y: 282, w: 1000, h: 160 }, font: 72, tint: 0.78,
    blurIn: null, capIn: 0, capDur: 0.05, outStart: 3.9, outDur: 0.25, // the real logo card takes over at ~4.0 s
  },
  B: {
    text: 'פחות ניהול. יותר זמן בשבילך.',
    // The fake caption (white, soft shadow) sits under the phones from 2.3 s on, x=255..1005, y=595..650.
    band: { x: 190, y: 560, w: 900, h: 124 }, font: 58, tint: 0.93,
    blurIn: 2.15, capIn: 2.45, capDur: 0.4, outStart: null, outDur: 0, // the woman fills the first ~2.2 s: nothing is added until the phones appear
  },
};

// ── 1. render every Hebrew / brand asset with Chromium ────────────────────────────────────────────────────────────────────────
async function renderAssets() {
  const b = await chromium.launch({ executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync) });
  const shot = async (name, w, h, body, { transparent = true } = {}) => {
    const html = path.join(ASSETS, name + '.html');
    fs.writeFileSync(html, `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${fontCss}</style></head><body style="width:${w}px;height:${h}px;overflow:hidden">${body}</body></html>`);
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto(pathToFileURL(html).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(ASSETS, name + '.png'), omitBackground: transparent });
    await p.close();
  };
  for (const [k, s] of Object.entries(SPEC)) {
    const { w, h } = s.band;
    const r = Math.round(h * 0.3);
    await shot(`cap${k}`, w, h, `<div style="width:${w}px;height:${h}px;border-radius:${r}px;background:rgba(251,248,241,${s.tint});border:2px solid rgba(31,58,48,0.14);display:flex;align-items:center;justify-content:center;font-family:KFrank;font-weight:700;font-size:${s.font}px;line-height:1.2;color:${GREEN};text-align:center;padding:0 24px" dir="rtl">${s.text}</div>`);
    await shot(`mask${k}`, w, h, `<div style="width:${w}px;height:${h}px;border-radius:${r}px;background:#fff"></div>`, { transparent: false }); // white on black via the page bg below
  }
  // masks must be white on BLACK (alphamerge reads luma): repaint with a black body
  for (const k of Object.keys(SPEC)) {
    const { w, h } = SPEC[k].band; const r = Math.round(h * 0.3);
    const html = path.join(ASSETS, `mask${k}.html`);
    fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:#000;width:${w}px;height:${h}px"><div style="width:${w}px;height:${h}px;border-radius:${r}px;background:#fff"></div></body></html>`);
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto(pathToFileURL(html).href);
    await p.screenshot({ path: path.join(ASSETS, `mask${k}.png`) }); await p.close();
  }
  // vertical frame: brand cream, the wordmark on top, kalmea.app at the bottom. The video sits in the middle (VW x VH).
  const wordmark = pathToFileURL(path.join(PUB, 'kalmea-wordmark.png')).href;
  const flower = pathToFileURL(path.join(PUB, 'flower-full.png')).href;
  await shot('frame', 1080, 1920, `<div style="width:1080px;height:1920px;background:radial-gradient(120% 80% at 50% 45%, ${CREAM} 0%, ${PALE} 100%);position:relative;overflow:hidden">
    <img src="${flower}" style="position:absolute;right:-160px;bottom:-120px;width:620px;opacity:.22;transform:rotate(-12deg)">
    <img src="${flower}" style="position:absolute;left:-190px;top:-90px;width:560px;opacity:.18;transform:rotate(168deg)">
    <img src="${wordmark}" style="position:absolute;left:50%;top:250px;transform:translateX(-50%);width:420px">
    <div style="position:absolute;left:0;right:0;bottom:250px;text-align:center;font-family:KFrank;font-weight:700;font-size:54px;color:${GREEN};letter-spacing:1px"><span dir="ltr">kalmea.app</span></div></div>`, { transparent: false });
  // rounded-corner mask for the video inside the vertical frame
  const VW = 1008, VH = 567;
  const mhtml = path.join(ASSETS, 'vmask.html');
  fs.writeFileSync(mhtml, `<!doctype html><html><body style="margin:0;background:#000;width:${VW}px;height:${VH}px"><div style="width:${VW}px;height:${VH}px;border-radius:34px;background:#fff"></div></body></html>`);
  { const p = await b.newPage({ viewport: { width: VW, height: VH } }); await p.goto(pathToFileURL(mhtml).href); await p.screenshot({ path: path.join(ASSETS, 'vmask.png') }); await p.close(); }

  // placeholder cards for the two talking heads (the real still frame goes under the label in compose step)
  const card = (title, sub, tag) => `<div style="width:1080px;height:1920px;background:${PALE};position:relative;font-family:KAssist">
    <div style="position:absolute;left:60px;right:60px;top:150px;bottom:150px;border:6px dashed ${GREEN};border-radius:48px;opacity:.55"></div>
    <div style="position:absolute;left:0;right:0;top:300px;text-align:center;font-family:KAssist;font-weight:700;font-size:44px;color:${GREEN};letter-spacing:6px" dir="ltr">PLACEHOLDER</div>
    <div style="position:absolute;left:90px;right:90px;top:1030px;background:${CREAM};border:3px solid ${GREEN};border-radius:40px;padding:44px 40px;text-align:center" dir="rtl">
      <div style="font-family:KFrank;font-weight:700;font-size:72px;line-height:1.2;color:${GREEN}">${title}</div>
      <div style="margin-top:22px;font-family:KAssist;font-weight:400;font-size:44px;line-height:1.45;color:${GREEN}">${sub}</div></div>
    <div style="position:absolute;left:0;right:0;bottom:200px;text-align:center;font-family:KAssist;font-weight:700;font-size:40px;color:${GREEN};opacity:.8" dir="rtl">${tag}</div></div>`;
  await shot('placeholder-suit', 1080, 1920, card('כאן נכנסת דוברת קלמיה', 'סרטון עם הקול שלך, אחרי סנכרון שפתיים. בערך 7 שניות ראשונות.', 'האישה בחליפה הקרם'), { transparent: false });
  await shot('placeholder-cosm', 1080, 1920, card('כאן נכנסת הקוסמטיקאית', 'סרטון עם הקול שלך, אחרי סנכרון שפתיים. בערך 6 שניות.', 'דמות להמחשה'), { transparent: false });
  // the on-screen label the cosmetician clip must carry (she is a brand character, not a customer)
  await shot('tag-illustrative', 520, 84, `<div style="width:520px;height:84px;border-radius:42px;background:rgba(251,248,241,.9);border:2px solid rgba(31,58,48,.2);display:flex;align-items:center;justify-content:center;font-family:KAssist;font-weight:700;font-size:38px;color:${GREEN}" dir="rtl">דמות להמחשה</div>`);
  // end card
  await shot('endcard', 1080, 1920, `<div style="width:1080px;height:1920px;background:radial-gradient(120% 80% at 50% 45%, ${CREAM} 0%, ${PALE} 100%);position:relative;overflow:hidden">
    <img src="${flower}" style="position:absolute;right:-200px;bottom:-160px;width:760px;opacity:.28;transform:rotate(-12deg)">
    <img src="${flower}" style="position:absolute;left:-230px;top:-120px;width:700px;opacity:.24;transform:rotate(168deg)">
    <img src="${wordmark}" style="position:absolute;left:50%;top:640px;transform:translateX(-50%);width:760px">
    <div style="position:absolute;left:0;right:0;top:1010px;text-align:center;font-family:KFrank;font-weight:700;font-size:62px;color:${GREEN}" dir="rtl">עסק שפורח. חיים עם יותר שקט.</div>
    <div style="position:absolute;left:0;right:0;top:1180px;text-align:center;font-family:KAssist;font-weight:700;font-size:70px;color:${GREEN};letter-spacing:2px"><span dir="ltr">kalmea.app</span></div></div>`, { transparent: false });
  await b.close();
}

// ── 2. the two 16:9 clips: cover the fake Hebrew, add the real one, drop the audio ───────────────────────────────────────────────
function fix16(key, srcPath, outPath) {
  const s = SPEC[key]; const { x, y, w, h } = s.band;
  const dur = 5.06;
  const fOut = (st, d) => (st == null ? '' : `,fade=t=out:st=${st}:d=${d}:alpha=1`);
  const fIn = (st, d) => (st == null ? '' : `,fade=t=in:st=${st}:d=${d}:alpha=1`);
  const graph = [
    `[0:v]split=2[a][b]`,
    `[b]crop=${w}:${h}:${x}:${y},gblur=sigma=22:steps=2,format=rgba[bl]`,
    `[1:v]format=gray[m]`,
    `[bl][m]alphamerge,format=rgba${fIn(s.blurIn, 0.3)}${fOut(s.outStart, s.outDur)}[blm]`,
    `[a][blm]overlay=${x}:${y}:format=auto[v1]`,
    `[2:v]format=rgba${fIn(s.capIn, s.capDur)}${fOut(s.outStart, s.outDur)}[c]`,
    `[v1][c]overlay=${x}:${y}:format=auto,format=yuv420p[vout]`,
  ].join(';');
  ff(['-i', srcPath, '-loop', '1', '-framerate', '24', '-t', String(dur), '-i', path.join(ASSETS, `mask${key}.png`), '-loop', '1', '-framerate', '24', '-t', String(dur), '-i', path.join(ASSETS, `cap${key}.png`),
    '-filter_complex', graph, '-map', '[vout]', '-r', '24', '-t', String(dur), ...x264, outPath], path.basename(outPath));
}

// ── 3. vertical 1080x1920 for Reels: the clip on the brand cream frame, never stretched ─────────────────────────────────────────
function vertical(in16, outPath, dur = 5.06) {
  const graph = [
    `[1:v]format=rgba[bg]`,
    `[0:v]scale=1008:567:flags=lanczos,format=rgba[v]`,
    `[2:v]format=gray[m]`,
    `[v][m]alphamerge[vr]`,
    `[bg][vr]overlay=36:(H-h)/2+20:format=auto:shortest=1,format=yuv420p[o]`,
  ].join(';');
  ff(['-i', in16, '-loop', '1', '-framerate', '24', '-t', String(dur), '-i', path.join(ASSETS, 'frame.png'), '-loop', '1', '-framerate', '24', '-t', String(dur), '-i', path.join(ASSETS, 'vmask.png'),
    '-filter_complex', graph, '-map', '[o]', '-r', '24', '-t', String(dur), ...x264, outPath], path.basename(outPath));
}

// ── 4. silent talking heads, ready for lip-sync ─────────────────────────────────────────────────────────────────────────────────
function silent(srcPath, outPath) {
  ff(['-i', srcPath, '-vf', 'format=yuv420p', '-r', '24', ...x264, outPath], path.basename(outPath));
}

// ── 5. the launch reel draft ──────────────────────────────────────────────────────────────────────────────────────────────────────
function reel() {
  const W = 1080, H = 1920, FPS = 30;
  const norm = (label, args, vf) => { const o = path.join(TMP, label + '.mp4'); ff([...args, '-vf', `${vf},scale=${W}:${H}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p`, '-r', String(FPS), ...x264, o], label); return o; };
  const still = (label, png, secs, vfExtra = '') => norm(label, ['-loop', '1', '-framerate', String(FPS), '-t', String(secs), '-i', png], vfExtra || 'null');
  const demo = path.join(HERE, 'out', 'kalmea-demo.mp4');
  const seg = [];
  seg.push(norm('r1-flower', ['-t', '3.9', '-i', path.join(OUT, 'flower-phone-vertical.mp4')], 'null'));
  // placeholder 1: the silent suit-woman still, dimmed, under the label card
  seg.push(placeholder('r2-ph-suit', path.join(OUT, 'suit-woman-silent.mp4'), 'placeholder-suit', 7.0, 1.0));
  seg.push(norm('r3-phones', ['-ss', '2.15', '-i', path.join(OUT, 'two-phones-vertical.mp4')], 'null'));
  seg.push(norm('r4-booking', ['-ss', '16', '-t', '5', '-i', demo], 'null'));
  seg.push(norm('r5-calendar', ['-ss', '24', '-t', '5', '-i', demo], 'null'));
  seg.push(norm('r6-payments', ['-ss', '33', '-t', '5', '-i', demo], 'null'));
  seg.push(placeholder('r7-ph-cosm', path.join(OUT, 'cosmetician-silent.mp4'), 'placeholder-cosm', 6.0, 1.0));
  seg.push(still('r8-end', path.join(ASSETS, 'endcard.png'), 3.5, 'fade=t=in:st=0:d=0.5'));
  const list = path.join(TMP, 'reel.txt');
  fs.writeFileSync(list, seg.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  const joined = path.join(TMP, 'reel-joined.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined], 'concat');
  ff(['-i', joined, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(OUT, 'kalmea-launch-reel-DRAFT.mp4')], 'reel (with a silent audio track so Instagram accepts it)');
}
function placeholder(label, silentPath, card, secs, atSecond) {
  const o = path.join(TMP, label + '.mp4');
  const graph = [
    `[0:v]trim=start=${atSecond}:duration=0.04,setpts=PTS-STARTPTS,scale=1080:1920,format=rgba,gblur=sigma=6,colorchannelmixer=aa=0.55[still]`,
    `[still]loop=loop=-1:size=1:start=0,trim=duration=${secs},setpts=N/(30*TB)[stl]`,
    `[1:v]format=rgba[card]`,
    `[card][stl]overlay=0:0:format=auto[x]`, // placeholder: card over still would hide the still; the card is mostly opaque cream with a dashed frame
  ].join(';');
  // simpler and clearer: still frame (dimmed) as the background, card elements on top (card png is opaque, so use it as a 62%-opaque layer)
  const g2 = [
    `[0:v]trim=start=${atSecond}:duration=0.1,setpts=PTS-STARTPTS,scale=1080:1920,fps=30,format=rgba[s0]`,
    `[s0]loop=loop=-1:size=3:start=0,trim=duration=${secs},setpts=N/(30*TB)[stl]`,
    `[1:v]format=rgba,colorchannelmixer=aa=0.80[cd]`,
    `[stl][cd]overlay=0:0:format=auto,format=yuv420p[o]`,
  ].join(';');
  void graph;
  ff(['-i', silentPath, '-loop', '1', '-framerate', '30', '-t', String(secs), '-i', path.join(ASSETS, card + '.png'), '-filter_complex', g2, '-map', '[o]', '-r', '30', '-t', String(secs), ...x264, o], label);
  return o;
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('rendering Hebrew assets with Chromium...');
await renderAssets();
console.log('16:9 clips');
fix16('A', SRC.A, path.join(OUT, 'flower-phone-16x9.mp4'));
fix16('B', SRC.B, path.join(OUT, 'two-phones-16x9.mp4'));
console.log('vertical');
vertical(path.join(OUT, 'flower-phone-16x9.mp4'), path.join(OUT, 'flower-phone-vertical.mp4'));
vertical(path.join(OUT, 'two-phones-16x9.mp4'), path.join(OUT, 'two-phones-vertical.mp4'));
console.log('silent talking heads');
silent(SRC.HEAD_SUIT, path.join(OUT, 'suit-woman-silent.mp4'));
silent(SRC.HEAD_COSM, path.join(OUT, 'cosmetician-silent.mp4'));
console.log('reel');
reel();
console.log('done');
