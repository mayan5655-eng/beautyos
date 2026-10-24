// Save/share a finished post from a phone, on one NEW smoke tenant at 430px with an iPhone user agent.
//   1. a browser that can share files: "שמירה ושיתוף" -> the panel -> its share button hands a real PNG File to
//      navigator.share, called while her tap is still active (what iOS requires)
//   2. a browser that cannot: the panel shows the picture as a data: image with the long-press instruction
//   3. inside Instagram's in-app browser: the "open in Safari/Chrome" note
// Chromium cannot open a real share sheet, so navigator.share/canShare are stubbed to RECORD the call.
// node --env-file=.env.local scripts/smoke/post-share.mjs (SMOKE_BASE=<preview>). The tenant is removed at the end.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[share]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[share] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0';

const db = admin();
const email = newEmail('share');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const STUB = (canShare) => `
  window.__shares = [];
  try { localStorage.setItem('bloomos-ios-install-dismissed', '1'); } catch { /* the iPhone add-to-home-screen hint */ }
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: ${canShare ? '(d) => !!(d && d.files && d.files.length)' : 'undefined'} });
  Object.defineProperty(navigator, 'share', { configurable: true, value: ${canShare ? `async (d) => {
    const f = d.files[0];
    window.__shares.push({ active: navigator.userActivation ? navigator.userActivation.isActive : null, name: f.name, type: f.type, size: f.size, head: Array.from(new Uint8Array(await f.slice(0, 8).arrayBuffer())) });
  }` : 'undefined'} });`;

const visibleBtn = (page, text) => page.locator(`button:has-text("${text}")`).filter({ visible: true }).first();

async function run(label, ua, canShare, onboard) {
  const { browser, ctx, page, problems } = await launch({ userAgent: ua, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(STUB(canShare));
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
    if (onboard) {
      await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
      await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה שיתוף');
      await page.fill('input[placeholder="השם שלך"]', 'בודקת');
      await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
      await page.fill('input[placeholder="0501234567"]', '0500000000');
      await page.click('button:has-text("עוסק פטור")');
      for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
      await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
      await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click().catch(() => {}); await page.waitForTimeout(200);
      await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
      await page.click('button:has-text("סיום ופתיחת היומן")');
    }
    await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
    for (let i = 0; i < 6; i++) { const sk = page.locator('button:has-text("דלגי")').filter({ visible: true }).first(); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; }

    await page.locator('button[aria-label="תוכן"]').filter({ visible: true }).first().click();
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) { const sk = page.locator('button:has-text("דלגי")').filter({ visible: true }).first(); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; }
    // a new design from the first template in the gallery
    const make = page.locator('button:has-text("לפתוח ולערוך"), button:has-text("להשתמש בתבנית")').filter({ visible: true }).first();
    await make.waitFor({ timeout: 30000 }).catch(() => {});
    if (!(await make.count())) { await page.screenshot({ path: `${SHOTS}/smoke-share-${label}-studio.png`, fullPage: true }); throw new Error('no template button found'); }
    await make.click();
    const exportBtn = visibleBtn(page, 'שמירה ושיתוף');
    await exportBtn.waitFor({ timeout: 30000 });
    await exportBtn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/smoke-share-${label}-editor.png` });
    await exportBtn.click();
    const panel = page.locator('[data-testid="save-share-image"]');
    await panel.waitFor({ timeout: 60000 });
    const src = await panel.getAttribute('src');
    check(src?.startsWith('data:image/png;base64,') && src.length > 20000, `${label}: the panel shows the post as a data: PNG (${src?.length} chars)`);
    await page.waitForTimeout(700); // the sheet slides in
    const text = (await page.innerText("body")).replace(/\s+/g, ' ');
    await page.screenshot({ path: `${SHOTS}/smoke-share-${label}-panel.png` });
    const shareBtn = page.locator('[data-testid="save-share-share"]');
    if (canShare) {
      check(await shareBtn.count() === 1, `${label}: share button shown`);
      const bb = await shareBtn.boundingBox();
      check(!!bb && bb.height >= 44 && bb.x >= 0 && bb.x + bb.width <= 430, `${label}: share button tap-sized and on screen`);
      await shareBtn.click(); await page.waitForTimeout(800);
      const shares = await page.evaluate(() => window.__shares);
      const s = shares?.[0];
      check(!!s, `${label}: navigator.share was called`);
      check(s?.active === true, `${label}: ...while her tap was still active (${s?.active})`);
      check(s?.type === 'image/png' && /^kalmea-post-\d{8}-\d{4}\.png$/.test(s?.name) && s.size > 10000, `${label}: with a real PNG file (${s?.name}, ${s?.type}, ${s?.size} bytes)`);
      check(JSON.stringify(s?.head) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10]), `${label}: the file starts with the PNG signature`);
      check(text.includes('שמירת תמונה'), `${label}: tells her "Save Image" saves to the gallery`);
    } else {
      check(await shareBtn.count() === 0, `${label}: no share button where the browser cannot share files`);
      check(text.includes('לחיצה ארוכה על התמונה'), `${label}: the long-press instruction is shown`);
    }
    if (ua === IG) check(text.includes('פתחת את Kalmea מתוך אינסטגרם'), `${label}: the in-app browser note is shown`);
    check(await page.locator('[data-testid="save-share-download"]').count() === 1, `${label}: download kept as a fallback`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    check(wide <= 431, `${label}: no sideways scroll (${wide}px)`);
    const real = problems.filter((p) => !/favicon|Failed to load resource.*(404|401)|vercel.live/.test(p));
    check(real.length === 0, `${label}: no console errors / 5xx${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);
  } catch (e) {
    fails.push(`${label}: ${e.message}`); console.error('[share] FAIL', label, e.message);
    await page.screenshot({ path: `${SHOTS}/smoke-share-${label}-error.png`, fullPage: true }).catch(() => {});
  } finally { await browser.close(); }
}

try {
  await run('iphone-share', IPHONE, true, true);
  await run('no-share', IPHONE, false, false);
  await run('instagram', IG, false, false);
} finally {
  log('purge', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 200));
}
if (fails.length) { console.error(`[share] ${fails.length} failure(s)`); process.exit(1); }
log('all ok');
