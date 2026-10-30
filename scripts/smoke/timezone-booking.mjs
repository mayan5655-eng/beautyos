// The booking page for someone whose phone is NOT on Israel time (a client abroad, a phone with the wrong zone): the days offered and the
// "today" must be Israel's, because the business is. Compares the day chips under three zones.
//   SMOKE_BASE=<deployment> node scripts/smoke/timezone-booking.mjs <slug>
import { chromium } from 'playwright';
import { BASE } from './lib.mjs';
const slug = process.argv[2] || 'clinic-bdika';
const b = await chromium.launch(); const out = {};
for (const tz of ['Asia/Jerusalem', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  const c = await b.newContext({ timezoneId: tz, viewport: { width: 430, height: 900 }, isMobile: true, locale: 'he-IL' });
  const p = await c.newPage();
  await p.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.locator('a:has-text("קביעת תור אונליין")').first().click(); await p.waitForTimeout(2500);
  out[tz] = await p.locator('.bk-chip').evaluateAll((els) => els.slice(0, 8).map((e) => (e.getAttribute('aria-label') || e.innerText).replace(/\s+/g, ' ').trim()));
  await c.close();
}
await b.close();
for (const [tz, v] of Object.entries(out)) console.log(tz.padEnd(22), v.join(' | '));
const base = JSON.stringify(out['Asia/Jerusalem']);
console.log(Object.entries(out).every(([, v]) => JSON.stringify(v) === base) ? 'SAME days in every zone' : 'DIFFERENT days by zone');
