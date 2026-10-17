import { chromium } from 'playwright';
const S = process.env.TEMP + '/smoke-state-' + (process.argv[2] || 'cosmetics') + '.json';
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: S, viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="עוד"]', { timeout: 60000 });
await page.waitForTimeout(1500);
for (let i = 0; i < 3; i++) { const sk = page.locator('button:has-text("דלגי")').first(); if (await sk.count() && await sk.isVisible().catch(()=>false)) { await sk.click().catch(()=>{}); await page.waitForTimeout(300);} }
console.log('aria labels:', JSON.stringify(await page.$$eval('button[aria-label], [role=button][aria-label]', (b) => [...new Set(b.map((x) => x.getAttribute('aria-label')))])));
const gear = page.locator('button[aria-label*="הגדרות"]').first();
console.log('gear count', await page.locator('button[aria-label*="הגדרות"]').count());
await gear.click().catch((e) => console.log('gear click failed', e.message.slice(0, 80)));
await page.waitForTimeout(1200);
console.log('settings text:', (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 500));
console.log('settings buttons:', JSON.stringify(await page.$$eval('.sheet button, [role=dialog] button', (b) => b.map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)).filter(Boolean).slice(0, 40))));
await browser.close();
