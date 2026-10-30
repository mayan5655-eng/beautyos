// "/" is the landing page for everyone and the app lives at /dashboard (owner, 2026-10-30: each address is one thing). Pinned at source level.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('the root page only ever renders the landing page, and the session only changes its header link', () => {
  const p = rd('app/page.tsx');
  assert.doesNotMatch(p, /redirect\(/);
  assert.doesNotMatch(p, /BeautyOS/); // logged-out visitors must not download the app
  assert.match(p, /return <LandingPage signedIn=\{!!user\} \/>;/);
  assert.ok(!/supabase\.auth\.getUser\(\)/.test(p)); // the cheap local check stays the only gate (test-session-gate.ts)
  const l = rd('app/LandingPage.jsx');
  assert.match(l, /href=\{signedIn \? "\/dashboard" : "\/login"\}/);
});

ok('every way into the app lands on /dashboard, not on the landing page', () => {
  assert.match(rd('app/login/page.tsx'), /router\.push\('\/dashboard'\)/);
  const onb = rd('app/onboarding/page.tsx');
  assert.doesNotMatch(onb, /router\.replace\("\/"\)/);
  assert.match(onb, /`\/dashboard\?import=1&kind=/);
  assert.match(rd('app/auth/callback/route.ts'), /\?\? '\/dashboard'/);
  assert.match(rd('app/demo/[field]/route.ts'), /\$\{APP_URL\}\/dashboard/);
  const sw = rd('public/sw.js');
  assert.doesNotMatch(sw, /\|\| "\/"|: "\/" \}/);
  assert.match(rd('public/manifest.json'), /"start_url": "\/dashboard"/);
});

ok('the app at /dashboard loads as its own chunk', () => {
  const p = rd('app/dashboard/page.tsx');
  assert.match(p, /BeautyOSLoader/);
  assert.doesNotMatch(p, /beautyos\.jsx/);
});

ok('public routes stay public: demo, signup, login, terms, privacy, booking, data deletion', () => {
  const m = rd('lib/supabase/middleware.ts');
  for (const r of ["'/login'", "'/signup'", "'/book'", "'/data-deletion'", "'/demo'"]) assert.ok(m.includes(r), r);
  assert.match(m, /pathname === '\/'\) return true/);
});

console.log(`${n} passed`);
