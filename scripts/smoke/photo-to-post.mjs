// "צילום אחרי טיפול": one photo -> a finished post (4:5) and story (9:16) in HER brand, shared from a phone.
// One NEW empty smoke tenant (primary colour set to a purple, so Kalmea green would show), at 430px, under three profiles:
// android (Chrome), iphone (Safari rules modelled), instagram (in-app browser: no share sheet, no clipboard).
//   dashboard button -> photo -> the share buttons stay hidden until the client-consent box is ticked -> post + story drawn
//   (right size, her colour, no Kalmea green) -> caption starts ready -> share hands a real PNG to navigator.share
//   (iPhone: while the tap is live) -> the same from a client card, with her first name in the consent line.
// Chromium cannot open a real share sheet; phone-profiles.mjs records what the page asks for. NOT a real iPhone.
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/photo-to-post.mjs     (SMOKE_SHOTS=<dir> for screenshots)
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[photo]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[photo] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';
const PRIMARY = '#7A4E8C';
const BIZ = 'סטודיו סגול בדיקה';

const db = admin();
const email = newEmail('photo');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const skip = async (page) => { for (let i = 0; i < 8; i++) { const k = page.locator('button:has-text("דלגי"), button:has-text("אחר כך"), button:has-text("לא עכשיו")').filter({ visible: true }).first(); if (await k.count()) { await k.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };

/** A 3000x2000 JPEG with a face-ish blob on a warm gradient, made in the page (a real phone photo is this big). */
const makePhoto = (page) => page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 3000, 2000); g.addColorStop(0, '#e8c9b5'); g.addColorStop(1, '#b98a73'); x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
  x.fillStyle = '#f3d9c6'; x.beginPath(); x.ellipse(1500, 950, 520, 680, 0, 0, Math.PI * 2); x.fill();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const b of buf) s += String.fromCharCode(b); return btoa(s);
});

/** Counts of pixels near her colour and near Kalmea green in a rendered image. */
const colours = (page, selector) => page.evaluate(async ([sel, primary]) => {
  const img = document.querySelector(sel); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const near = (r, g, b, t, tol) => Math.abs(r - t[0]) < tol && Math.abs(g - t[1]) < tol && Math.abs(b - t[2]) < tol;
  const P = hex(primary), K = hex('#1F3A30'); let p = 0, k = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { n++; if (near(d[i], d[i + 1], d[i + 2], P, 60)) p++; if (near(d[i], d[i + 1], d[i + 2], K, 20)) k++; }
  return { w: img.naturalWidth, h: img.naturalHeight, her: p / n, kalmea: k / n };
}, [selector, PRIMARY]);

