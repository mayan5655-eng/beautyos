// Kalmea's own Meta Pixel (2026-11-10): on the landing and /signup only, off while the id is empty, never on a business's
// public pages (their visitors are the cosmeticians' clients), and no personal data in any event.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { metaPixelId, ensureFbq, trackPageView, trackCompleteRegistration, _resetMetaPixelForTests, META_PIXEL_PATHS, META_PIXEL_SCRIPT_SRC } from './lib/metaPixel.ts';
import { buildCsp, securityHeaders } from './lib/securityHeaders.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const ID = '29002367376081605';
const ON = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_META_PIXEL_ID: ID };
const OFF = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_META_PIXEL_ID: '' };

ok('the id: numeric only, anything else is off', () => {
  assert.equal(metaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: ID }), ID);
  assert.equal(metaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: ` ${ID} ` }), ID);
  assert.equal(metaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: '' }), null);
  assert.equal(metaPixelId({}), null);
  assert.equal(metaPixelId({ NEXT_PUBLIC_META_PIXEL_ID: "1');alert(1);('" }), null, 'nothing but digits ever reaches a script');
  assert.equal(metaPixelId(), null, 'the test run itself has it empty (scripts/run-tests.mjs FAKE_ENV)');
});

ok('env empty: the CSP is exactly what it was, even on the pixel paths', () => {
  assert.equal(buildCsp({ env: OFF, pixel: true }), buildCsp({ env: OFF }));
  assert.equal(buildCsp({ dev: true, env: OFF, pixel: true }), buildCsp({ dev: true, env: OFF }));
  assert.ok(!buildCsp({ env: OFF, pixel: true }).includes('facebook'));
});

ok('env set: only the pixel paths allow Meta; every other page still never names it', () => {
  const csp = buildCsp({ env: ON, pixel: true });
  const dir = (c: string, d: string) => (c.split('; ').find((p) => p.startsWith(d + ' ')) || '').split(' ').slice(1);
  assert.ok(dir(csp, 'script-src').includes('https://connect.facebook.net'));
  assert.ok(dir(csp, 'connect-src').includes('https://www.facebook.com'));
  assert.ok(dir(csp, 'img-src').includes('https://www.facebook.com'));
  assert.ok(!dir(csp, 'frame-src').some((v) => v.includes('facebook')), 'no frames');
  assert.ok(!buildCsp({ env: ON }).includes('facebook'), 'the default policy, with the id set, still never names Meta');
  assert.ok(!buildCsp({ env: ON, grow: true }).includes('facebook'), 'nor the /pay policy');
  const hdr = securityHeaders({ env: ON, pixel: true }).find((h) => h.key === 'Content-Security-Policy')!.value;
  assert.equal(hdr, csp);
  assert.deepEqual([...META_PIXEL_PATHS], ['/', '/signup']);
  const cfg = code('next.config.ts');
  assert.ok(/metaPixelId\(\)\s*\?\s*META_PIXEL_PATHS\.map\(\(source\) => \(\{ source, headers: securityHeaders\(\{[^}]*pixel: true \}\) \}\)\)\s*:\s*\[\]/.test(cfg), 'next.config adds the pixel policy for those paths only, and only when the id is set');
});

