// The app on a slow phone connection: time until the owner can tap the bottom bar, and what she sees meanwhile.
//   SMOKE_BASE=https://kalmea.app node --env-file=.env.local scripts/smoke/slow-network.mjs <stateFile>
import fs from 'node:fs';
import { session } from './phone-session.mjs';
import { BASE } from './lib.mjs';
const stateFile = process.argv[2];
for (const [label, down, up, rtt, cpu] of [['fast 4G', 9000, 4000, 40, 1], ['slow 4G / 3G fast', 1600, 750, 150, 4], ['slow 3G', 400, 400, 400, 6]]) {
  const s = await session('android', stateFile);
  const cdp = await s.ctx.newCDPSession(s.page);
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: down * 1024 / 8, uploadThroughput: up * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const t0 = Date.now(); let firstPaint = null;
  s.page.once('load', () => { firstPaint = Date.now() - t0; });
  await s.page.goto(BASE + '/', { waitUntil: 'commit' });
  let seen = null; let tap = null;
  for (let i = 0; i < 240; i++) { // up to 120 s
    const txt = await s.page.evaluate(() => document.body ? document.body.innerText.slice(0, 80).replace(/\s+/g, ' ') : '').catch(() => '');
    if (seen === null && txt.trim()) seen = Date.now() - t0;
    if (await s.page.locator('button[aria-label="יומן"]').first().isVisible().catch(() => false)) { tap = Date.now() - t0; break; }
    await s.page.waitForTimeout(500);
  }
  console.log(label.padEnd(20), 'first text:', seen === null ? 'never' : (seen / 1000).toFixed(1) + 's', '| app usable:', tap === null ? 'NOT within 120s' : (tap / 1000).toFixed(1) + 's');
  await s.browser.close();
}
