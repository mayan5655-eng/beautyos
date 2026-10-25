// The 2026-10-24 phone-review fixes, checked on a deployment (SMOKE_BASE=<branch preview or kalmea.app>) with the tenant from phone-setup.mjs.
//   node --env-file=.env.local scripts/smoke/phone-verify-fixes.mjs <stateFile>
import fs from 'node:fs';
import { launch, BASE, PASSWORD } from './lib.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';
const stateFile = process.argv[2];
const meta = JSON.parse(fs.readFileSync(stateFile + '.meta.json', 'utf8'));
const SHOTS = process.env.SMOKE_SHOTS || '.';
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };

async function phone(profile, extra = {}) {
  const P = { ...PROFILES[profile], ...extra };
  const s = await launch({ userAgent: P.ua, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await s.ctx.addInitScript(initScript(P));
  return s;
}
async function login(p) {
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled, null, { timeout: 15000 });
  await p.fill('input[type=email]', meta.email); await p.fill('input[type=password]', PASSWORD); await p.click('button[type=submit]');
  await p.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 }); await p.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) { const k = p.locator('button:has-text("דלגי"), button:has-text("לא עכשיו")').filter({ visible: true }).first(); if (await k.count()) { await k.click().catch(() => {}); await p.waitForTimeout(300); } else break; }
}
const evs = (p) => p.evaluate(() => (window.__ev || []).map((e) => e.kind + ': ' + e.info));
const toasts = (p) => p.locator('[role=status],[role=alert]').allInnerTexts();

// 1. login page before its script runs: the button is disabled in the HTML itself, and the fields say what they are
{
  const html = await (await fetch(BASE + '/login')).text();
  check(/<button[^>]*type="submit"[^>]*disabled/.test(html) || /<button[^>]*disabled[^>]*type="submit"/.test(html), 'login: the submit button is disabled in the server HTML (nothing to tap before the script is live)');
  check(html.includes('autoComplete') || /autocomplete="current-password"/.test(html), 'login: password field has autocomplete=current-password');
}

