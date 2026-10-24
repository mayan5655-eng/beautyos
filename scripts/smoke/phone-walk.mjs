// Walk every tab of the owner app on a NEW empty smoke tenant at 430px under a phone profile, tap every visible control once, and
// report the ones that did nothing visible, threw, hit a 4xx/5xx, or ask the browser for something Safari refuses.
//   PROFILE=android|iphone|iphone-sa|instagram|facebook   TABS=comma list (default all)   ONBOARD=1 walks the onboarding first
//   node --env-file=.env.local scripts/smoke/phone-walk.mjs      (SMOKE_BASE=https://kalmea.app or the preview URL)
// Output: a JSON report in SMOKE_SHOTS (default ./phone-walk-out) and screenshots per tab. The tenant is removed at the end.
// Requests that cost money or message people (AI, WhatsApp/SMS, Grow, billing, Facebook) are aborted by the harness and logged as
// "harness-blocked": they are not bugs, but the tap that fired them is known to reach the network.
import fs from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';

const PROFILE = process.env.PROFILE || 'android';
const P = { ...PROFILES[PROFILE], noStorage: process.env.NO_STORAGE === '1' };
const OUT = process.env.SMOKE_SHOTS || './phone-walk-out';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[walk:${PROFILE}]`, ...a);
const report = { profile: PROFILE, base: BASE, tabs: {}, flows: [], problems: [] };

const COSTLY = /\/api\/(designs\/(ai-fill|ai-image|generate)|advisor|marketing|voice-intent|skin-scan\/(send|lead)|send-|leads\/send-bulk|grow\/|billing\/|facebook|creatives|phone\/send|whatsapp|wa-cloud|messages|legal-receipts|admin|support)/;

// STATE=<file made by phone-setup.mjs>: reuse that tenant (already onboarded, one client/appointment/receipt) and leave it in place.
const STATE = process.env.STATE;
const db = admin();
let email, userId, tenantId;
if (STATE) { ({ email, userId, tenantId } = JSON.parse(fs.readFileSync(STATE + '.meta.json', 'utf8'))); }
else {
  email = newEmail(`walk-${PROFILE}`);
  const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (cErr) throw cErr;
  await new Promise((r) => setTimeout(r, 1500));
  userId = created.user.id;
  tenantId = await tenantIdOf(userId);
}
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId);

const { browser, ctx, page, problems } = await launch({ userAgent: P.ua, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'], ...(STATE ? { storageState: STATE } : {}) });
await ctx.addInitScript(initScript(P));
const blocked = [];
await ctx.route(COSTLY, (route) => {
  const r = route.request();
  if (r.method() === 'GET') return route.continue();
  blocked.push(`${r.method()} ${new URL(r.url()).pathname}`);
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"harness":true}' });
});
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message().slice(0, 100)}`); d.dismiss().catch(() => {}); });
const shot = (n) => page.screenshot({ path: `${OUT}/${PROFILE}-${n}.png` }).catch(() => {});
const sleep = (ms) => page.waitForTimeout(ms);

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await sleep(1200);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
}

async function onboard() {
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await shot('onboarding-1');
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await sleep(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await sleep(400); }
  await shot('onboarding-biztype');
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await sleep(700);
  await shot('onboarding-services');
  await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click().catch(() => {}); await sleep(200);
  await page.click('button:has-text("הבא")'); await sleep(500);
  await shot('onboarding-last');
  await page.click('button:has-text("סיום ופתיחת היומן")');
}

async function skipOverlays() {
  for (let i = 0; i < 8; i++) {
    const sk = page.locator('button:has-text("דלגי"), button:has-text("אחר כך"), button:has-text("לא עכשיו")').filter({ visible: true }).first();
    if (await sk.count()) { await sk.click().catch(() => {}); await sleep(300); } else break;
  }
}

