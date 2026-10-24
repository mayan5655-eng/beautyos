// Open the app as the tenant made by phone-setup.mjs, under a phone profile (see phone-profiles.mjs).
import fs from 'node:fs';
import { launch, BASE } from './lib.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';
export async function session(profile, stateFile, extra = {}) {
  const P = { ...PROFILES[profile], ...extra };
  const meta = JSON.parse(fs.readFileSync(stateFile + '.meta.json', 'utf8'));
  const s = await launch({ userAgent: P.ua, isMobile: true, hasTouch: true, storageState: stateFile, permissions: ['clipboard-read', 'clipboard-write'] });
  await s.ctx.addInitScript(initScript(P));
  const events = async () => s.page.evaluate(() => (window.__ev || []).map((e) => `${e.kind}: ${e.info}`));
  const clear = () => s.page.evaluate(() => { window.__ev = []; });
  const skip = async () => { for (let i = 0; i < 8; i++) { const k = s.page.locator('button:has-text("דלגי"), button:has-text("אחר כך"), button:has-text("לא עכשיו")').filter({ visible: true }).first(); if (await k.count()) { await k.click().catch(() => {}); await s.page.waitForTimeout(300); } else break; } };
  const open = async () => { await s.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await s.page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await s.page.waitForTimeout(1200); await skip(); };
  return { ...s, meta, events, clear, skip, open, P, BASE };
}
