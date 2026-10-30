// Sideways scroll and tiny tap targets at the phone widths people really have (360 small Androids, 375 iPhone SE/mini, 390, 430).
// Public pages + the owner's tabs (needs the tenant from phone-setup.mjs as argv[2]).
//   SMOKE_BASE=<deployment> node --env-file=.env.local scripts/smoke/overflow-scan.mjs <stateFile>
import fs from 'node:fs';
import { launch, BASE } from './lib.mjs';
import { PROFILES, initScript } from './phone-profiles.mjs';
const stateFile = process.argv[2];
const meta = JSON.parse(fs.readFileSync(stateFile + '.meta.json', 'utf8'));
const slug = process.env.SLUG || 'clinic-bdika';
const pub = ['/', '/login', '/signup', '/' + slug, '/book?t=' + meta.tenantId, '/privacy', '/accessibility', '/skin-scan?t=' + meta.tenantId, '/community?t=' + meta.tenantId, '/form?id=00000000-0000-0000-0000-000000000000'];
const measure = () => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth,
  wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.right > innerWidth + 2 && s.position !== 'fixed' && !e.closest('[style*="overflow"]'); }).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().right)),
  small: [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && getComputedStyle(e).visibility !== 'hidden'; }).length });
let bad = 0;
for (const w of [360, 375, 390, 430]) {
  const s = await launch({ userAgent: PROFILES.iphone.ua, isMobile: true, hasTouch: true, viewport: { width: w, height: 800 }, storageState: stateFile });
  await s.ctx.addInitScript(initScript(PROFILES.iphone));
  const p = s.page;
  const pages = [...pub];
  for (const path of pages) {
    await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(1200);
    if (path === '/') { const t = path; }
    const m = await p.evaluate(measure);
    const over = m.sw > m.iw + 1; if (over) bad++;
    console.log(String(w).padEnd(4), path.slice(0, 30).padEnd(31), over ? 'SIDEWAYS ' + m.sw + '>' + m.iw + ' ' + m.wide.join(' | ') : 'ok', ' small-targets:', m.small);
  }
  // her tabs (the stored login is for kalmea.app: only meaningful when BASE is that origin)
  if (BASE.includes('kalmea.app')) {
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('button[aria-label="יומן"]', { timeout: 40000 }).catch(() => {});
    for (const label of ['היום', 'יומן', 'לקוחות', 'תשלום', 'תוכן']) {
      for (let i = 0; i < 6; i++) { const k = p.locator('button:has-text("דלגי"), button:has-text("לא עכשיו")').filter({ visible: true }).first(); if (await k.count()) { await k.click().catch(() => {}); await p.waitForTimeout(250); } else break; }
      await p.locator('button[aria-label="' + label + '"]').filter({ visible: true }).first().click().catch(() => {}); await p.waitForTimeout(1500);
      const m = await p.evaluate(measure); const over = m.sw > m.iw + 1; if (over) bad++;
      console.log(String(w).padEnd(4), ('tab ' + label).padEnd(31), over ? 'SIDEWAYS ' + m.sw + '>' + m.iw + ' ' + m.wide.join(' | ') : 'ok', ' small-targets:', m.small);
    }
  }
  await s.browser.close();
}
console.log(bad ? 'SIDEWAYS SCROLL on ' + bad + ' screens' : 'no sideways scroll anywhere');