/** Everything tappable on screen right now, as stable handles (data-walk-i). */
async function mark() {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[aria-hidden="true"]'); };
    const top = (e) => { const r = e.getBoundingClientRect(); const x = Math.min(Math.max(r.x + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.y + r.height / 2, 1), innerHeight - 1); if (r.bottom < 0 || r.top > innerHeight) return true; const t = document.elementFromPoint(x, y); return !!t && (e === t || e.contains(t) || t.contains(e)); };
    const modal = !!document.querySelector('.sheet-backdrop, [role=dialog]');
    const els = [...document.querySelectorAll('button, a[href], [role=button], [role=tab], summary, input[type=checkbox], input[type=radio], select, label[for]')].filter(vis).filter((e) => !modal || !document.querySelector('.sheet, [role=dialog]') || document.querySelector('.sheet, [role=dialog]').contains(e));
    document.querySelectorAll('[data-walk-i]').forEach((e) => e.removeAttribute('data-walk-i'));
    const seen = {};
    return els.map((e, i) => {
      e.setAttribute('data-walk-i', String(i));
      const r = e.getBoundingClientRect();
      const k0 = e.tagName + '|' + (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 50) + '|' + (e.getAttribute('href') || '');
      seen[k0] = (seen[k0] || 0) + 1;
      return { i, key: k0 + '#' + seen[k0], tag: e.tagName.toLowerCase(), text: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 50), href: e.getAttribute('href') || '', disabled: e.disabled || e.getAttribute('aria-disabled') === 'true', w: Math.round(r.width), h: Math.round(r.height) };
    });
  });
}

const sig = () => page.evaluate(() => {
  const fixed = [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return s.position === 'fixed' && e.getBoundingClientRect().height > 40; }).length;
  let h = 0; const t = document.body.innerText; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return { url: location.pathname + location.search + location.hash, h, fixed, scroll: Math.round(scrollY), ev: window.__ev ? window.__ev.length : 0, toast: !!document.querySelector('[role=status],[role=alert],[class*=toast]') };
}).catch(() => ({ url: 'GONE', h: 0, fixed: 0, scroll: 0, ev: 0 }));

async function restore(tabLabel, pre) {
  // close whatever opened, then make sure we are back on the tab
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape').catch(() => {}); await sleep(150);
    const close = page.locator('button:has-text("סגירה"), button[aria-label="סגירה"], button[aria-label="סגור"], button:has-text("✕"), button:has-text("×")').filter({ visible: true }).first();
    if (await close.count()) { await close.click({ timeout: 800 }).catch(() => {}); await sleep(200); }
  }
  if (!page.url().startsWith(BASE + '/dashboard') && !page.url().replace(BASE, '').startsWith('/?') && page.url().replace(BASE, '') !== '/') {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 30000 }).catch(() => {}); await skipOverlays();
  }
  await openTab(tabLabel); if (pre) await pre();
}

async function openTab(label) {
  if (!label) return;
  if (label === 'הגדרות') { await page.locator('button[aria-label="הגדרות"]').filter({ visible: true }).first().click().catch(() => {}); await sleep(900); return; }
  const direct = page.locator(`button[aria-label="${label}"]`).filter({ visible: true }).first();
  if (await direct.count()) { await direct.click().catch(() => {}); await sleep(900); await skipOverlays(); return; }
  // behind the "more" menu
  const more = page.locator('button[aria-label="עוד"], button:has-text("עוד")').filter({ visible: true }).first();
  if (await more.count()) { await more.click().catch(() => {}); await sleep(400); const it = page.locator(`button:has-text("${label}")`).filter({ visible: true }).first(); if (await it.count()) { await it.click().catch(() => {}); await sleep(900); await skipOverlays(); } }
}

