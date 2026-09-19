// test-rate-limit-policies.js
//
// Two guards against the bug that took two routes down for weeks: a .js route
// called checkTenantLimit with a policy name that was not in RATE_POLICIES,
// the lookup returned undefined, and the route threw on every call.
//
//   1. Every policy name used by any route under app/api exists in the table.
//      Found by reading the source, so a new caller with a typo fails here
//      rather than in production. The PolicyName type does this for .ts
//      callers; this does it for the .js ones the type never sees.
//   2. An unknown name, if one ever gets through, fails OPEN: the request is
//      allowed and the misconfiguration is logged, never a throw.
//
// Plain node, no network.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RATE_POLICIES, checkIpLimit, checkTenantLimit } from './lib/rateLimit.ts';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

// ── 1. Every caller names a real policy ────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/route\.(js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const CALL = /check(?:Ip|Tenant)Limit\([^,)]+,\s*['"]([^'"]+)['"]\s*\)/g;
const known = new Set(Object.keys(RATE_POLICIES));
const seen = new Map(); // policy -> first file using it
let calls = 0;
for (const file of walk('app/api')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(CALL)) {
    calls++;
    if (!seen.has(m[1])) seen.set(m[1], file);
    eq(known.has(m[1]), true, `policy "${m[1]}" used in ${file} exists in RATE_POLICIES`);
  }
}
eq(calls > 0, true, 'found at least one rate-limit call site to check');
// The two names that were missing, by name, so a regression is named too.
eq(known.has('comeback'), true, '"comeback" policy exists');
eq(known.has('owner-questions'), true, '"owner-questions" policy exists');

// ── 2. Every policy has the shape the gates read ───────────────────────────
for (const [name, p] of Object.entries(RATE_POLICIES)) {
  eq(typeof p.perIp?.limit === 'number' && p.perIp.limit > 0, true, `${name}.perIp.limit`);
  eq(typeof p.perIp?.windowMs === 'number' && p.perIp.windowMs > 0, true, `${name}.perIp.windowMs`);
  eq(typeof p.perTenant?.limit === 'number' && p.perTenant.limit > 0, true, `${name}.perTenant.limit`);
  eq(typeof p.perTenant?.windowMs === 'number' && p.perTenant.windowMs > 0, true, `${name}.perTenant.windowMs`);
  eq(typeof p.ipMessage('x'), 'string', `${name}.ipMessage returns text`);
  eq(typeof p.tenantMessage('x'), 'string', `${name}.tenantMessage returns text`);
}

// ── 3. An unknown name fails open, loudly, and never throws ────────────────
{
  const logged = [];
  const origError = console.error;
  console.error = (...a) => { logged.push(a.join(' ')); };
  let threw = false;
  let ipVerdict, tenantVerdict;
  try {
    ipVerdict = checkIpLimit(new Request('http://x/', { headers: { 'x-forwarded-for': '1.2.3.4' } }), 'no-such-policy');
    tenantVerdict = checkTenantLimit('tenant-1', 'no-such-policy');
  } catch { threw = true; }
  console.error = origError;
  eq(threw, false, 'unknown policy does not throw');
  eq(ipVerdict, null, 'unknown policy lets the IP request through');
  eq(tenantVerdict, null, 'unknown policy lets the tenant request through');
  eq(logged.length, 2, 'and logs once per gate');
  eq(logged[0].includes('no-such-policy'), true, 'the log names the missing policy');
}

// ── 4. A known name still limits ───────────────────────────────────────────
{
  const t = `test-tenant-${Date.now()}`;
  let last = null;
  for (let i = 0; i < RATE_POLICIES.comeback.perTenant.limit + 1; i++) last = checkTenantLimit(t, 'comeback');
  eq(last instanceof Response, true, 'comeback refuses past its per-tenant limit');
  eq(last && last.status, 429, 'with a 429');
}

console.log(`test-rate-limit-policies: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
