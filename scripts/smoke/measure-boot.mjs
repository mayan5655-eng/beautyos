// Boot measurement: opens the dashboard in a real browser and reports time to first screen, bytes and rows read from Supabase.
// Usage: node scripts/smoke/measure-boot.mjs <baseUrl> <demo-field|session.json>
//   demo-field: "cosmetics" or "nails" -> uses /demo/<field> (a demo tenant, never a real one)
//   session.json: a Playwright storageState file written by smoke-signup.mjs (a test tenant)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:3000';
const who = process.argv[3] || 'cosmetics';
const runs = Number(process.argv[4] || 3);

const results = [];
for (let r = 0; r < runs; r++) {
  const browser = await chromium.launch();
  const ctx = who.endsWith('.json')
    ? await browser.newContext({ storageState: who, viewport: { width: 430, height: 900 } })
    : await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const rest = []; const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 200)));
  page.on('response', async (resp) => {
    const u = resp.url();
    if (u.includes('/rest/v1/')) {
      let rows = null; let bytes = 0;
      try { const b = await resp.body(); bytes = b.length; const j = JSON.parse(b.toString('utf8')); rows = Array.isArray(j) ? j.length : 1; } catch { /* not json */ }
      rest.push({ table: u.split('/rest/v1/')[1].split('?')[0], rows, bytes });
    }
  });
  const t0 = Date.now();
  if (!who.endsWith('.json')) await page.goto(`${base}/demo/${who}`, { waitUntil: 'domcontentloaded' });
  else await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  // first real screen: the bottom nav button for the calendar exists once the dashboard has rendered
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }).catch(() => {});
  const tFirst = Date.now() - t0;
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  const tIdle = Date.now() - t0;
  const byTable = {};
  for (const x of rest) { byTable[x.table] ??= { requests: 0, rows: 0, bytes: 0 }; byTable[x.table].requests++; byTable[x.table].rows += x.rows || 0; byTable[x.table].bytes += x.bytes; }
  const totalBytes = rest.reduce((s, x) => s + x.bytes, 0);
  results.push({ tFirst, tIdle, restRequests: rest.length, restKB: Math.round(totalBytes / 1024), restRows: rest.reduce((s, x) => s + (x.rows || 0), 0), byTable, errors });
  await browser.close();
}
const med = (k) => results.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
console.log(JSON.stringify({ who, runs, median: { firstScreenMs: med('tFirst'), networkIdleMs: med('tIdle'), restRequests: med('restRequests'), restKB: med('restKB'), restRows: med('restRows') }, lastRunTables: results[results.length - 1].byTable, errors: [...new Set(results.flatMap((r) => r.errors))].slice(0, 10) }, null, 2));
