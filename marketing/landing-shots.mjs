// marketing/landing-shots.mjs
//
// Real screenshots of the product for the landing page: the live app on the demo tenant, at phone size, with the demo banner
// hidden. Nothing is staged or drawn: what is in the file is what the app shows. AI routes are blocked, nothing is saved.
//
//   node landing-shots.mjs [home,calendar,...]   -> out/landing/<id>.png
//
// Then convert and copy to public/landing/ (see the end of this file for the sizes the page expects).

import fs from 'node:fs';
import path from 'node:path';
import { BASE, DEMO_FIELD, DEMO_TENANT, OUT, AI_ROUTES, openBrowser, pause, log } from './lib.mjs';

const dir = path.join(OUT, 'landing');
fs.mkdirSync(dir, { recursive: true });
const only = process.argv[2]?.split(',');

const nav = (p, l) => p.locator('button:visible', { hasText: new RegExp(`${l}$`) }).last();
const btn = (p, re) => p.locator('button:visible', { hasText: re }).first();
const home = async (p) => { await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" }); await pause(6000); await nav(p, "יומן").waitFor({ timeout: 20000 }); await pause(1500); };
const skipTour = async (p) => { for (let i = 0; i < 6; i++) { const sk = p.locator('button:visible', { hasText: 'דלגי' }).first(); if (await sk.count()) { await sk.click().catch(() => {}); await pause(300); } else break; } };

const noBanner = (p) => p.evaluate(() => { for (const e of document.querySelectorAll('div')) if (e.children.length && /תצוגת דמו/.test(e.textContent) && e.textContent.length < 120) { e.style.display = 'none'; break; } });
const more = async (p, re) => { await home(p); await nav(p, 'עוד').click(); await pause(900); await btn(p, re).click(); await pause(2000); };
const SHOTS = {
  advisor: (p) => more(p, /AI|יועץ/),
  leads: async (p) => { await home(p); await nav(p, 'לקוחות').click(); await pause(800); await btn(p, /^פניות/).click(); await pause(1800); },
  home: async (p) => { await home(p); },
  calendar: async (p) => { await home(p); await nav(p, 'יומן').click(); await pause(1800); },
  client: async (p) => { await home(p); await nav(p, 'לקוחות').click(); await pause(1200); await p.getByText('ליה דהן', { exact: true }).filter({ visible: true }).first().click(); await pause(1800); },
  messages: async (p) => { await home(p); await nav(p, 'לקוחות').click(); await pause(800); await btn(p, /^הודעות$/).click(); await pause(1800); },
  cashier: async (p) => { await home(p); await nav(p, 'תשלום').click(); await pause(1800); },
  reports: async (p) => { await home(p); await nav(p, 'תשלום').click(); await pause(900); await p.getByText(/סיכום הכנסות ודוחות/).filter({ visible: true }).first().click(); await pause(1800); },
  content: async (p) => { await home(p); await nav(p, 'תוכן').click(); await pause(1500); await btn(p, /^תבניות/).click(); await pause(1800); },
  booking: async (p) => { await p.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await p.locator('#bk-services').waitFor({ timeout: 15000 }); await pause(1000); },
};

const browser = await openBrowser();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
const r = await ctx.request.get(`${BASE}/demo/${DEMO_FIELD}`, { maxRedirects: 0 });
if (r.status() !== 307 && r.status() !== 302) throw new Error(`/demo/${DEMO_FIELD} answered ${r.status()}`);
await ctx.route(AI_ROUTES, (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));
await ctx.addInitScript(() => { window.__hideDemoBanner = true; });

for (const [id, go] of Object.entries(SHOTS)) {
  if (only && !only.includes(id)) continue;
  const page = await ctx.newPage();
  try {
    await go(page);
    await skipTour(page);
    await noBanner(page).catch(() => {});
    await pause(300);
    await page.screenshot({ path: path.join(dir, `${id}.png`) });
    log(`shot ${id}`);
  } catch (e) { console.error(`[shots] ${id} failed: ${e.message.split('\n')[0]}`); }
  await page.close();
}
await browser.close();
