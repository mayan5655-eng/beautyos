// Business type required (owner decision 2026-10-23), on one NEW test account at 430px:
//   onboarding step 2 without a type -> "הבא" stops with a message and there is no "דלגי" -> pick עוסק פטור -> finish
//   -> the business type is saved -> clear it (service role, as an existing business that never chose) -> the till shows the
//   warning with a link -> the link opens Settings -> a cash payment still goes through.
// node --env-file=.env.local scripts/smoke/business-type.mjs   (SMOKE_BASE=<preview url> to run against a Vercel preview)
// The account is kalmea-smoke-*; it is removed completely at the end (purgeTenant). Never the real tenant. No message is sent.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const fails = [];
const log = (...a) => console.log('[business-type]', ...a);
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[business-type] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';
const CLIENT = 'לקוחת בדיקה סוג עסק';

const db = admin();
const email = newEmail('biztype');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const { browser, page, problems } = await launch();
const body = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה סוג עסק');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);

  // ── step 2, no type chosen ──
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  check(await visible('button:has-text("דלגי")').count() === 0, 'no "דלגי" on step 2 before a type is chosen');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  const stuck = await body();
  check(stuck.includes('בחרי סוג עסק'), 'pressing "הבא" without a type shows the message');
  check(stuck.includes('פרטי קשר ועיצוב') && stuck.includes('שלב 2 מתוך'), 'and stays on step 2');
  await page.screenshot({ path: `${SHOTS}/smoke-biztype-onboarding-required.png`, fullPage: true });

  await page.click('button:has-text("עוסק פטור")'); await page.waitForTimeout(300);
  check(!(await body()).includes('בחרי סוג עסק (פטור'), 'choosing a type clears the message');
  check(await visible('button:has-text("דלגי")').count() === 1, '"דלגי" is back once a type is chosen');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
  await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click(); await page.waitForTimeout(200);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  const { data: st } = await db.from('settings').select('business_tax_status').eq('tenant_id', tenantId).maybeSingle();
  check(st?.business_tax_status === 'exempt', `the type is saved (${st?.business_tax_status})`);

  // ── till with a type: no warning ──
  const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
  await skipTour();
  await page.click('button[aria-label="תשלום"]'); await page.waitForTimeout(800);
  await visible('button:has-text("תשלום חדש")').click(); await page.waitForTimeout(1000);
  check(await page.locator('[data-testid="cashier-tax-warning"]').count() === 0, 'with a type chosen, the till has no warning');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ── an existing business that never chose ──
  const { error: insErr } = await db.from('clients').insert({ tenant_id: tenantId, name: CLIENT, phone: '0500000097' });
  check(!insErr, `a client row exists${insErr ? ` (${insErr.message})` : ''}`);
  // The live column is NOT NULL DEFAULT 'exempt', so "never chose" is business_tax_status_set_at empty
  // (add_business_tax_status_set_at.sql). Migration run: clear it for real. Not run yet: the browser is shown the row as it will
  // look after the migration (the key present, empty) - the server and the database are untouched.
  const probe = await db.from('settings').select('business_tax_status_set_at').eq('tenant_id', tenantId).maybeSingle();
  const migrated = !probe.error;
  log('migration add_business_tax_status_set_at', migrated ? 'is applied: clearing the stamp in the database' : 'not applied: injecting the empty key in the browser');
  if (migrated) {
    const { error: clrErr } = await db.from('settings').update({ business_tax_status_set_at: null }).eq('tenant_id', tenantId);
    check(!clrErr, `stamp cleared${clrErr ? ` (${clrErr.message})` : ''}`);
  } else {
    await page.route('**/rest/v1/settings*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      let json = null; try { json = await res.json(); } catch { return route.fulfill({ response: res }); }
      const add = (r) => (r && typeof r === 'object' && 'tenant_id' in r ? { ...r, business_tax_status_set_at: null } : r);
      return route.fulfill({ response: res, json: Array.isArray(json) ? json.map(add) : add(json) });
    });
  }
  const openTill = async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 }); await page.waitForTimeout(1200);
    await skipTour();
    await page.click('button[aria-label="תשלום"]'); await page.waitForTimeout(800);
    await visible('button:has-text("תשלום חדש")').click(); await page.waitForTimeout(1000);
  };
  await openTill();
  const warn = page.locator('[data-testid="cashier-tax-warning"]').filter({ visible: true });
  check(await warn.count() === 1, 'the till shows the business-type warning for an unconfirmed type');
  const wt = (await warn.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(wt.includes('בדקי את סוג העסק') && wt.includes('עוסק פטור') && wt.includes('התשלום עצמו יירשם כרגיל'), `warning text: ${wt.slice(0, 200)}`);
  const box = await warn.first().boundingBox();
  check(!!box && box.x >= 0 && box.x + box.width <= 430, `fits the 430px screen (${box ? Math.round(box.x) + '+' + Math.round(box.width) : 'none'})`);
  await page.screenshot({ path: `${SHOTS}/smoke-biztype-till-warning.png` });

  // a cash payment still goes through with the warning showing
  const addSvc = page.locator('.sheet select, [role=dialog] select').filter({ visible: true }).first();
  await addSvc.selectOption({ index: 1 }); await page.waitForTimeout(500);
  const search = page.locator('input[placeholder="חיפוש לקוחה..."]').filter({ visible: true }).first();
  await search.fill('בדיקה'); await page.waitForTimeout(700);
  await page.getByText(CLIENT).filter({ visible: true }).last().click().catch(() => {});
  await page.locator('button:has-text("מזומן")').filter({ visible: true }).last().click().catch(() => {});
  await page.locator('button:has-text("רשמי תשלום")').filter({ visible: true }).first().click();
  await page.waitForTimeout(2500);
  const { data: rc } = await db.from('receipts').select('id, amount').eq('tenant_id', tenantId);
  check((rc || []).length === 1 && Number(rc[0].amount) > 0, `the payment was recorded with the warning showing (${(rc || []).length} rows)`);

  // the link opens Settings on the choice; confirming and saving works with or without the migration
  await openTill();
  await visible('button:has-text("לאישור סוג העסק בהגדרות")').click(); await page.waitForTimeout(1500);
  check(await page.locator('[data-testid="tax-status-unconfirmed"]').filter({ visible: true }).count() === 1, 'Settings says the type was never confirmed');
  await page.screenshot({ path: `${SHOTS}/smoke-biztype-settings.png` });
  await visible('button:has-text("עוסק מורשה")').click(); await page.waitForTimeout(300);
  check(await page.locator('[data-testid="tax-status-unconfirmed"]').filter({ visible: true }).count() === 0, 'tapping a type clears that line');
  const saveResp = page.waitForResponse((r) => r.url().includes('/api/settings/save'), { timeout: 20000 }).catch(() => null);
  await visible('button:has-text("שמירה ✓")').click();
  const sr = await saveResp;
  log('settings save answered', sr ? `${sr.status()} ${(await sr.text().catch(() => '')).slice(0, 160)}` : 'nothing (no request)');
  await page.waitForTimeout(2000);
  check(!(await body()).includes('לא הצלחנו לשמור את ההגדרות'), 'the save did not fail');
  const after = await db.from('settings').select(migrated ? 'business_tax_status, business_tax_status_set_at' : 'business_tax_status').eq('tenant_id', tenantId).maybeSingle();
  check(after.data?.business_tax_status === 'licensed', `the new type is saved (${after.data?.business_tax_status})`);
  if (migrated) check(!!after.data?.business_tax_status_set_at, 'and stamped');
  if (!migrated) await page.unroute('**/rest/v1/settings*');

  check(problems.filter((p) => !/favicon|sentry|vercel\.live/i.test(p)).length === 0, `no page errors (${problems.slice(0, 3).join(' | ')})`);
} catch (e) {
  fails.push(`threw: ${e?.message}`);
  console.error(e);
  await page.screenshot({ path: `${SHOTS}/smoke-biztype-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  log('cleanup', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 300));
}
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all checks passed');
process.exit(fails.length ? 1 : 0);
