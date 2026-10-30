// The four dashboard fixes from the 2026-10-23 pass, on one NEW smoke tenant at 430px (everything it wrote is removed at the end):
//   F2  the till (תשלום חדש, not from the visit): a payment for a client with one visit today is linked to it (appointment_id)
//   C3  the calendar: "תזכורת" opens WhatsApp and the queued reminder becomes `sent` (skipped while the central number sends for real,
//       so no message ever goes out from a smoke run)
//   E3  the calendar day arrows: previous → / next ←
//   G1  Content > תבניות: open a blank template and come straight back -> "שלי" stays empty
// node --env-file=.env.local scripts/smoke/overnight-polish.mjs   (SMOKE_BASE=<preview>)
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[polish]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[polish] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';

const db = admin();
const email = newEmail('polish');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const { browser, ctx, page } = await launch();
const body = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const home = async () => { await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 }); await page.waitForTimeout(1500); await skipTour(); };
const CLIENT = 'דנה ליטוש';

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה ליטוש');
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

  // seed after onboarding: one client with a visit today (a fake 050-00000xx number, never a real person)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const { data: cl } = await db.from('clients').insert({ tenant_id: tenantId, name: CLIENT, phone: '+972500000079', status: 'active' }).select('id').single();
  await db.from('service_prices').insert({ tenant_id: tenantId, name: 'טיפול ליטוש', price: 180, duration: 60, active: true });
  const { data: ap } = await db.from('appointments').insert({ tenant_id: tenantId, name: CLIENT, client_phone: '+972500000079', client_id: cl.id, service: 'טיפול ליטוש', date: today, start_minute: 1380, hour: 23, duration: 30, price: 180, color: '#E9A9A1', confirmation_status: 'confirmed' }).select('id').single();
  check(!!ap?.id, 'seeded a client and a visit today');
  await home();

  // ── C3 + E3: the calendar ──
  await visible('button[aria-label="יומן"]').click(); await page.waitForTimeout(1500);
  const dayBtn = visible('button:text-is("יום")'); if (await dayBtn.count()) { await dayBtn.click().catch(() => {}); await page.waitForTimeout(800); }
  const prevT = (await visible('button[aria-label="יום קודם"]').innerText().catch(() => '')).trim();
  const nextT = (await visible('button[aria-label="יום הבא"]').innerText().catch(() => '')).trim();
  check(prevT === '→' && nextT === '←', `E3 day arrows: previous "${prevT}", next "${nextT}"`);
  const pb = await visible('button[aria-label="יום קודם"]').boundingBox(); const nb = await visible('button[aria-label="יום הבא"]').boundingBox();
  check(!!pb && !!nb && pb.x > nb.x, 'E3 previous sits on the right, next on the left');
  await page.screenshot({ path: `${SHOTS}/smoke-polish-calendar.png` });

  const { data: ps } = await db.from('platform_settings').select('whatsapp_auto_utility_enabled').eq('id', true).maybeSingle();
  if (ps?.whatsapp_auto_utility_enabled === true) {
    log('C3 skipped: the central number sends reminders for real, and a smoke run never sends a message');
  } else {
    // The visit card: "התחלתי" up front, the rest (תזכורת among them) behind "עוד ···".
    await visible('button[aria-label="עוד פעולות"]').click().catch((e) => log('more menu', e.message)); await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/smoke-polish-menu.png` });
    const rem = visible('button:text-is("תזכורת")');
    check(await rem.count() === 1, 'C3 the visit offers "תזכורת"');
    const popup = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    await rem.click().catch(() => {});
    const wa = await popup;
    if (wa) { await wa.waitForLoadState('domcontentloaded').catch(() => {}); log('C3 opened', wa.url().slice(0, 40)); await wa.close().catch(() => {}); }
    check(!!wa, 'C3 WhatsApp opened in a new tab');
    await page.waitForTimeout(2500);
    const { data: msgs } = await db.from('whatsapp_messages').select('status, message_type').eq('tenant_id', tenantId);
    const reminders = (msgs || []).filter((m) => /remind/.test(m.message_type || ''));
    log('C3 rows', JSON.stringify(msgs));
    check(reminders.length >= 1 && reminders.every((m) => m.status === 'sent'), `C3 the opened reminder is "sent", not left waiting (${reminders.map((m) => m.status).join(',') || 'none'})`);
  }

  // ── F2: the till ──
  await home();
  await visible('button[aria-label="תשלום"]').click(); await page.waitForTimeout(800);
  await visible('button:has-text("תשלום חדש")').click(); await page.waitForTimeout(1000);
  const sel = page.locator('.sheet select, [role=dialog] select').filter({ visible: true }).first();
  const opts = await sel.locator('option').allInnerTexts();
  const idx = opts.findIndex((o) => o.includes('טיפול ליטוש'));
  check(idx > 0, 'F2 the treatment is in the till menu');
  await sel.selectOption({ index: idx }); await page.waitForTimeout(500);
  await visible('input[placeholder="חיפוש לקוחה..."]').fill('ליטוש'); await page.waitForTimeout(700);
  await page.locator('.client-row').filter({ hasText: CLIENT, visible: true }).first().click(); await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/smoke-polish-till.png` });
  await page.locator('button:has-text("מזומן")').filter({ visible: true }).last().click().catch(() => {});
  await page.locator('button:has-text("רשמי תשלום")').filter({ visible: true }).first().click();
  await page.waitForTimeout(3000);
  const { data: rc } = await db.from('receipts').select('appointment_id, amount').eq('tenant_id', tenantId);
  check((rc || []).length === 1 && rc[0].appointment_id === ap.id && Number(rc[0].amount) === 180, `F2 the payment is linked to the visit (${JSON.stringify(rc)})`);

  // ── G1: open a blank template and come back ──
  await home();
  await visible('button[aria-label="תוכן"]').click(); await page.waitForTimeout(1500); await skipTour();
  await visible('button:text-is("תבניות")').click().catch(() => {}); await page.waitForTimeout(1200);
  await visible('button:has-text("להשתמש בתבנית"), button:has-text("פוסט 4:5")').click(); await page.waitForTimeout(3000);
  const opened = await db.from('designs').select('id').eq('tenant_id', tenantId);
  check((opened.data || []).length === 1, 'G1 opening the template made a working draft');
  await visible('button[aria-label="חזרה"]').click(); await page.waitForTimeout(2500);
  const left = await db.from('designs').select('id').eq('tenant_id', tenantId);
  check((left.data || []).length === 0, `G1 back without saving leaves "שלי" empty (${(left.data || []).length} left)`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at 430px');
} catch (e) {
  fails.push(`threw: ${e?.message}`);
  console.error(e);
  await page.screenshot({ path: `${SHOTS}/smoke-polish-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  log('cleanup', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 300));
}
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all checks passed');
process.exit(fails.length ? 1 : 0);
