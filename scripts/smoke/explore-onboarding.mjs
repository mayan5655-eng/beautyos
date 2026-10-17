import { launch, PASSWORD, BASE } from './lib.mjs';
import fs from 'node:fs';
const acct = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { browser, ctx, page, problems } = await launch();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type=email]', acct.email);
await page.fill('input[type=password]', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log('url:', page.url());
for (let step = 1; step <= 6; step++) {
  const txt = (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 260);
  const buttons = await page.$$eval('button', (b) => b.map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 30));
  const inputs = await page.$$eval('input,select,textarea', (e) => e.map((x) => `${x.tagName}:${x.type || ''}:${x.placeholder || x.getAttribute('aria-label') || x.name || ''}`).slice(0, 14));
  console.log(`--- step ${step}\n${txt}\nbuttons: ${JSON.stringify(buttons)}\ninputs: ${JSON.stringify(inputs)}`);
  const next = page.locator('button:has-text("הבא")').first();
  if (await next.count()) { await next.click().catch(() => {}); await page.waitForTimeout(900); } else break;
}
console.log('problems', problems);
await browser.close();
