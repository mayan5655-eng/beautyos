// "רילס מהצילומים שלי": her own photos and a clip -> a finished 9:16 reel in HER brand, shared from a phone.
// One NEW empty smoke tenant (primary colour set to a purple, so Kalmea green would show), at 430px, under three profiles:
// android (Chrome), iphone (Safari rules modelled), instagram (in-app browser: no share sheet, AND no WebCodecs encoder,
// so the real-time MediaRecorder fallback is the path walked there).
//   dashboard "צילום אחרי טיפול" -> "רילס" link -> two photos + one clip -> nothing is made until the consent box is
//   ticked -> before/after words -> the reel: 1080x1920, the planned length, her purple in the frames (pill, bar,
//   closing card), no Kalmea green -> share hands a real video file to navigator.share (in-app: the note instead)
//   -> nothing was uploaded (no storage request). Android also opens it from the studio card.
// Real Chrome (Playwright's Chromium has no H.264 encoder). NOT a real iPhone: Safari's rules are modelled, its codecs are not.
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/own-reel.mjs     (SMOKE_SHOTS=<dir> for screenshots)
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[own-reel]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[own-reel] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';
const PRIMARY = '#7A4E8C';
const BIZ = 'סטודיו סגול רילס';

const db = admin();
const email = newEmail('ownreel');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const skip = async (page) => { for (let i = 0; i < 8; i++) { const k = page.locator('button:has-text("דלגי"), button:has-text("אחר כך"), button:has-text("לא עכשיו")').filter({ visible: true }).first(); if (await k.count()) { await k.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };

/** A big JPEG (a phone photo is this size), base64. */
const makePhoto = (page, tone) => page.evaluate(async (t) => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 4000; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 3000, 4000); g.addColorStop(0, t[0]); g.addColorStop(1, t[1]); x.fillStyle = g; x.fillRect(0, 0, 3000, 4000);
  x.fillStyle = '#f3d9c6'; x.beginPath(); x.ellipse(1500, 1900, 700, 900, 0, 0, Math.PI * 2); x.fill();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const b of buf) s += String.fromCharCode(b); return btoa(s);
}, tone);

/** A 2.5 second clip (a moving blob), recorded in the page as WebM: what a phone hands over is decoded the same way. */
const makeClip = (page) => page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 720; c.height = 1280; const x = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(200);
  const t0 = performance.now();
  await new Promise((done) => { const tick = (now) => { const t = (now - t0) / 1000; x.fillStyle = '#c9a28c'; x.fillRect(0, 0, 720, 1280); x.fillStyle = '#5b3a2e'; x.beginPath(); x.arc(360 + Math.sin(t * 3) * 200, 640, 160, 0, Math.PI * 2); x.fill(); if (t < 2.5) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
  rec.stop(); await stopped;
  const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()); let s = ''; for (const b of buf) s += String.fromCharCode(b); return btoa(s);
});

/** The finished reel, read back in the page: size, length, and colours of a frame at `times` (seconds; negative = from the end). */
const inspect = (page, times) => page.evaluate(async ([ts, primary]) => {
  const v = document.querySelector('[data-testid="own-reel-video"]');
  if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
  // a MediaRecorder WebM reports Infinity until it is read to the end
  if (!Number.isFinite(v.duration)) { v.currentTime = 1e6; await new Promise((r) => v.addEventListener('durationchange', r, { once: true })); }
  const out = { w: v.videoWidth, h: v.videoHeight, dur: v.duration, frames: [] };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const near = (d, i, t, tol) => Math.abs(d[i] - t[0]) < tol && Math.abs(d[i + 1] - t[1]) < tol && Math.abs(d[i + 2] - t[2]) < tol;
  const P = hex(primary), K = hex('#1F3A30');
  for (const t of ts) {
    v.currentTime = t < 0 ? Math.max(0, v.duration + t) : t;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
    const c = document.createElement('canvas'); c.width = 270; c.height = 480; const x = c.getContext('2d');
    x.drawImage(v, 0, 0, 270, 480); const d = x.getImageData(0, 0, 270, 480).data;
    let p = 0, k = 0, n = 0;
    for (let i = 0; i < d.length; i += 8) { n++; if (near(d, i, P, 50)) p++; if (near(d, i, K, 18)) k++; }
    const big = document.createElement('canvas'); big.width = 540; big.height = 960; big.getContext('2d').drawImage(v, 0, 0, 540, 960);
    out.frames.push({ t, her: p / n, kalmea: k / n, png: big.toDataURL('image/png') });
  }
  return out;
}, [times, PRIMARY]);