async function run(label, profile) {
  const P = PROFILES[profile];
  const { browser, ctx, page, problems } = await launch({ userAgent: P.ua, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(initScript(P));
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
      // her brand: a purple, set after onboarding so the app reads it on the next load; plus one client for the card entry
      const { error } = await db.from('settings').update({ primary_color: PRIMARY }).eq('tenant_id', tenantId);
      if (error) throw new Error('settings update: ' + error.message);
      const { error: ce } = await db.from('clients').insert({ tenant_id: tenantId, name: 'דנה בדיקה', phone: '0500000001', status: 'active' });
      if (ce) throw new Error('client insert: ' + ce.message);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
    await page.waitForTimeout(1500); await skip(page);

    // ── dashboard entry ──
    const open = page.locator('[data-testid="photo-to-post-open"]');
    await open.waitFor({ timeout: 30000 });
    const ob = await open.boundingBox();
    check(!!ob && ob.height >= 44 && ob.x >= 0 && ob.x + ob.width <= 431, `${label}: dashboard button tap-sized and on screen`);
    await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-dashboard.png` });
    await open.click();
    await page.locator('[data-testid="photo-to-post"]').waitFor({ timeout: 10000 });
    check(await page.locator('[data-testid="photo-to-post-make"]').count() === 0, `${label}: nothing to make before there is a photo`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-1-empty.png` });

    const b64 = await makePhoto(page);
    await page.locator('[data-testid="photo-to-post-input"]').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
    await page.locator('[data-testid="photo-to-post-thumb"]').waitFor({ timeout: 15000 });
    const make = page.locator('[data-testid="photo-to-post-make"]');
    check(await make.isDisabled(), `${label}: the make button is disabled until the client agrees`);
    await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-2-consent.png` });
    check((await page.innerText('[data-testid="photo-to-post"]')).includes('הלקוחה אישרה לי'), `${label}: generic consent line from the dashboard`);
    await page.locator('[data-testid="photo-to-post-consent"]').check();
    await make.click({ timeout: 5000 });
    await page.locator('[data-testid="photo-to-post-post"]').waitFor({ timeout: 90000 });
    await page.locator('[data-testid="photo-to-post-story"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const post = await colours(page, '[data-testid="photo-to-post-post"]');
    const story = await colours(page, '[data-testid="photo-to-post-story"]');
    check(post.w === 1080 && post.h === 1350, `${label}: post is 1080x1350 (${post.w}x${post.h})`);
    check(story.w === 1080 && story.h === 1920, `${label}: story is 1080x1920 (${story.w}x${story.h})`);
    check(post.her > 0.004 && story.her > 0.004, `${label}: drawn in her purple (post ${(post.her * 100).toFixed(1)}%, story ${(story.her * 100).toFixed(1)}%)`);
    check(post.kalmea < 0.002 && story.kalmea < 0.002, `${label}: no Kalmea green (post ${(post.kalmea * 100).toFixed(2)}%, story ${(story.kalmea * 100).toFixed(2)}%)`);
    const cap = await page.locator('[data-testid="photo-to-post-caption"]').inputValue();
    check(cap.includes(BIZ) && cap.includes('0500000000'), `${label}: the caption starts ready with her business and phone (${cap.split('\n')[0]})`);
    check(!cap.includes('דנה'), `${label}: the caption never names a client`);
    await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-3-ready.png`, fullPage: false });

    // another design, and a typed headline
    const before = await page.locator('[data-testid="photo-to-post-post"]').getAttribute('src');
    await page.locator('[data-testid="photo-to-post-another"]').click();
    await page.waitForFunction((s) => { const i = document.querySelector('[data-testid="photo-to-post-post"]'); return i && i.src !== s && i.naturalWidth > 0; }, before, { timeout: 60000 });
    check(true, `${label}: "another design" draws a different post`);
    await page.locator('[data-testid="photo-to-post-headline"]').fill('הזוהר שלך');
    const b2 = await page.locator('[data-testid="photo-to-post-post"]').getAttribute('src');
    await page.locator('[data-testid="photo-to-post-apply"]').click();
    await page.waitForFunction((s) => { const i = document.querySelector('[data-testid="photo-to-post-post"]'); return i && i.src !== s && i.naturalWidth > 0; }, b2, { timeout: 60000 });
    check((await page.locator('[data-testid="photo-to-post-caption"]').inputValue()).includes('הזוהר שלך'), `${label}: a typed headline reaches the card and the caption`);

    // ── share both ──
    for (const which of ['post', 'story']) {
      await page.evaluate(() => { window.__ev = []; });
      await page.locator(`[data-testid="photo-to-post-share-${which}"]`).click();
      await page.locator('[data-testid="save-share-image"]').waitFor({ timeout: 30000 });
      await page.waitForTimeout(700);
      const src = await page.locator('[data-testid="save-share-image"]').getAttribute('src');
      check(src?.startsWith('data:image/png;base64,') && src.length > 20000, `${label}/${which}: the save panel shows a data: PNG`);
      const body = (await page.innerText('body')).replace(/\s+/g, ' ');
      const copyBtn = page.locator('[data-testid="save-share-copy"]');
      check((await copyBtn.count()) === (which === 'post' ? 1 : 0), `${label}/${which}: caption copy button ${which === 'post' ? 'present' : 'absent (a story has no caption)'}`);
      const shareBtn = page.locator('[data-testid="save-share-share"]');
      if (P.share) {
        check(await shareBtn.count() === 1, `${label}/${which}: share button shown`);
        await shareBtn.click(); await page.waitForTimeout(800);
        const ev = await page.evaluate(() => window.__ev.filter((e) => e.kind === 'share').map((e) => e.info));
        check(ev.length === 1 && /kalmea-post-\d{8}-\d{4}\.png:image\/png:\d{5,}/.test(ev[0]), `${label}/${which}: navigator.share got a real PNG (${ev[0]?.slice(0, 60)})`);
      } else {
        check(await shareBtn.count() === 0, `${label}/${which}: no share button where files cannot be shared`);
        check(body.includes('לחיצה ארוכה על התמונה'), `${label}/${which}: long-press instruction shown`);
        check(body.includes('פתחת את Kalmea מתוך'), `${label}/${which}: in-app browser note shown`);
      }
      if (which === 'story') await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-4-share-story.png` });
      else await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-4-share-post.png` });
      // close the save panel (backdrop), back to the two cards
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      if (!(await page.locator('[data-testid="photo-to-post-post"]').count())) { await page.locator('.sheet-backdrop').last().click({ position: { x: 5, y: 5 } }).catch(() => {}); await page.waitForTimeout(500); }
    }
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    check(wide <= 431, `${label}: no sideways scroll (${wide}px)`);

    // ── client card entry (once, on the android profile) ──
    if (label === 'android') {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      if (await page.locator('[data-testid="photo-to-post"]').count()) await page.locator('.sheet-backdrop').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('button[aria-label="לקוחות"]').filter({ visible: true }).first().click(); await page.waitForTimeout(1500);
      await page.locator('text=דנה בדיקה').first().click(); await page.waitForTimeout(1200);
      const cb = page.locator('[data-testid="photo-to-post-client"]');
      await cb.waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-5-client-card.png` });
      await cb.scrollIntoViewIfNeeded(); await cb.click();
      await page.locator('[data-testid="photo-to-post-input"]').waitFor({ state: 'attached', timeout: 10000 });
      await page.locator('[data-testid="photo-to-post-input"]').setInputFiles({ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await makePhoto(page), 'base64') });
      await page.locator('[data-testid="photo-to-post-thumb"]').waitFor({ timeout: 15000 });
      check((await page.innerText('[data-testid="photo-to-post"]')).includes('דנה אישרה לי'), `${label}: the client card names her first name in the consent line`);
      await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-6-client-consent.png` });
      check(await page.locator('[data-testid="photo-to-post-make"]').isDisabled(), `${label}: still disabled until she ticks`);
    }

    const real = problems.filter((p) => !/favicon|Failed to load resource.*(404|401)|vercel.live/.test(p));
    check(real.length === 0, `${label}: no console errors / 5xx${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);
  } catch (e) {
    fails.push(`${label}: ${e.message}`); console.error('[photo] FAIL', label, e.message);
    await page.screenshot({ path: `${SHOTS}/smoke-photo-${label}-error.png`, fullPage: true }).catch(() => {});
  } finally { await browser.close(); }
}

try {
  await run('android', 'android');
  await run('iphone', 'iphone');
  await run('instagram', 'instagram');
} finally {
  log('purge', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 200));
}
if (fails.length) { console.error(`[photo] ${fails.length} failure(s)`); process.exit(1); }
log('all ok');
