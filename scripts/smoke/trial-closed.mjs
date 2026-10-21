// The trial ends without payment -> the system CLOSES (owner decision 2026-10-21). One NEW test account, end to end:
//   create account -> onboarding -> one client row (service role, no message is sent) -> trial_ends_at in the past
//   -> the dashboard is ONLY the renewal screen (no calendar, no client name) -> /book?t= and /<slug> show the closed page
//   -> /api/book-appointment refuses (403 business_paused, before any message) -> plan back to trial -> the client is back.
// node --env-file=.env.local scripts/smoke/trial-closed.mjs   (SMOKE_BASE=<preview url> to run against a Vercel preview)
// The account is kalmea-smoke-*; it is removed completely at the end (purgeTenant). Never the real tenant.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const fails = [];
const log = (...a) => console.log('[trial-closed]', ...a);
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[trial-closed] FAIL', msg); } };

const db = admin();
const email = newEmail('trial-closed');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const { browser, page } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const CLIENT = 'לקוחת בדיקה סגירה';

try {
  // ── onboarding, same steps as e2e.mjs ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); // typed before hydration = empty fields on a slow preview
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה סגירה');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 3; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
  await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click(); await page.waitForTimeout(200);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  check(true, 'onboarding finished, the dashboard is up while on trial');

  const { error: insErr } = await db.from('clients').insert({ tenant_id: tenantId, name: CLIENT, phone: '0500000098' });
  check(!insErr, `a client row exists${insErr ? ` (${insErr.message})` : ''}`);
  const { data: st } = await db.from('settings').select('slug').eq('tenant_id', tenantId).maybeSingle();
  const { data: tn } = await db.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  const slug = tn?.slug || st?.slug || null;

  // ── the trial ends without payment ──
  const past = new Date(Date.now() - 2 * 864e5).toISOString();
  const { error: upErr } = await db.from('tenants').update({ plan_status: 'trial', trial_ends_at: past }).eq('id', tenantId);
  check(!upErr, `trial_ends_at set in the past${upErr ? ` (${upErr.message})` : ''}`);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="plan-blocked-screen"]', { timeout: 60000 }).catch(() => {});
  const closedText = await body();
  check(await page.locator('[data-testid="plan-blocked-screen"]').count() === 1, 'the dashboard is replaced by the renewal screen');
  check(closedText.includes('המערכת סגורה עד לחידוש המנוי'), 'it says the system is closed until renewal');
  check(closedText.includes('מחיר היכרות 349 ₪ לזמן מוגבל') && closedText.includes('499 ₪'), 'it quotes the intro price 349 for a limited time, against 499');
  check(!closedText.includes(CLIENT), 'no client name anywhere on the screen');
  check(await page.locator('button[aria-label="יומן"]').count() === 0, 'no calendar tab, no menu');
  check(!/צפייה בלבד/.test(closedText), 'no read-only promise');
  await page.screenshot({ path: 'smoke-trial-closed-dashboard.png', fullPage: true });

  // ── her public page: no new bookings ──
  const pub = await browser.newPage({ viewport: { width: 430, height: 900 }, locale: 'he-IL' });
  await pub.goto(`${BASE}/book?t=${tenantId}`, { waitUntil: 'domcontentloaded' });
  check(await pub.locator('[data-testid="booking-closed"]').count() === 1, '/book?t= shows the closed page');
  check(!/(מנוי|התנסות|קלמיה)/.test(await body(pub)), 'and says nothing about billing to her client');
  await pub.screenshot({ path: 'smoke-trial-closed-booking.png', fullPage: true });
  if (slug) {
    await pub.goto(`${BASE}/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' });
    check(await pub.locator('[data-testid="booking-closed"]').count() === 1, `/${slug} shows the closed page`);
  } else log('note: no slug on this tenant, /<slug> not checked');

  const r = await fetch(`${BASE}/api/book-appointment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId, name: 'בדיקה', phone: '0500000097', service: 'x', date: '2030-01-07', hour: 10, duration: 30 }) });
  const j = await r.json().catch(() => ({}));
  check(r.status === 403 && j.code === 'business_paused', `the booking API refuses (${r.status} ${j.code || ''})`);

  // ── she renews: everything comes back ──
  const future = new Date(Date.now() + 10 * 864e5).toISOString();
  await db.from('tenants').update({ plan_status: 'trial', trial_ends_at: future }).eq('id', tenantId);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }).catch(() => {});
  check(await page.locator('[data-testid="plan-blocked-screen"]').count() === 0, 'after renewal the dashboard is back');
  const { data: still } = await db.from('clients').select('id').eq('tenant_id', tenantId).eq('name', CLIENT);
  check((still || []).length === 1, 'the client row was never touched');
  await pub.goto(`${BASE}/book?t=${tenantId}`, { waitUntil: 'domcontentloaded' });
  check(await pub.locator('[data-testid="booking-closed"]').count() === 0, 'and the booking page is open again');
} catch (e) {
  fails.push(`threw: ${e.message}`);
  console.error(e);
} finally {
  await browser.close();
  const left = await purgeTenant(tenantId, userId);
  log('cleanup', left.length ? left.join('; ') : 'ok');
}

log(fails.length ? `${fails.length} FAILED` : 'all passed');
process.exit(fails.length ? 1 : 0);