async function run(label, profile, { noEncoder = false } = {}) {
  const P = PROFILES[profile];
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'he-IL', userAgent: P.ua, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(initScript(P));
  if (noEncoder) await ctx.addInitScript(() => { try { delete window.VideoEncoder; window.VideoEncoder = undefined; } catch { /* ignore */ } });
  const page = await ctx.newPage();
  const problems = [], uploads = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 240)}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
  // share-event is the studio's anonymous "she opened / shared" count (SaveShare): no media in it
  page.on('request', (r) => { if (/\/storage\/v1\/object|\/api\/designs(?!\/share-event)/.test(r.url()) && r.method() !== 'GET') uploads.push(`${r.method()} ${r.url().slice(0, 120)}`); });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
    if (label === 'android') {
      await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
      await page.fill('input[placeholder="למשל: סטודיו רונית"]', BIZ);
      await page.fill('input[placeholder="השם שלך"]', 'בודקת');
      await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
      await page.fill('input[placeholder="0501234567"]', '0500000000');
      await page.click('button:has-text("עוסק פטור")');
      for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
      await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
      await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click().catch(() => {}); await page.waitForTimeout(200);
      await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
      await page.click('button:has-text("סיום ופתיחת היומן")');
      await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
      const { error } = await db.from('settings').update({ primary_color: PRIMARY }).eq('tenant_id', tenantId);
      if (error) throw new Error('settings update: ' + error.message);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
    await page.waitForTimeout(1500); await skip(page);

    // ── the way in: the dashboard's photo card, then the reel link ──
    await page.locator('[data-testid="photo-to-post-open"]').click({ timeout: 30000 });
    const link = page.locator('[data-testid="photo-to-post-reel"]');
    await link.waitFor({ timeout: 10000 });
    const lb = await link.boundingBox();
    check(!!lb && lb.height >= 44 && lb.x >= 0 && lb.x + lb.width <= 431, `${label}: the reel link is tap-sized and on screen`);
    await link.click();
    await page.locator('[data-testid="own-reel"]').waitFor({ timeout: 15000 });
    check(await page.locator('[data-testid="photo-to-post"]').count() === 0, `${label}: the photo sheet made way for the reel sheet`);
    check(await page.locator('[data-testid="own-reel-make"]').count() === 0, `${label}: nothing to make before there is a picture`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/smoke-ownreel-${label}-1-empty.png` });

    // ── two photos and a clip, in one pick ──
    const [p1, p2, clip] = [await makePhoto(page, ['#e8c9b5', '#b98a73']), await makePhoto(page, ['#f1dfd3', '#d9b39c']), await makeClip(page)];
    await page.locator('[data-testid="own-reel-input"]').setInputFiles([
      { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(p1, 'base64') },
      { name: 'IMG_0002.webm', mimeType: 'video/webm', buffer: Buffer.from(clip, 'base64') },
      { name: 'IMG_0003.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(p2, 'base64') },
    ]);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="own-reel-item"]').length === 3, null, { timeout: 30000 });
    check(true, `${label}: three items listed`);
    const make = page.locator('[data-testid="own-reel-make"]');
    check(await make.isDisabled(), `${label}: the make button is disabled until the client agrees`);
    check((await page.innerText('[data-testid="own-reel"]')).includes('הלקוחה אישרה לי'), `${label}: consent line shown`);
    await page.locator('[data-testid="own-reel-before-after"]').check();
    const words = await page.locator('[data-testid="own-reel-caption-input"]').evaluateAll((els) => els.map((e) => e.value));
    check(words[0] === 'לפני' && words[2] === 'אחרי', `${label}: before/after words (${words.join(' | ')})`);
    await page.screenshot({ path: `${SHOTS}/smoke-ownreel-${label}-2-items.png` });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    check(wide <= 431, `${label}: no sideways scroll (${wide}px)`);

    await page.locator('[data-testid="own-reel-consent"]').check();
    const t0 = Date.now();
    await make.click({ timeout: 5000 });
    await page.locator('[data-testid="own-reel-video"]').waitFor({ timeout: 240000 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    await page.waitForTimeout(800);
    const info = await inspect(page, [0.9, 3.6, -1.2]);
    // the sampled frames themselves, for a human look (half size)
    info.frames.forEach((f, k) => writeFileSync(`${SHOTS}/smoke-ownreel-${label}-frame-${k + 1}.png`, Buffer.from(f.png.split(',')[1], 'base64')));
    // planned: photo 2.6 + clip ~2.5 + photo 2.6 + end 3 = ~10.7 s
    check(info.w === 1080 && info.h === 1920, `${label}: reel is 1080x1920 (${info.w}x${info.h})`);
    check(info.dur > 9.5 && info.dur < 11.8, `${label}: reel runs the planned ~10.7 s (${info.dur.toFixed(2)} s, made in ${secs} s)`);
    check(info.frames.every((f) => f.her > 0.003), `${label}: her purple in every sampled frame (${info.frames.map((f) => (f.her * 100).toFixed(1) + '%').join(', ')})`);
    check(info.frames.every((f) => f.kalmea < 0.002), `${label}: no Kalmea green (${info.frames.map((f) => (f.kalmea * 100).toFixed(2) + '%').join(', ')})`);
    const text = await page.locator('[data-testid="own-reel-post-text"]').inputValue();
    check(text.includes(BIZ) && text.includes('0500000000'), `${label}: post text starts ready with her business and phone`);
    await page.screenshot({ path: `${SHOTS}/smoke-ownreel-${label}-3-ready.png` });

    // ── share ──
    await page.evaluate(() => { window.__ev = []; });
    await page.locator('[data-testid="own-reel-share"]').click();
    await page.locator('[data-testid="save-share-download"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    const body = (await page.innerText('body')).replace(/\s+/g, ' ');
    const shareBtn = page.locator('[data-testid="save-share-share"]');
    if (P.share) {
      check(await shareBtn.count() === 1, `${label}: share button shown`);
      await shareBtn.click(); await page.waitForTimeout(800);
      const ev = await page.evaluate(() => window.__ev.filter((e) => e.kind === 'share').map((e) => e.info));
      check(ev.length === 1 && /:video\/(mp4|webm):\d{5,}/.test(ev[0]), `${label}: navigator.share got a real video file (${ev[0]?.slice(0, 70)})`);
    } else {
      check(await shareBtn.count() === 0, `${label}: no share button where files cannot be shared`);
      check(body.includes('פתחת את Kalmea מתוך'), `${label}: in-app browser note shown`);
    }
    await page.screenshot({ path: `${SHOTS}/smoke-ownreel-${label}-4-share.png` });
    check(uploads.length === 0, `${label}: nothing was uploaded or saved${uploads.length ? ': ' + uploads.join(' | ') : ''}`);

    // ── the studio card (once) ──
    if (label === 'android') {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      while (await page.locator('.sheet-backdrop').count()) { await page.locator('.sheet-backdrop').last().click({ position: { x: 5, y: 5 } }).catch(() => {}); await page.waitForTimeout(400); if (await page.locator('.sheet-backdrop').count() && !(await page.locator('.sheet-backdrop').last().isVisible())) break; }
      await page.locator('button[aria-label="תוכן"]').filter({ visible: true }).first().click(); await page.waitForTimeout(2500); await skip(page);
      const card = page.locator('[data-testid="studio-own-reel-open"]').first();
      await card.waitFor({ timeout: 30000 });
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/smoke-ownreel-${label}-5-studio.png` });
      await card.click();
      await page.locator('[data-testid="own-reel-input"]').waitFor({ state: 'attached', timeout: 15000 });
      check(await page.locator('[data-testid="own-reel-item"]').count() === 0, `${label}: the studio card opens a fresh, empty reel sheet`);
    }

    const real = problems.filter((p) => !/favicon|Failed to load resource.*(404|401)|vercel.live|Invalid Sentry Dsn/.test(p)); // the DSN line: local .env only
    check(real.length === 0, `${label}: no console errors / 5xx${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);
  } catch (e) {
    fails.push(`${label}: ${e.message}`); console.error('[own-reel] FAIL', label, e.message);
    const err = await page.locator('[data-testid="own-reel-error"]').innerText().catch(() => '');
    if (err) console.error('[own-reel] on screen:', err);
    await page.screenshot({ path: `${SHOTS}/smoke-ownreel-${label}-error.png`, fullPage: true }).catch(() => {});
  } finally { await browser.close(); }
}

try {
  await run('android', 'android');
  await run('iphone', 'iphone');
  await run('instagram', 'instagram', { noEncoder: true });
} finally {
  log('purge', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 200));
}
if (fails.length) { console.error(`[own-reel] ${fails.length} failure(s)`); process.exit(1); }
log('all ok');