ok('the script: next/script afterInteractive, fbevents.js, rendered only with an id', () => {
  const c = code('app/MetaPixel.tsx');
  assert.equal(META_PIXEL_SCRIPT_SRC, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.ok(c.includes("from 'next/script'") && c.includes('strategy="afterInteractive"') && c.includes('src={META_PIXEL_SCRIPT_SRC}'));
  assert.ok(/if \(!id \|\| !load\) return null;/.test(c), 'env empty: no script rendered');
  assert.ok(c.includes('NO_TRACK_KEY') && /if \(!id \|\| ownBrowser\(\)\) return;/.test(c), 'the owner\'s own marked browser is not counted (same switch as PublicAnalytics)');
  assert.ok(c.includes("/[?&]no-track=1(&|$)/.test(q)) localStorage.setItem(NO_TRACK_KEY, '1')"), '?no-track=1 is honoured on the page itself, /signup included');
  assert.ok(!c.includes('<noscript'));
  assert.ok(fs.readFileSync('lib/metaPixel.ts', 'utf8').includes('process.env.NEXT_PUBLIC_META_PIXEL_ID'), 'a literal reference, so Next inlines it into the browser bundle');
});

ok('only the landing and the signup page mount it; never the layout, the app or a business page', () => {
  const users: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(t|j)sx?$/.test(e.name)) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (/from ['"](\.\.?\/)+MetaPixel['"]|from ['"]@\/app\/MetaPixel['"]/.test(s)) users.push(p.split(path.sep).join('/'));
      if (p !== path.join('app', 'MetaPixel.tsx')) assert.ok(!s.includes('connect.facebook.net'), `${p} loads nothing from Meta itself`);
      if (/fbq\(/.test(s) && !p.endsWith('MetaPixel.tsx')) assert.fail(`${p} calls fbq directly`);
    }
  };
  walk('app');
  assert.deepEqual(users.sort(), ['app/LandingPage.jsx', 'app/signup/page.tsx'], 'the landing (kalmea.app root) and /signup');
  assert.ok(!fs.readFileSync('app/layout.tsx', 'utf8').includes('MetaPixel'), 'not in the root layout (that would cover every booking page)');
  for (const f of ['app/[slug]/page.tsx', 'app/PublicLandingPage.tsx', 'app/BookingPage.jsx', 'app/pay/[token]/page.tsx', 'app/pay/[token]/PayClient.jsx', 'app/beautyos.jsx']) {
    if (fs.existsSync(f)) assert.ok(!/MetaPixel|metaPixel|fbq/.test(fs.readFileSync(f, 'utf8')), `${f} is never tracked`);
  }
});

ok('PageView and CompleteRegistration: no parameters, no advanced matching, autoConfig off', () => {
  _resetMetaPixelForTests();
  const w: any = {};
  assert.equal(trackPageView(null, w), false, 'no id: nothing, no fbq created');
  assert.equal(w.fbq, undefined);
  assert.equal(trackPageView(ID, w), true);
  const q = w.fbq.queue.map((a: unknown[]) => [...a]);
  assert.deepEqual(q, [['set', 'autoConfig', false, ID], ['init', ID], ['track', 'PageView']], 'init by id only: no email, phone or name');
  ensureFbq(ID, w); // a second page on the same visit does not init twice
  assert.equal(w.fbq.queue.filter((a: unknown[]) => a[0] === 'init').length, 1);
  assert.equal(trackCompleteRegistration(ID, w), true);
  assert.equal(trackCompleteRegistration(ID, w), false, 'once per page life');
  assert.deepEqual([...w.fbq.queue.at(-1)], ['track', 'CompleteRegistration'], 'no parameters');
  _resetMetaPixelForTests();
  assert.equal(trackCompleteRegistration(null, {} as any), false, 'id empty: a no-op');
});

ok('CompleteRegistration fires only after the server accepted a new account', () => {
  const s = code('app/signup/page.tsx');
  const at = s.indexOf('trackCompleteRegistration()');
  assert.ok(at > 0);
  const before = s.slice(0, at);
  assert.ok(before.lastIndexOf('if (error) {') > before.lastIndexOf('auth.signUp('), 'after the signUp error branch returns');
  assert.ok(before.lastIndexOf('identities.length === 0') > before.lastIndexOf('if (error) {'), 'and after the already-registered branch returns');
  assert.ok(/if \(data\.user\) trackCompleteRegistration\(\)/.test(s), 'only with a user back from the server');
  assert.equal(s.split('trackCompleteRegistration(').length - 1, 1, 'one call site');
});

ok('privacy: the paragraph exists and shows only while the pixel is on', () => {
  const p = fs.readFileSync('app/privacy/page.tsx', 'utf8');
  assert.ok(/\{metaPixelId\(\) && \(\s*<Section heHeading="מדידת מודעות באתר של קלמיה"/.test(p));
  assert.ok(p.includes('לא דפי ההזמנה של העסקים') && p.includes('Meta Pixel') && p.includes('לא נשלחים למטא'));
  const block = p.slice(p.indexOf('מדידת מודעות'), p.indexOf('</Section>', p.indexOf('מדידת מודעות')));
  assert.ok(!block.includes('—'), 'no em dash');
});

ok('.env.example names it, empty', () => {
  assert.ok(/^NEXT_PUBLIC_META_PIXEL_ID=$/m.test(fs.readFileSync('.env.example', 'utf8')));
  assert.ok(fs.readFileSync('scripts/run-tests.mjs', 'utf8').includes("NEXT_PUBLIC_META_PIXEL_ID: ''"));
});

console.log(`meta-pixel: ${n} ok`);
