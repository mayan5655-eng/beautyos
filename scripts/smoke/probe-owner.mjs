import { launch, PASSWORD, BASE } from './lib.mjs';
import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(process.env.TEMP + '/smoke-acct-' + (process.argv[2] || 'cosmetics') + '.json', 'utf8'));
const { browser, page, problems } = await launch();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type=email]', a.email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500);
for (let i = 0; i < 6; i++) { const sk = page.locator('button:has-text("דלגי")').filter({ visible: true }).first(); if (await sk.count()) { await sk.click().catch(()=>{}); await page.waitForTimeout(300);} else break; }
const btns = async () => JSON.stringify(await page.$$eval('button', (b) => b.filter(x => x.offsetParent).map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28)).filter(Boolean).slice(0, 45)));
await page.click('button[aria-label="תשלום"]'); await page.waitForTimeout(1500);
console.log('CASHIER', (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 500)); console.log(await btns());
await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(1500);
console.log('CLIENTS', (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 400)); console.log(await btns());
console.log('problems', problems);
await browser.close();
