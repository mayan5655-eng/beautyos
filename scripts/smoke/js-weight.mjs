// Which JavaScript the dashboard downloads on first load, biggest first (raw and compressed bytes).
import { chromium } from 'playwright';
import zlib from 'node:zlib';
const S = process.argv[2] || (process.env.TEMP + '/smoke-state-cosmetics.json');
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: S, viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
const js = [];
page.on('response', async (r) => { if (r.url().includes('/_next/static/') && r.url().endsWith('.js')) { const b = await r.body().catch(() => null); if (b) js.push({ f: r.url().split('/').pop(), raw: b.length, gz: zlib.gzipSync(b).length }); } });
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
await page.waitForTimeout(4000);
js.sort((a, b) => b.raw - a.raw);
console.log('files', js.length, 'raw KB', Math.round(js.reduce((s, x) => s + x.raw, 0) / 1024), 'gzip KB', Math.round(js.reduce((s, x) => s + x.gz, 0) / 1024));
for (const x of js.slice(0, 8)) console.log(x.f, Math.round(x.raw / 1024) + ' KB raw', Math.round(x.gz / 1024) + ' KB gz');
await browser.close();
