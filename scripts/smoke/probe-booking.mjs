// Walk the public booking page for a kept smoke tenant and print each step (used to find the right selectors).
import { launch, BASE } from './lib.mjs';
import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(process.env.TEMP + '/smoke-acct-' + (process.argv[2] || 'cosmetics') + '.json', 'utf8'));
const { browser, page, problems } = await launch();
const dump = async (label) => console.log(`--- ${label}\n` + (await page.innerText('body')).replace(/\s+/g, ' ').slice(-500) + '\nINPUTS ' + JSON.stringify(await page.$$eval('input,select,textarea', (e) => e.map((x) => `${x.tagName}:${x.type}:${x.id || x.name || x.placeholder || x.getAttribute('aria-label') || ''}`))));
await page.goto(`${BASE}/book?t=${a.tenantId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.locator('button:has-text("קביעת תור")').filter({ visible: true }).nth(1).click();
await page.waitForTimeout(1200);
await page.locator('.bk-chip[aria-label^="יום שני"]').first().click(); await page.waitForTimeout(2000);
await page.getByText('10:00', { exact: true }).first().click(); await page.waitForTimeout(800);
await page.locator('button:has-text("המשיכי")').first().click(); await page.waitForTimeout(1500);
await dump('after continue');
console.log('problems', problems);
await browser.close();
