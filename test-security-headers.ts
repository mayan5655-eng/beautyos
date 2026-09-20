// test-security-headers.ts
//
// Proves lib/securityHeaders.ts: the headers next.config.ts sends carry the
// protections the review asked for, allow exactly the origins the app uses,
// and never ship the development loosenings to production. Plain node.

import { buildCsp, securityHeaders } from './lib/securityHeaders.ts';

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co' };
const prod = buildCsp({ dev: false, env });
const dev = buildCsp({ dev: true, env });
const directive = (csp: string, name: string) => {
  const m = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' '));
  return m ? m.slice(name.length + 1).split(' ') : null;
};

// ── The point of the exercise ──────────────────────────────────────────────
eq(directive(prod, 'frame-ancestors'), ["'none'"], 'cannot be framed');
eq(directive(prod, 'frame-src'), ["'none'"], 'frames nothing');
eq(directive(prod, 'object-src'), ["'none'"], 'no plugins');
eq(directive(prod, 'base-uri'), ["'self'"], 'base pinned');
eq(directive(prod, 'form-action'), ["'self'"], 'forms post to self');
eq(prod.includes('upgrade-insecure-requests'), true, 'upgrades http subresources in production');

// ── What the app needs ─────────────────────────────────────────────────────
eq(directive(prod, 'script-src')?.includes('https://cdnjs.cloudflare.com'), true, 'html2canvas from cdnjs');
eq(directive(prod, 'script-src')?.includes("'unsafe-inline'"), true, 'Next inline scripts and the install-prompt catcher');
eq(directive(prod, 'style-src')?.includes('https://fonts.googleapis.com'), true, 'the @import fonts');
eq(directive(prod, 'font-src')?.includes('https://fonts.gstatic.com'), true, 'font files');
eq(directive(prod, 'img-src')?.includes('https:'), true, 'images from anywhere over https');
eq(directive(prod, 'img-src')?.includes('blob:'), true, 'canvas previews');
eq(directive(prod, 'media-src')?.includes('blob:'), true, 'the reel player');
eq(directive(prod, 'worker-src')?.includes("'self'"), true, 'the service worker');
{
  const c = directive(prod, 'connect-src') || [];
  eq(c.includes('https://abcdefgh.supabase.co'), true, 'the configured Supabase origin');
  eq(c.includes('wss://abcdefgh.supabase.co'), true, 'and its realtime socket');
  eq(c.includes('https://*.supabase.co'), true, 'plus the wildcard fallback');
  eq(c.some((s) => s.includes('ingest.sentry.io')), true, 'Sentry ingest');
  eq(c.includes('ws://localhost:*'), false, 'no localhost websocket in production');
}

// ── Development loosens exactly two things ─────────────────────────────────
eq(directive(dev, 'script-src')?.includes("'unsafe-eval'"), true, 'dev: React Refresh needs eval');
eq(directive(prod, 'script-src')?.includes("'unsafe-eval'"), false, 'prod: no eval');
eq(directive(dev, 'connect-src')?.includes('ws://localhost:*'), true, 'dev: hot reload socket');
eq(dev.includes('upgrade-insecure-requests'), false, 'dev: no upgrade on http://localhost');

// ── A missing or junk Supabase URL does not break the policy ───────────────
{
  const none = directive(buildCsp({ env: {} }), 'connect-src') || [];
  eq(none.includes('https://*.supabase.co'), true, 'wildcard still present with no env');
  eq(none.includes('null'), false, 'no literal null in the policy');
  const junk = directive(buildCsp({ env: { NEXT_PUBLIC_SUPABASE_URL: 'not a url' } }), 'connect-src') || [];
  eq(junk.includes('https://*.supabase.co'), true, 'junk URL ignored');
}
// A custom Supabase domain is honoured.
eq(directive(buildCsp({ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.bloomos.co.il/' } }), 'connect-src')?.includes('https://db.bloomos.co.il'), true, 'custom domain origin, no trailing slash');

// ── The full header set ────────────────────────────────────────────────────
{
  const h = securityHeaders({ dev: false, env });
  const byKey = Object.fromEntries(h.map((x) => [x.key, x.value]));
  eq(byKey['X-Frame-Options'], 'DENY', 'X-Frame-Options for old browsers');
  eq(byKey['X-Content-Type-Options'], 'nosniff', 'nosniff');
  eq(byKey['Referrer-Policy'], 'strict-origin-when-cross-origin', 'referrer policy');
  eq(byKey['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains', 'HSTS two years, no preload');
  eq(byKey['Permissions-Policy']?.includes('camera=(self)'), true, 'camera allowed first-party for the scanner');
  eq(byKey['Permissions-Policy']?.includes('microphone=(self)'), true, 'microphone allowed first-party for voice');
  eq(byKey['Permissions-Policy']?.includes('geolocation=()'), true, 'geolocation off');
  eq(typeof byKey['Content-Security-Policy'], 'string', 'CSP present');
  const devH = securityHeaders({ dev: true, env });
  eq(devH.some((x) => x.key === 'Strict-Transport-Security'), false, 'no HSTS on localhost');
}

console.log(`test-security-headers: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
