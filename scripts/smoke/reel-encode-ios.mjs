// A reel on a browser whose H.264 encoder refuses quantizer mode - what iPhone Safari does (2026-10-24, a customer:
// "This specific encoder configuration (avc1.64002a, quantizer 0 / Infinity bps, ...) is not supported").
// Real Chrome (it has the H.264 encoder Playwright's Chromium lacks), 430px, one NEW smoke tenant:
//   VideoEncoder.configure is wrapped to throw on bitrateMode 'quantizer' or a missing bitrate, like Safari, and
//   every configuration asked for is recorded. The reel must come out as an MP4 with a real bitrate configured.
// SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/reel-encode-ios.mjs. The tenant is removed at the end.
import { chromium } from 'playwright';
import { PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[reel-ios]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[reel-ios] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';

const db = admin();
const email = newEmail('reelios');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'tenant', tenantId);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'he-IL' });
// REJECT_HIGH=1: also refuse H.264 High once configured (a phone whose hardware encoder says no), to prove the fallback.
await ctx.addInitScript((rejectHigh) => {
  window.__configs = [];
  if (window.VideoEncoder) {
    const orig = window.VideoEncoder.prototype.configure;
    window.VideoEncoder.prototype.configure = function (cfg) {
      window.__configs.push({ codec: cfg.codec, bitrate: cfg.bitrate, bitrateMode: cfg.bitrateMode || null });
      if (cfg.bitrateMode === 'quantizer' || !(cfg.bitrate > 0) || (rejectHigh && /^avc1\.64/i.test(cfg.codec))) {
        throw new DOMException(`This specific encoder configuration (${cfg.codec}, quantizer) is not supported in this environment.`, 'NotSupportedError');
      }
      return orig.call(this, cfg);
    };
  }
  try { localStorage.setItem('bloomos-ios-install-dismissed', '1'); } catch { /* ignore */ }
}, process.env.REJECT_HIGH === '1');
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e.message).slice(0, 200)));
const skip = async () => { for (let i = 0; i < 8; i++) { const sk = page.locator('button:has-text("דלגי")').filter({ visible: true }).first(); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה רילס');
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
  await skip();
  await page.locator('button[aria-label="תוכן"]').filter({ visible: true }).first().click(); await page.waitForTimeout(2500);
  await skip();
  await page.getByRole('button', { name: 'תבניות', exact: true }).filter({ visible: true }).first().click(); await page.waitForTimeout(1500);
  const mk = page.locator('button:has-text("ליצור רילס")').filter({ visible: true }).first();
  await mk.waitFor({ timeout: 30000 });
  await mk.scrollIntoViewIfNeeded(); await mk.click();
  const go = page.locator('button:has-text("ליצור את הסרטון")').filter({ visible: true }).first();
  await go.waitFor({ timeout: 30000 });
  await go.scrollIntoViewIfNeeded(); await go.click();
  const video = page.locator('video[src^="blob:"]').first();
  const err = page.locator('p:has-text("יצירת הסרטון"), p:has-text("not supported")').first();
  await Promise.race([video.waitFor({ timeout: 180000 }), err.waitFor({ timeout: 180000 })]).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/smoke-reel-ios.png` });
  const configs = await page.evaluate(() => window.__configs);
  log('encoder configurations asked for:', JSON.stringify(configs));
  check(configs.length > 0, 'the WebCodecs path ran');
  if (process.env.REJECT_HIGH === '1') check(configs.some((c) => /^avc1\.(4d|42)/i.test(c.codec)), 'High refused: it fell back to Main/Baseline');
  check(configs.every((c) => c.bitrateMode !== 'quantizer' && c.bitrate > 0), 'every configuration has a real bitrate, no quantizer mode');
  check(await video.count() === 1, 'the reel came out (a video is shown)');
  // The page's CSP blocks fetch() of a blob: URL, so the file is judged by what the video element decodes.
  const info = await page.evaluate(async () => {
    const v = document.querySelector('video[src^="blob:"]'); if (!v) return null;
    if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 5000); });
    return { w: v.videoWidth, h: v.videoHeight, d: v.duration };
  });
  check(info?.w === 1080 && info?.h === 1920, `1080x1920 (${info?.w}x${info?.h})`);
  check(info?.d > 3 && info?.d < 120, `a real duration (${info?.d?.toFixed?.(2)} s)`);
  const shown = (await page.innerText('body'));
  check(!/not supported in this environment/.test(shown), 'no English encoder error shown to her');
  check(await page.locator('button:has-text("שמירה ושיתוף הסרטון (mp4)")').count() === 1, 'save/share offered for the mp4');
  check(problems.length === 0, `no page errors${problems.length ? ': ' + problems.join(' | ') : ''}`);
} catch (e) {
  fails.push(e.message); console.error('[reel-ios] FAIL', e.message);
  await page.screenshot({ path: `${SHOTS}/smoke-reel-ios-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  log('purge', JSON.stringify(await purgeTenant(tenantId, userId)));
}
if (fails.length) { console.error(`[reel-ios] ${fails.length} failure(s)`); process.exit(1); }
log('all ok');
