// Full browser run for one NEW test account, against a local production build (never the real business, never a real message or charge):
//   create account (confirmed, no email is sent) -> login -> onboarding (cosmetics or nails, picks services) -> dashboard (trial nudge)
//   -> public booking page (books a real appointment) -> it shows up for the owner as a client -> cash payment in the cashier
//   -> download the client's data (JSON and CSV) -> erase the client (typed confirmation) -> the books keep the payment without her name.
// node --env-file=.env.local scripts/smoke/e2e.mjs <cosmetics|nails> [--keep]
// The account is named kalmea-smoke-*; unless --keep is given it is removed completely at the end (tenant rows, files, user).
// The local server must have been started with the WhatsApp/AI keys blanked (see the notes in the final report), so a booking cannot send a message.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';
import fs from 'node:fs';

const field = process.argv[2] || 'cosmetics';
const keep = process.argv.includes('--keep');
const log = (...a) => console.log(`[${field}]`, ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error(`[${field}] FAIL`, msg); } };
// A 404 on get_public_services is the known pending migration (the page falls back to reading the table): listed in the report, not hidden.
const NOISE = [/Invalid Sentry Dsn/i, /get_public_services/];
const nails = field === 'nails';

const db = admin();
const email = newEmail(`e2e-${field}`);
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId);

const { browser, ctx, page, problems } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel, p = page) => p.locator(sel).filter({ visible: true }).first();
const CLIENT = 'דנה בדיקה';
const PHONE = '0500000099';

