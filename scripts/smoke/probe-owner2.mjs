import { launch, PASSWORD, BASE, admin } from './lib.mjs';
import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(process.env.TEMP + '/smoke-acct-' + (process.argv[2] || 'cosmetics') + '.json', 'utf8'));
const { browser, ctx, page, problems } = await launch();
const db = admin();
const txt = async (p = page, n = 500) => (await p.innerText('body')).replace(/\s+/g, ' ').slice(0, n);
const btns = async (p = page) => JSON.stringify(await p.$$eval('button, [role=button]', (b) => b.filter((x) => x.offsetParent).map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 26)).filter(Boolean).slice(0, 60)));

// 1. public booking, completed (skipped when this tenant already has the booking)
const { data: have } = await db.from('appointments').select('id').eq('tenant_id', a.tenantId);
if (!have?.length) {
const pub = await ctx.newPage();
await pub.goto(`${BASE}/book?t=${a.tenantId}`, { waitUntil: 'domcontentloaded' }); await pub.waitForTimeout(3000);
await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).nth(1).click(); await pub.waitForTimeout(1200);
await pub.locator('.bk-chip[aria-label^="יום שני"]').first().click(); await pub.waitForTimeout(2000);
await pub.getByText('10:00', { exact: true }).first().click(); await pub.waitForTimeout(600);
await pub.locator('button:has-text("המשיכי")').first().click(); await pub.waitForTimeout(1200);
await pub.fill('input[placeholder="שם מלא"]', 'דנה בדיקה'); await pub.fill('input[type=tel]', '0500000099');
await pub.locator('input[type=checkbox]').first().check();
await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click();
await pub.waitForTimeout(4000);
console.log('BOOKED:', await txt(pub, 700));
const { data: appts } = await db.from('appointments').select('id,name,client_phone,service,date,start_minute,confirmation_sent,confirmation_status,client_id').eq('tenant_id', a.tenantId);
console.log('appointments in db', JSON.stringify(appts));
const { data: wa } = await db.from('whatsapp_messages').select('*').eq('tenant_id', a.tenantId);
console.log('whatsapp rows', JSON.stringify(wa));
await pub.close();
}

// 2. owner
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type=email]', a.email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500);
for (let i = 0; i < 6; i++) { const sk = page.locator('button:has-text("דלגי")').filter({ visible: true }).first(); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; }
await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(1500);
console.log('CLIENTS:', await txt(page, 300));
await page.getByText('דנה בדיקה').filter({ visible: true }).first().click(); await page.waitForTimeout(1200);
console.log('CARD:', await txt(page, 900));
console.log('CARD BUTTONS:', await btns());
console.log('privacy panel', await page.locator('[data-testid="client-privacy"]').count());
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.click('button[aria-label="תשלום"]'); await page.waitForTimeout(800);
await page.locator('button:has-text("תשלום חדש")').filter({ visible: true }).first().click(); await page.waitForTimeout(1200);
console.log('CASHIER SHEET:', await txt(page, 900));
console.log('CASHIER BUTTONS:', await btns());
console.log('INPUTS', JSON.stringify(await page.$$eval('input,select,textarea', (e) => e.filter((x) => x.offsetParent).map((x) => `${x.tagName}:${x.type}:${x.placeholder || x.getAttribute('aria-label') || ''}`))));
console.log('problems', problems);
await browser.close();
