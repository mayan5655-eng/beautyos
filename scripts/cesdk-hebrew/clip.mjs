// CE.SDK Hebrew probe, clip: video export only exists in the browser, so this
// drives headless Chrome with the CDN engine - the path a "render in the
// user's browser" integration would take.
//   CESDK_LICENSE=… node probe-clip.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const VERSION = '1.82.1';
const license = process.env.CESDK_LICENSE || '';

const html = `<!doctype html><meta charset="utf-8"><body><script type="module">
import CreativeEngine from 'https://cdn.img.ly/packages/imgly/cesdk-engine/${VERSION}/index.js';
window.run = async () => {
  const engine = await CreativeEngine.init({ license: ${JSON.stringify(license || undefined)}, baseURL: 'https://cdn.img.ly/packages/imgly/cesdk-engine/${VERSION}/assets' });
  const W = 1080, H = 1920;
  const scene = engine.scene.createVideo({ designUnit: "Pixel" });
  const page = engine.block.create('page');
  engine.block.setWidth(page, W); engine.block.setHeight(page, H);
  engine.block.appendChild(scene, page);
  engine.block.setDuration(page, 3);
  const bg = engine.block.createFill('color');
  engine.block.setColor(bg, 'fill/color/value', { r: 42/255, g: 34/255, b: 51/255, a: 1 });
  engine.block.setFill(page, bg);
  const tf = { name: 'Assistant', fonts: [{ uri: location.origin + '/Assistant.ttf', subFamily: 'Regular', weight: 'normal', style: 'normal' }] };
  const text = (str, y, size, color, opts = {}) => {
    const t = engine.block.create('text');
    engine.block.setString(t, 'text/text', str);
    engine.block.setBool(t, 'text/automaticFontSizeEnabled', false);
    engine.block.setFloat(t, 'text/fontSize', size);
    engine.block.setEnum(t, 'text/horizontalAlignment', 'Right');
    engine.block.setFont(t, tf.fonts[0].uri, tf);
    engine.block.setTextColor(t, color);
    engine.block.setWidth(t, W * (opts.width || 0.84)); engine.block.setHeightMode(t, 'Auto');
    engine.block.setPositionX(t, W * (0.92 - (opts.width || 0.84))); engine.block.setPositionY(t, H * y);
    if (opts.bg) { engine.block.setBool(t, 'backgroundColor/enabled', true); engine.block.setColor(t, 'backgroundColor/color', opts.bg); engine.block.setFloat(t, 'backgroundColor/cornerRadius', 14); for (const s of ['Left', 'Right']) engine.block.setFloat(t, 'backgroundColor/padding' + s, 22); for (const s of ['Top', 'Bottom']) engine.block.setFloat(t, 'backgroundColor/padding' + s, 10); }
    engine.block.appendChild(page, t);
    if (opts.time != null) { engine.block.setTimeOffset(t, opts.time); engine.block.setDuration(t, opts.duration); }
    return t;
  };
  const GOLD = { r: 201/255, g: 162/255, b: 75/255, a: 1 }, INK = { r: 42/255, g: 34/255, b: 51/255, a: 1 };
  text('טיפול פנים לאביב', 0.40, 86, { r: 1, g: 1, b: 1, a: 1 });
  // A: always visible; B: time offset 1 s, 2 s long; C: the same inside a track.
  text('א · תמיד: ניקוי עמוק · 15 דק׳ · ₪120', 0.62, 44, INK, { bg: GOLD, width: 0.8 });
  text('ב · מ-1 עד 3 שניות · ₪120', 0.72, 44, INK, { bg: GOLD, width: 0.8, time: 1, duration: 2 });
  const track = engine.block.create('track'); engine.block.appendChild(page, track);
  const c = text('ג · בטראק, מ-1 עד 3 שניות · ₪120', 0.82, 44, INK, { bg: GOLD, width: 0.8 });
  engine.block.appendChild(track, c); engine.block.setTimeOffset(c, 1); engine.block.setDuration(c, 2);
  // a still of the same page at t=2 (image export of a video page renders the current playback time)
  engine.block.setPlaybackTime(page, 2);
  const still = await engine.block.export(page, { mimeType: 'image/png' });
  const video = await engine.block.exportVideo(page, { mimeType: 'video/mp4', onProgress: () => {} });
  const b64 = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(b); });
  // Frames from the ENCODED mp4, decoded by the browser: the real proof of what the clip shows.
  const frameAt = async (blob, t) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video decode failed')); });
    v.currentTime = t; await new Promise((res) => { v.onseeked = res; });
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return { w: c.width, h: c.height, png: c.toDataURL('image/png').split(',')[1] };
  };
  const f05 = await frameAt(video, 0.5);
  const f20 = await frameAt(video, 1.6);
  return { still: await b64(still), video: await b64(video), f05, f20 };
};
</script>`;

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
  const f = path.join(here, p.slice(1));
  if (fs.existsSync(f)) { res.setHeader('content-type', 'font/ttf'); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const pg = await browser.newPage();
  pg.on('console', (m) => { const t = m.text(); if (!/^\s*[║╔╚═]/.test(t) && t.trim()) console.log('  [page]', t.slice(0, 200)); });
  await pg.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await pg.waitForFunction('typeof window.run === "function"', { timeout: 60000 });
  const out = await pg.evaluate(() => window.run());
  const desk = path.join(process.env.USERPROFILE, 'OneDrive', 'שולחן העבודה');
  fs.writeFileSync(path.join(desk, 'cesdk-hebrew-clip-frame.png'), Buffer.from(out.still, 'base64'));
  fs.writeFileSync(path.join(desk, 'cesdk-hebrew-clip.mp4'), Buffer.from(out.video, 'base64'));
  fs.writeFileSync(path.join(desk, 'cesdk-hebrew-clip-t0.5.png'), Buffer.from(out.f05.png, 'base64'));
  fs.writeFileSync(path.join(desk, 'cesdk-hebrew-clip-t2.0.png'), Buffer.from(out.f20.png, 'base64'));
  console.log('saved clip', Buffer.from(out.video, 'base64').length, 'bytes; decoded frames', out.f05.w + 'x' + out.f05.h);
} finally { await browser.close(); server.close(); }
