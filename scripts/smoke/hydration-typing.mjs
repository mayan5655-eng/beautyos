// Type into a form before the page's script has run (a slow phone), then see what is left once it has.
//   SMOKE_BASE=<deployment> node scripts/smoke/hydration-typing.mjs [/login /signup ...]
import { chromium } from 'playwright';
import { BASE } from './lib.mjs';
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/login', '/signup'];
const b = await chromium.launch();
for (const path of paths) {
  const c = await b.newContext({ viewport: { width: 430, height: 900 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await p.route(/_next\/static\/.*\.js/, async (r) => { await new Promise((x) => setTimeout(x, 2500)); r.continue(); }); // slow script
  await p.goto(BASE + path, { waitUntil: 'commit' });
  await p.waitForSelector('input[type=email]', { timeout: 20000 });
  await p.fill('input[type=email]', 'typed-early@example.com');
  const early = await p.inputValue('input[type=email]');
  await p.waitForTimeout(9000);
  const late = await p.inputValue('input[type=email]');
  const btn = await p.locator('button[type=submit]').first().isDisabled().catch(() => 'n/a');
  console.log(path, 'early value:', early, '| after hydration:', JSON.stringify(late), '| submit disabled now:', btn);
  await c.close();
}
await b.close();
