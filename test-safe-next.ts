// After signing in, ?next= only ever leads to a path on this site (2026-10-21: the Facebook connect link sends her to
// /login when she is not signed in, and continues to Facebook after).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeNext } from './lib/safeNext.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');

ok('same-site paths pass; other sites, schemes and tricks fall back', () => {
  assert.equal(safeNext('/api/facebook/oauth/start?publish=1'), '/api/facebook/oauth/start?publish=1');
  assert.equal(safeNext('/dashboard'), '/dashboard');
  for (const bad of ['https://evil.example', '//evil.example', '/' + String.fromCharCode(92) + 'evil.example', 'javascript:alert(1)', '/javascript:x', '', null, 'dashboard', '/a\nb']) {
    assert.equal(safeNext(bad), '/', String(bad));
  }
  assert.equal(safeNext('https://x', ''), '');
});

ok('the connect link redirects a signed-out browser to login with next, and login follows it', () => {
  const start = rd('app/api/facebook/oauth/start/route.ts');
  assert.match(start, /\/login\?next=\$\{encodeURIComponent\(back\)\}/);
  assert.match(start, /includes\('text\/html'\)/);
  const login = rd('app/login/page.tsx');
  assert.match(login, /^'use client'/);
  assert.match(login, /safeNext\(new URLSearchParams\(window\.location\.search\)\.get\('next'\), ''\)/);
});

console.log(`${n} passed`);