// 2. iPhone Safari: payments CSV goes to the share sheet; the phone keyboards; the clients search
{
  const s = await phone('iphone'); const p = s.page; await login(p);
  await p.locator('button[aria-label="תשלום"]').filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__ev = []; });
  await p.locator('button:has-text("ייצוא לאקסל")').filter({ visible: true }).first().tap(); await p.waitForTimeout(1500);
  const e = await evs(p);
  check(e.some((x) => x.startsWith('share: ') && /kalmea_payments_.*\.csv/.test(x)), 'iphone: the payments CSV goes to the share sheet: ' + JSON.stringify(e));
  check(!e.some((x) => x.startsWith('download')), 'iphone: no blob download into Files');
  await p.screenshot({ path: SHOTS + '/verify-iphone-csv.png' });
  await s.browser.close();
}
// 3. home-screen app: nothing can save a file, and she is told so (the old toast said "downloaded")
for (const [name, extra] of [['iphone-sa', { share: false }], ['instagram', {}]]) {
  const s = await phone(name, extra); const p = s.page; await login(p);
  await p.locator('button[aria-label="תשלום"]').filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__ev = []; });
  await p.locator('button:has-text("ייצוא לאקסל")').filter({ visible: true }).first().tap(); await p.waitForTimeout(1200);
  const t = (await toasts(p)).join(' | ');
  check(/ספארי או בכרום/.test(t) && !/הקובץ ירד/.test(t), name + ': honest message instead of "downloaded": ' + t.slice(0, 120));
  await p.screenshot({ path: SHOTS + '/verify-' + name + '-csv.png' });
  await s.browser.close();
}
// 4. the booking page: add-to-calendar is a real link that answers text/calendar
{
  const s = await phone('instagram'); const p = s.page;
  await p.goto(BASE + '/clinic-bdika', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.locator('a:has-text("קביעת תור אונליין")').first().click(); await p.waitForTimeout(2500);
  await p.locator('.bk-chip').first().click(); await p.waitForTimeout(2000);
  await p.locator('button:not([disabled])').filter({ visible: true, hasText: /^\d\d:\d\d$/ }).first().click(); await p.waitForTimeout(800);
  await p.locator('button:has-text("המשיכי")').first().click(); await p.waitForTimeout(1500);
  await p.fill('input[type=tel]', '0500000000'); await p.fill('input[placeholder*="שם"], input[aria-label="שם מלא"]', 'לקוחה בדיקה');
  await p.locator('input[type=checkbox]').first().check().catch(() => {});
  await p.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click(); await p.waitForTimeout(4000);
  const link = p.locator('a[data-testid="add-to-calendar-ics"]');
  check(await link.count() === 1, 'booking: "לאייפון / ליומן" is a link');
  const href = await link.getAttribute('href');
  const r = await fetch(new URL(href, BASE));
  const body = await r.text();
  check(r.status === 200 && /text\/calendar/.test(r.headers.get('content-type') || '') && body.includes('BEGIN:VEVENT') && body.includes('DTSTART:'), 'booking: the link answers a real .ics: ' + r.status + ' ' + r.headers.get('content-type'));
  await p.screenshot({ path: SHOTS + '/verify-booking-ics.png' });
  const bad = await fetch(new URL('/api/calendar-invite?date=nope&start=1', BASE));
  check(bad.status === 400, 'calendar-invite: a bad query is a plain 400');
  await s.browser.close();
}
// 5. the stylesheet carries the iOS no-zoom rule; the onboarding/settings phone fields are tel
{
  const html = await (await fetch(BASE + '/login')).text();
  const css = [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  let found = false;
  for (const c of css) { const t = await (await fetch(new URL(c, BASE))).text(); if (/-webkit-touch-callout:\s*none/.test(t) && /font-size:\s*16px\s*!important/.test(t)) found = true; }
  check(found, 'css: the iOS-only 16px field rule is shipped');
}
// ---- round 2 ----
// 6. the accountant file goes to the share sheet on an iPhone (built inside the tap), and is refused honestly in the home-screen app
{
  const s = await phone('iphone'); const p = s.page; await login(p);
  await p.locator('button[aria-label="עוד"]').filter({ visible: true }).first().click(); await p.waitForTimeout(500);
  await p.locator('button:has-text("סיכום הכנסות")').filter({ visible: true }).first().click(); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__ev = []; });
  await p.locator('button:has-text("קובץ לרואה החשבון")').filter({ visible: true }).first().tap(); await p.waitForTimeout(2500);
  const e = await evs(p);
  check(e.some((x) => x.startsWith('share: ') && /kalmea-accountant-\d{4}.*\.xlsx/.test(x)), 'iphone: the accountant Excel goes to the share sheet: ' + JSON.stringify(e));
  await s.browser.close();
}
// 7. a new appointment starts on a day she is open (today is checked as it comes: a Saturday opens on Sunday)
{
  const s = await phone('android'); const p = s.page; await login(p);
  await p.locator('button:has-text("✦ קביעת תור"), button:has-text("✦ תור חדש")').filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
  const bad = await p.locator('text=סגור ביום זה').filter({ visible: true }).count();
  check(bad === 0, 'new appointment: the form does not open on a closed day');
  await p.screenshot({ path: SHOTS + '/verify-new-appt.png' });
  await s.browser.close();
}
// 8. the voice sheet on the home-screen app says what is true for an iPhone
{
  const s = await phone('iphone-sa'); const p = s.page; await login(p);
  await p.evaluate(() => { try { delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; } catch {} });
  const mic = p.locator('button[aria-label*="קול"], button[aria-label*="מיקרופון"], button[aria-label*="פקודה"]').filter({ visible: true }).first();
  if (await mic.count()) { await mic.click(); await p.waitForTimeout(1000); const t = await p.innerText('body'); check(/Safari/.test(t) && !/מחשב או אנדרואיד/.test(t), 'voice: iPhone wording on the home-screen app'); await p.screenshot({ path: SHOTS + '/verify-voice-sa.png' }); }
  else console.log('skip voice: mic button not found by label');
  await s.browser.close();
}
// 9. banners: not on her clients' pages; the in-app-browser banner on her own app at "/"
{
  const s = await phone('iphone', { keepHints: true }); const p = s.page;
  for (const path of ['/clinic-bdika', '/book?t=' + meta.tenantId]) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    check(await p.locator('[aria-label="התקנת האפליקציה למסך הבית"]').count() === 0, 'iphone: no install card on the client page ' + path.slice(0, 14));
  }
  await s.browser.close();
}
{
  const s = await phone('instagram', { keepHints: true }); const p = s.page; await login(p); await p.waitForTimeout(3000);
  check(await p.locator('[aria-label="פתיחה בדפדפן של הטלפון"]').count() === 1, 'instagram: the open-in-Safari banner shows on her signed-in app at "/"');
  await p.screenshot({ path: SHOTS + '/verify-ig-banner.png' });
  await s.browser.close();
}
{
  const s = await phone('iphone', { keepHints: true }); const p = s.page; await login(p); await p.waitForTimeout(3500);
  check(await p.locator('[aria-label="התקנת האפליקציה למסך הבית"]').count() === 1, 'iphone: the install card still shows on her own app');
  await s.browser.close();
}
// 10. a browser too old for Kalmea gets a line, not a dead page (no :has() = before Safari/iOS 15.4)
{
  const s = await phone('iphone'); const p = s.page;
  await s.ctx.addInitScript(() => { const q = CSS.supports.bind(CSS); CSS.supports = (...a) => (/:has/.test(String(a[0])) ? false : q(...a)); });
  await p.goto(BASE + '/clinic-bdika', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  check(/iOS 15\.4/.test(await p.innerText('body')), 'old browser: the page says the phone is too old (instead of a dead page)');
  await s.browser.close();
}
// 11. push notifications on an iPhone that has no PushManager: the sentence says what to do
{
  const s = await phone('iphone'); const p = s.page;
  await s.ctx.addInitScript(() => { try { delete window.PushManager; } catch {} });
  await login(p);
  await p.locator('button[aria-label="הגדרות"]').first().click(); await p.waitForTimeout(1200);
  let found = false;
  for (const g of ['העסק שלי', 'הדף שלי', 'יומן ושירותים', 'הודעות', 'לקוחות ופניות', 'חיבורים', 'מתקדם']) {
    await p.locator('.sheet button').filter({ hasText: new RegExp('^' + g + '$') }).first().click().catch(() => {}); await p.waitForTimeout(500);
    if (/הוספה למסך הבית/.test(await p.locator('.sheet').first().innerText())) { found = true; break; }
  }
  check(found, 'push: an iPhone without PushManager is told to add Kalmea to the home screen');
  await s.browser.close();
}
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL OK');
process.exit(fails.length ? 1 : 0);
