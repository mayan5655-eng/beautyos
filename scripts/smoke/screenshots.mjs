// Three phone-width screenshots (home, calendar, client card) of a SMOKE tenant, for the preview review. Never the real tenant.
//   node --env-file=.env.local scripts/smoke/screenshots.mjs <tenantId> <outDir>   (login state from e2e.mjs cosmetics --keep)
import { chromium } from 'playwright';
import path from 'node:path';
import { admin, REAL_TENANT } from './lib.mjs';

const [tenantId, outDir] = process.argv.slice(2);
if (!tenantId || tenantId === REAL_TENANT || !outDir) throw new Error('tenant id (not the real one) and output folder needed');
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const db = admin();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

const { data: cl, error: ce } = await db.from('clients').insert({ tenant_id: tenantId, name: 'דנה כהן', phone: '+972501234567', status: 'active' }).select('id').single();
if (ce) throw new Error('client: ' + ce.message);
const rows = [['דנה כהן', 600, 'טיפול פנים', 260], ['נועה לוי', 690, 'עיצוב גבות', 80], ['מיכל ביטון', 780, 'טיפול פנים', 260]].map(([name, start, service, price], i) => ({
  tenant_id: tenantId, name, client_phone: i === 0 ? '+972501234567' : null, client_id: i === 0 ? cl.id : null, service, date: today,
  start_minute: start, hour: Math.floor(start / 60), duration: 60, price, color: '#E9A9A1', confirmation_status: 'confirmed',
}));
const { error: ae } = await db.from('appointments').insert(rows);
if (ae) throw new Error('appointments: ' + ae.message);

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: `${process.env.TEMP || '/tmp'}/smoke-state-cosmetics.json`, viewport: { width: 430, height: 900 }, deviceScaleFactor: 2, locale: 'he-IL' });
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
await page.waitForTimeout(2500);
for (let i = 0; i < 6; i++) { const sk = page.locator('button:has-text("דלגי")').first(); if (await sk.count() && await sk.isVisible().catch(() => false)) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; }
await page.screenshot({ path: path.join(outDir, 'kalmea-1-home.png') });
await page.click('button[aria-label="יומן"]'); await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, 'kalmea-2-calendar.png') });
await page.click('button[aria-label="לקוחות"]'); await page.waitForTimeout(1500);
await page.getByText('דנה כהן').filter({ visible: true }).first().click(); await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, 'kalmea-3-client-card.png') });
await browser.close();
console.log('screenshots saved in', outDir);
