// "/" for logged-in and logged-out visitors (2026-10-13). The rule is a pure function; the page wiring is pinned at source level.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wantsLandingPreview } from './lib/homeRoute.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('?landing=1 is the explicit switch for the public page, also for a logged-in session', () => {
  assert.equal(wantsLandingPreview({ landing: '1' }), true);
  assert.equal(wantsLandingPreview({ landing: ['1', 'x'] }), true);
});

ok('only the exact value 1 switches the preview on; utm links and other params do not', () => {
  assert.equal(wantsLandingPreview({}), false);
  assert.equal(wantsLandingPreview(undefined), false);
  assert.equal(wantsLandingPreview({ landing: '0' }), false);
  assert.equal(wantsLandingPreview({ landing: 'true' }), false);
  assert.equal(wantsLandingPreview({ utm_source: 'instagram', utm_medium: 'bio', fbclid: 'x' }), false);
});

ok('the root page: server-side branch, no redirect hop, app still loaded as its own chunk', () => {
  const p = rd('app/page.tsx');
  assert.doesNotMatch(p, /redirect\(/);
  assert.match(p, /BeautyOSLoader/);
  assert.doesNotMatch(p, /from "\.\/beautyos/); // never a static import: logged-out visitors must not download the app
  assert.match(p, /wantsLandingPreview\(await searchParams\)/);
  // the preview answer comes before any session work
  assert.ok(p.indexOf('wantsLandingPreview(await searchParams)') < p.indexOf('verifiedUserFromSession(supabase)'));
  assert.ok(/if \(user\) return <BeautyOSLoader ownerEntry=\{<OwnerEntry \/>\} \/>;\s*return <LandingPage \/>;/.test(p));
  assert.ok(!/supabase\.auth\.getUser\(\)/.test(p)); // the cheap local check stays the only gate (test-session-gate.ts)
});

ok('public routes stay public: demo, signup, login, terms, privacy, booking, data deletion', () => {
  const m = rd('lib/supabase/middleware.ts');
  for (const r of ["'/login'", "'/signup'", "'/book'", "'/data-deletion'", "'/demo'"]) assert.ok(m.includes(r), r);
  assert.match(m, /pathname === '\/'\) return true/);
});

console.log(`${n} passed`);