async function crawl(name, tabLabel, { pre, max = 90, skip = /^(יציאה|התנתקות|מחיקה|מחיקת|הסרה)/ } = {}) {
  await openTab(tabLabel); if (pre) await pre(); await sleep(600); await skipOverlays();
  await shot(name);
  const items = await mark();
  const out = [];
  log(name, items.length, 'controls');
  for (const it of items.slice(0, max)) {
    if (/דלגי לתוכן/.test(it.text) || skip.test(it.text) || /^(logout|signout)/i.test(it.text)) { out.push({ ...it, result: 'skipped' }); continue; }
    if (it.tag === 'a' && /^(https?:|mailto:|tel:|wa\.me)/.test(it.href) && !it.href.includes(new URL(BASE).host)) { out.push({ ...it, result: 'external-link', href: it.href.slice(0, 80) }); continue; }
    const before = await sig(); const evBefore = before.ev; const pe = problems.length; dialogs.length = 0; blocked.length = 0;
    const cur = await mark(); const mine = cur.find((c) => c.key === it.key);
    if (!mine) { out.push({ ...it, result: 'gone-after-restore' }); continue; }
    let err = '';
    try {
      const h = page.locator(`[data-walk-i="${mine.i}"]`).first();
      await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await sleep(120);
      const hit = await h.evaluate((e) => { const r = e.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const t = document.elementFromPoint(x, y); return { x, y, ok: !!t && (e === t || e.contains(t) || t.contains(e)), cover: t ? (t.tagName + '.' + String(t.className).slice(0, 40) + ' ' + (t.innerText || '').slice(0, 30).replace(/\s+/g, ' ')) : 'none' }; });
      if (!hit.ok) err = 'COVERED by ' + hit.cover; else await page.touchscreen.tap(hit.x, hit.y);
    } catch (e) { err = String(e.message).split('\n')[0].slice(0, 120); }
    await sleep(750);
    const after = await sig();
    const ev = await page.evaluate((n) => (window.__ev || []).slice(n), evBefore).catch(() => []);
    const changed = before.url !== after.url || before.h !== after.h || before.fixed !== after.fixed;
    const row = { ...it, result: err ? 'click-failed' : changed || ev.length || dialogs.length || blocked.length ? 'effect' : 'NOTHING', err, urlTo: before.url !== after.url ? after.url : undefined, ev: ev.map((x) => `${x.kind}: ${x.info}`), dialogs: [...dialogs], blocked: [...blocked], newProblems: problems.slice(pe) };
    out.push(row);
    if (row.result !== 'effect' || row.newProblems.length || row.ev.some((e) => /BLOCKED|REFUSED|NOTHING/.test(e))) { log(row.result, it.tag, JSON.stringify(it.text), err || '', row.ev.join(' | '), row.newProblems.join(' | ')); await shot(`${name}-${it.i}-${row.result}`); }
    if (changed || err) await restore(tabLabel, pre);
  }
  report.tabs[name] = out;
}

try {
  if (STATE) await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  else { await login(); if (process.env.ONBOARD !== '0') await onboard(); }
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await skipOverlays(); await shot('home');
  const tabs = (process.env.TABS || 'היום,יומן,לקוחות,פניות,קופה,סיכום הכנסות,הודעות,תוכן,קהילה,מנויים,פרוטוקולים,יועץ AI,עזרה,תובנות').split(',');
  const groups = (process.env.SETTINGS_GROUPS || 'העסק שלי,הדף שלי,יומן ושירותים,הודעות,לקוחות ופניות,חיבורים,מתקדם').split(',');
  for (const t of tabs) if (t === 'הגדרות') { for (const g of groups) await crawl(`הגדרות-${g}`, 'הגדרות', { pre: async () => { await page.locator(`button:has-text("${g}")`).filter({ visible: true }).first().click().catch(() => {}); await sleep(500); } }).catch((e) => { report.problems.push(`settings ${g}: ${e.message}`); }); }
  else await crawl(t, t).catch((e) => { report.problems.push(`${t}: ${e.message}`); log('crawl failed', t, e.message); });
  report.pageProblems = problems.slice();
} finally {
  fs.writeFileSync(`${OUT}/${PROFILE}-report.json`, JSON.stringify(report, null, 1));
  await browser.close();
  if (!STATE) { const left = await purgeTenant(tenantId, userId); log('removed tenant', left.length ? left : 'clean'); }
}
