// The 2026-10-23 audit leftovers, on ONE new test account at 430px:
//   F5 no dashboard before onboarding -> onboarding hours copy -> tour last step target visible -> small tap targets listed
//   -> copying the booking link ticks the setup step on the account -> client card "הסירה את עצמה מדיוור" + hint
//   -> trial ends -> blocked screen -> plan renewed in the DB -> the dashboard comes back WITHOUT a reload.
// node --env-file=.env.local scripts/smoke/audit-leftovers.mjs   (SMOKE_BASE=<preview url> to run against a Vercel preview)
// The account is kalmea-smoke-*; the client row is inserted with the service role and no message is ever sent. Removed at the end.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const fails = [];
const log = (...a) => console.log('[leftovers]', ...a);
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[leftovers] FAIL', msg); } };
const OUT = process.env.SMOKE_OUT || '.';
const db = admin();
const email = newEmail('leftovers');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);
const { browser, ctx, page, problems } = await launch();
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
const body = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
const CLIENT = 'לקוחת בדיקה הסרה';

try {
  // ── F5: from sign-in to /onboarding, the dashboard never paints ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD);
  let sawDashboard = false;
  const watch = (async () => {
    for (let i = 0; i < 600 && !page.url().includes('/onboarding'); i++) {
      if (await page.locator('button[aria-label="יומן"]').count().catch(() => 0)) sawDashboard = true;
      await page.waitForTimeout(50);
    }
  })();
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await watch;
  check(!sawDashboard, 'a brand-new account goes to onboarding without the dashboard painting first (F5)');

  // ── onboarding ──
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה שאריות');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")'); await page.waitForTimeout(300); // required since the owner-decisions work
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  check((await body()).includes('שישי עד 14:00 ושבת סגור'), 'the hours step says which week it starts with');
  await page.screenshot({ path: `${OUT}/leftovers-onboarding-hours.png` });
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
  await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click(); await page.waitForTimeout(200);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await page.waitForTimeout(2000);

  // ── the tour: walk to the last step, its target must be on screen ──
  let last = false;
  for (let i = 0; i < 8; i++) {
    const next = page.locator('[role="dialog"] button:has-text("הבא")').first();
    if (await next.count() && await next.isVisible().catch(() => false)) { await next.click(); await page.waitForTimeout(1500); } else { last = true; break; }
  }
  const target = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-tour="booking-link"]')].find((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, h: b.height, vh: window.innerHeight };
  });
  check(last && !!target && target.top >= 0 && target.bottom <= target.vh, `the tour's last step points at a visible booking-link button (${JSON.stringify(target)})`);
  await page.screenshot({ path: `${OUT}/leftovers-tour-last.png` });

  // ── copying the booking link from that button ticks the step, on the account ──
  if (target) await page.locator('[data-tour="booking-link"]').filter({ visible: true }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  const { data: st } = await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle();
  check(!!st?.automations?.link_shared_at, 'copying the booking link saves link_shared_at on her account');
  // close the tour / settings and look for small tap targets on the home screen
  for (let i = 0; i < 4; i++) {
    const skip = page.locator('button:has-text("דלגי")').first();
    if (await skip.count() && await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); await page.waitForTimeout(400); }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
  await page.waitForTimeout(2500);
  const small = async (where) => {
    const list = await page.evaluate(() => [...document.querySelectorAll('button, a[href], [role="button"]')].map((el) => {
      const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || b.bottom < 0 || b.top > 4000) return null;
      if (b.height >= 44 && b.width >= 44) return null;
      return { t: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40), w: Math.round(b.width), h: Math.round(b.height) };
    }).filter(Boolean));
    log(`small tap targets on ${where}: ${list.length}`, JSON.stringify(list.slice(0, 25)));
    return list;
  };
  await small('home');
  await page.screenshot({ path: `${OUT}/leftovers-home.png`, fullPage: true });

  // ── client card: "הסירה את עצמה מדיוור" ──
  const { error: insErr } = await db.from('clients').insert({ tenant_id: tenantId, name: CLIENT, phone: '0500000096' });
  check(!insErr, `a client row exists${insErr ? ` (${insErr.message})` : ''}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="לקוחות"]', { timeout: 60000 });
  await page.locator('button[aria-label="לקוחות"]').first().click(); await page.waitForTimeout(1500);
  await page.locator(`[aria-label="פתיחת כרטיס הלקוחה ${CLIENT}"]`).first().click(); await page.waitForTimeout(1500);
  await small('client card');
  const hint = page.locator('[data-testid="marketing-optout-hint"]');
  check(await hint.count() === 1, 'the card shows the hint about a "הסר" sent to her own WhatsApp');
  await hint.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/leftovers-client-card.png` });
  await page.locator('button:has-text("הסירה את עצמה מדיוור")').first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("כן, להסיר")').first().click();
  await page.waitForTimeout(2000);
  const { data: cl } = await db.from('clients').select('marketing_opted_out_at').eq('tenant_id', tenantId).eq('name', CLIENT).maybeSingle();
  check(!!cl?.marketing_opted_out_at, 'pressing it records the opt-out on the client row');
  check((await body()).includes('ביקשה הסרה מדיוור ב-'), 'the card now says she asked to be removed, with the date');

  // ── closed after the trial, then renewed: the dashboard comes back without a reload ──
  await db.from('tenants').update({ plan_status: 'trial', trial_ends_at: new Date(Date.now() - 2 * 864e5).toISOString() }).eq('id', tenantId);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="plan-blocked-screen"]', { timeout: 60000 }).catch(() => {});
  check(await page.locator('[data-testid="plan-blocked-recheck"]').count() === 1, 'the closed screen offers "שילמתי, לבדוק שוב"');
  await page.screenshot({ path: `${OUT}/leftovers-blocked.png`, fullPage: true });
  await page.locator('[data-testid="plan-blocked-recheck"]').click(); await page.waitForTimeout(1500);
  check(await page.locator('[data-testid="plan-blocked-screen"]').count() === 1, 'while unpaid, checking again keeps the closed screen');
  await db.from('tenants').update({ plan_status: 'active', trial_ends_at: null }).eq('id', tenantId);
  const t0 = Date.now();
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid="plan-blocked-screen"]').count() === 0, `after payment the dashboard reopens by itself, no reload (${Math.round((Date.now() - t0) / 1000)}s)`);
} catch (e) {
  fails.push(`threw: ${e.message}`);
  console.error(e);
} finally {
  if (problems.length) log('page problems:', JSON.stringify(problems.slice(0, 12)));
  await browser.close();
  const left = await purgeTenant(tenantId, userId);
  log('cleanup', left.length ? left.join('; ') : 'ok');
}

log(fails.length ? `${fails.length} FAILED` : 'all passed');
process.exit(fails.length ? 1 : 0);