try {
  // ── login and onboarding ──
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  check(true, 'a new account lands in onboarding');
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', nails ? 'סטודיו ניצן (בדיקה)' : 'קליניקת בדיקה');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  check((await body()).includes('בחרי לפחות תחום אחד'), 'the field step cannot be skipped');
  await page.click(nails ? 'button:has-text("מניקור ופדיקור")' : 'button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
  const svcRows = page.locator('button:has-text("דקות")').filter({ visible: true });
  const nSvc = await svcRows.count();
  check(nSvc >= 2, `the service picker offers ${nSvc} treatments for ${field}`);
  const picked = [];
  for (let i = 0; i < Math.min(2, nSvc); i++) { picked.push((await svcRows.nth(i).innerText()).split('\n')[0].trim()); await svcRows.nth(i).click(); await page.waitForTimeout(200); }
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("לא עכשיו")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await page.waitForTimeout(1500);
  const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
  await skipTour();
  check(true, 'onboarding finished, the dashboard is up');
  check(await page.locator('[data-testid="trial-nudge"]').count() > 0, 'the day-1 trial nudge card is shown');
  const { data: svcs } = await db.from('service_prices').select('name').eq('tenant_id', tenantId);
  check((svcs || []).length >= 2, `${(svcs || []).length} services were saved for the new business`);

  // ── public booking ──
  const pub = await ctx.newPage();
  const pubProblems = [];
  pub.on('console', (m) => { if (m.type() === 'error' && !NOISE.some((n) => n.test(m.text() + (m.location()?.url || '')))) pubProblems.push(m.text().slice(0, 200)); });
  pub.on('pageerror', (e) => pubProblems.push('pageerror ' + e.message.slice(0, 200)));
  await pub.goto(`${BASE}/book?t=${tenantId}`, { waitUntil: 'domcontentloaded' });
  await pub.waitForTimeout(3500);
  check((await body(pub)).includes(picked[0]), 'the public page lists the services she chose');
  await visible('button:has-text("קביעת תור")', pub).waitFor();
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).nth(1).click(); await pub.waitForTimeout(1200);
  await pub.locator('.bk-chip[aria-label^="יום שני"]').first().click(); await pub.waitForTimeout(2000);
  await pub.getByText('10:00', { exact: true }).first().click(); await pub.waitForTimeout(600);
  await pub.locator('button:has-text("המשיכי")').first().click(); await pub.waitForTimeout(1200);
  await pub.fill('input[placeholder="שם מלא"]', CLIENT); await pub.fill('input[type=tel]', PHONE);
  await pub.locator('input[type=checkbox]').first().check();
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click();
  await pub.waitForTimeout(4000);
  check((await body(pub)).includes('התור נקבע'), 'the booking page confirms the appointment');
  for (const p of pubProblems) { fails.push('public page: ' + p); console.error(`[${field}] PUBLIC PAGE PROBLEM`, p); }
  await pub.close();
  const { data: appts } = await db.from('appointments').select('id,name,client_phone,client_id,confirmation_sent,note').eq('tenant_id', tenantId);
  check(appts?.length === 1 && appts[0].name === CLIENT, 'the appointment is in the owner\'s calendar data');
  check(appts?.[0]?.confirmation_sent === false, 'confirmation_sent stays false: nothing was sent (messaging keys are blank), so it is not claimed as sent');
  check(!!appts?.[0]?.client_id, 'a client card was created from the booking');

  // ── the owner sees her ──
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="לקוחות"]', { timeout: 60000 }); await page.waitForTimeout(1200);
  await skipTour();
  await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(1200);
  await page.getByText(CLIENT).filter({ visible: true }).first().click(); await page.waitForTimeout(1000);
  const card = await body();
  check(card.includes('המידע על הלקוחה') && await page.locator('[data-testid="client-privacy"]').count() === 1, 'the client card shows the data export / erase panel');
  check(nails ? !card.includes('סוג עור') : true, nails ? 'a nail technician\'s client card has no skin type' : 'cosmetics client card ok');

  // ── payment (cash, no real charge) ──
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.click('button[aria-label="תשלום"]'); await page.waitForTimeout(800);
  await visible('button:has-text("תשלום חדש")').click(); await page.waitForTimeout(1000);
  // the treatment is added from the "+ הוסיפי שירות" menu inside the payment sheet
  const addSvc = page.locator('.sheet select, [role=dialog] select').filter({ visible: true }).first();
  await addSvc.selectOption({ index: 1 }); await page.waitForTimeout(500);
  const search = page.locator('input[placeholder="חיפוש לקוחה..."]').filter({ visible: true }).first();
  await search.fill('דנה'); await page.waitForTimeout(700);
  await page.getByText(CLIENT).filter({ visible: true }).last().click().catch(() => {});
  await page.locator('button:has-text("◦ מזמן")').first().click().catch(() => {});
  await page.locator('button:has-text("מזומן")').filter({ visible: true }).last().click().catch(() => {});
  await page.locator('button:has-text("רשמי תשלום")').filter({ visible: true }).first().click();
  await page.waitForTimeout(2500);
  const { data: rcpts } = await db.from('receipts').select('id,client_id,client_name,amount,payment_method').eq('tenant_id', tenantId);
  check(rcpts?.length === 1 && Number(rcpts[0].amount) > 0, `a payment was recorded (₪${rcpts?.[0]?.amount}, ${rcpts?.[0]?.payment_method})`);

  // ── export the client's data ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="לקוחות"]', { timeout: 60000 }); await page.waitForTimeout(1200);
  await skipTour();
  await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(1200);
  await page.getByText(CLIENT).filter({ visible: true }).first().click(); await page.waitForTimeout(1000);
  const dl = async (label) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), visible(`button:has-text("${label}")`).click()]); const f = await d.path(); return fs.readFileSync(f, 'utf8'); };
  const json = await dl('הורדה (JSON)');
  const parsed = JSON.parse(json);
  check(parsed.client?.name === CLIENT && parsed.sections?.appointments?.length === 1 && parsed.sections?.payments?.length === 1, 'the JSON export has her card, her appointment and her payment');
  check(!/token|secret|password/i.test(Object.keys(parsed.client).join(' ')), 'the export contains no secret-like fields');
  const csv = await dl('הורדה לאקסל');
  check(csv.startsWith('﻿') && csv.includes(CLIENT) && csv.includes('תורים (1)') && csv.includes('תשלומים (1)'), 'the CSV opens in Excel and lists her appointment and payment');

  // ── erase her ──
  await visible('button:has-text("מחיקת הלקוחה לצמיתות")').click(); await page.waitForTimeout(400);
  const confirmBtn = visible('button:has-text("מחיקה לצמיתות")');
  check(await confirmBtn.isDisabled(), 'the erase button is disabled until her name is typed');
  await page.fill('input[aria-label="שם הלקוחה לאישור"]', 'שם אחר'); await page.waitForTimeout(200);
  check(await confirmBtn.isDisabled(), 'a wrong name does not enable it');
  await page.fill('input[aria-label="שם הלקוחה לאישור"]', CLIENT); await page.waitForTimeout(200);
  page.on('response', async (r) => { if (r.url().includes('/api/clients/erase')) console.log(`[${field}] erase API ${r.status()} ${(await r.text().catch(() => '')).slice(0, 400)}`); });
  const t0 = Date.now();
  await confirmBtn.click();
  for (let i = 0; i < 60; i++) { const { data: left } = await db.from('clients').select('id').eq('tenant_id', tenantId); if (!left?.length) break; await page.waitForTimeout(500); }
  log(`erase finished in ${Math.round((Date.now() - t0) / 100) / 10}s`);
  await page.waitForTimeout(800);
  const { data: cl } = await db.from('clients').select('id').eq('tenant_id', tenantId);
  const { data: ap2 } = await db.from('appointments').select('name,client_phone,client_id').eq('tenant_id', tenantId);
  const { data: rc2 } = await db.from('receipts').select('client_name,client_id,amount').eq('tenant_id', tenantId);
  console.log('DEBUG after erase', JSON.stringify({ cl, ap2, rc2 }));
  check((cl || []).length === 0, 'her client card is gone');
  check(ap2?.length === 1 && ap2[0].name === 'לקוחה שנמחקה' && !ap2[0].client_phone && !ap2[0].client_id, 'her appointment stays in the calendar, anonymised');
  check(rc2?.length === 1 && rc2[0].client_name === 'לקוחה שנמחקה' && Number(rc2[0].amount) > 0, 'her payment stays in the books, anonymised, amount kept');
  check(!(await body()).includes(CLIENT), 'the screen no longer shows her');
} catch (e) {
  fails.push('exception: ' + e.message.slice(0, 300));
  console.error(e);
} finally {
  const real = problems.filter((p) => !NOISE.some((n) => n.test(p)));
  if (real.length) for (const p of [...new Set(real)].slice(0, 10)) { fails.push(p); console.error(`[${field}] PROBLEM`, p); }
  await ctx.storageState({ path: `${process.env.TEMP || '/tmp'}/smoke-state-${field}.json` }).catch(() => {});
  await browser.close();
  fs.writeFileSync(`${process.env.TEMP || '/tmp'}/smoke-acct-${field}.json`, JSON.stringify({ email, userId, tenantId }));
  if (!keep) { const left = await purgeTenant(tenantId, userId); log('cleanup', left.length ? left.join('; ') : 'done'); }
}
if (fails.length) { console.error(`\n[${field}] ${fails.length} failure(s)`); process.exit(1); }
console.log(`\n[${field}] e2e ok`);
