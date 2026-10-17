import { chromium } from 'playwright';
const S = process.env.TEMP + '/smoke-state-' + (process.argv[2] || 'cosmetics') + '.json';
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: S, viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="עוד"]', { timeout: 60000 });
await page.waitForTimeout(1500);
for (let i = 0; i < 3; i++) { const sk = page.locator('button:has-text("דלגי")').first(); if (await sk.count() && await sk.isVisible().catch(()=>false)) { await sk.click().catch(()=>{}); await page.waitForTimeout(300);} }
await page.click('button[aria-label="עוד"]'); await page.waitForTimeout(800);
const items = await page.$$eval('[role=dialog] button, .sheet button', (b) => b.map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean));
console.log(JSON.stringify(items));
await browser.close();
