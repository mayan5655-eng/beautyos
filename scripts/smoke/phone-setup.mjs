// Make ONE smoke tenant for the phone flows: onboarded through the UI on an iPhone profile, with one client, tomorrow's
// appointment and one cash receipt, then save the login so the flow scripts can reuse it.
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs <stateFile>        (remove later with phone-teardown.mjs <stateFile>)
import fs from 'node:fs';
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';
const stateFile = process.argv[2];
const db = admin();
const email = newEmail('flows');
const { data: created, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (error) throw error;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id; const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
const { browser, ctx, page } = await launch({ userAgent: PROFILES.iphone.ua, isMobile: true, hasTouch: true });
await ctx.addInitScript(initScript(PROFILES.iphone));
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה');
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
const pad = (n) => String(n).padStart(2, '0'); const d = new Date(Date.now() + 86400000); const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const { data: c } = await db.from('clients').insert({ tenant_id: tenantId, name: 'דנה בדיקה', phone: '0500000001', status: 'active' }).select().single();
const { error: ae } = await db.from('appointments').insert({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service: 'טיפול פנים', date: ymd, start_minute: 600, hour: 10, duration: 45, price: 200 });
if (ae) console.log('appt seed:', ae.message);
const { error: re } = await db.from('receipts').insert({ tenant_id: tenantId, client_id: c.id, client_name: c.name, service: 'טיפול פנים', amount: 200, payment_method: 'מזומן', note: '', items: '[]' });
if (re) console.log('receipt seed:', re.message);
await ctx.storageState({ path: stateFile });
fs.writeFileSync(stateFile + '.meta.json', JSON.stringify({ email, userId, tenantId, clientId: c.id, date: ymd }));
console.log('ready', email, tenantId);
await browser.close();
