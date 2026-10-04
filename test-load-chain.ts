// test-load-chain.ts
//
// Guards the shape of the dashboard's boot sequence, which was reworked on
// 2026-10-04 to shorten the cold-load critical path (measured on throttled
// mobile: HTML 1.3s, JS 3.7s, Supabase chain 1.85s, ...). The chain was three
// dependent stages - auth check, then tenant lookup, then 14 table reads -
// each costing a full round trip PLUS a CORS preflight. Now:
//
//   stage 1: auth.getUser() || rpc(get_user_tenant_id) || 10 core reads
//   stage 2: the tenants read (it filters on the tenant id from stage 1)
//   after render: forms / expenses / waitlist (loadDeferred)
//
// The risk in "start the reads before you know who she is" is that a result
// could be USED before the checks that make it trustworthy. So this pins the
// order of the DECISIONS, not just the order of the requests, and it pins the
// rule this project has been bitten by: a deferred read that has not arrived
// must never render as an empty one (forms/expenses/waitlist read as "none"
// until loaded would be exactly "your data is gone").
//
// Source-shape assertions, like test-calendar-empty-tenant.ts: this suite has
// no React renderer. The behavioural counterpart (every tab and modal opened
// on a brand-new empty tenant, no ReferenceError) is scripts/e2e-empty-tenant.mjs.

import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const src = readFileSync('app/beautyos.jsx', 'utf8').replace(/\r\n/g, '\n');
const layout = readFileSync('app/layout.tsx', 'utf8').replace(/\r\n/g, '\n');

// ---- preconnect ------------------------------------------------------------
ok(/preconnect\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(layout), 'layout preconnects to the Supabase origin (saves DNS+TCP+TLS, ~4 round trips, on the first data request)');
ok(/crossOrigin:\s*['"]anonymous['"]/.test(layout), 'the preconnect is crossorigin - supabase-js reads are CORS fetches, a non-CORS preconnect socket is not reused for them');

// ---- loadAll ordering -------------------------------------------------------
const start = src.indexOf('const loadAll = async () => {');
const end = src.indexOf('// === CALCULATIONS ===', start);
ok(start > 0 && end > start, 'found loadAll');
const loadAll = src.slice(start, end);

const iGetUserCall = loadAll.indexOf('supabase.auth.getUser()');
const iRpcCall = loadAll.indexOf('supabase.rpc("get_user_tenant_id")');
const iFirstRead = loadAll.indexOf('supabase.from("appointments")');
const iAwaitAuth = loadAll.indexOf('await authP');
const iAwaitRpc = loadAll.indexOf('await rpcP');
const iTenantsRead = loadAll.indexOf('supabase.from("tenants")');

ok(iGetUserCall > 0 && iRpcCall > 0 && iFirstRead > 0 && iAwaitAuth > 0 && iAwaitRpc > 0 && iTenantsRead > 0, 'loadAll has getUser, the tenant rpc, the reads and the awaits on them');
ok(iGetUserCall < iAwaitAuth && iRpcCall < iAwaitAuth && iFirstRead < iAwaitAuth,
  'getUser, the tenant rpc and the core reads are all STARTED before the first await - that is the whole saving');
ok(iAwaitAuth < iAwaitRpc, 'the auth verdict is read before the rpc verdict, so a logged-out / offline user still short-circuits first');
ok(iTenantsRead > iAwaitRpc, 'the tenants read still happens AFTER the tenant id is known (it filters on it)');

// The decisions that make the early results trustworthy must still sit
// between the awaits and the first use of any result.
const iTransport = loadAll.indexOf('authTransportFailure');
const iRedirect = loadAll.indexOf('router.replace("/login")');
const iRpcErr = loadAll.indexOf('if (rpcErr)');
const iFirstSet = loadAll.lastIndexOf('setAppointments(');
const iCoreCheck = loadAll.indexOf('failedReads');
ok(iAwaitAuth < iTransport && iTransport < iRedirect, 'transport-failure check precedes the logged-out redirect (offline is not logged out)');
ok(iRedirect < iRpcErr, 'logged-out redirect precedes the rpc error handling');
ok(iRpcErr < iCoreCheck && iCoreCheck < iFirstSet, 'a failed core read stops the render BEFORE any state is set from the reads');
ok(/READS\.forEach\(\(\[name\], i\)/.test(loadAll) || /res\[name\]/.test(loadAll), 'results are still looked up by NAME, so a failure can say which read failed');

// ---- deferred reads ----------------------------------------------------------
for (const t of ['forms', 'expenses', 'waitlist']) {
  ok(!new RegExp(`\\["${t}",\\s+supabase\\.from`).test(loadAll), `${t} is no longer in the boot reads`);
}
const dStart = src.indexOf('const loadDeferred = async () => {');
ok(dStart > 0 && dStart < start, 'loadDeferred exists, defined before loadAll');
const deferredSrc = src.slice(dStart, start);
for (const t of ['forms', 'expenses', 'waitlist']) {
  ok(deferredSrc.includes(`supabase.from("${t}")`), `loadDeferred reads ${t}`);
}
ok(/"error"/.test(deferredSrc) && /Sentry\.captureException/.test(deferredSrc), 'a failed deferred read is recorded as "error" and reported to Sentry, never as an empty list');
ok(/loadDeferred\(\);\s*\n\s*\} catch \(err\)/.test(loadAll) || /setLoadError\(null\);\s*\n\s*loadDeferred\(\)/.test(loadAll), 'loadAll starts loadDeferred once the core load succeeded (so every refresh refreshes them too)');
ok(/useState\(\{\s*forms:\s*"loading",\s*expenses:\s*"loading",\s*waitlist:\s*"loading"\s*\}\)/.test(src), 'deferred status starts as "loading", not "ok"');

// ---- every consumer is gated ---------------------------------------------------
// tax tab reads expenses
const taxStart = src.indexOf('{activeTab==="tax"&&(()=>{');
const taxBlock = src.slice(taxStart, taxStart + 900);
ok(taxStart > 0 && /deferred\.expenses\s*!==\s*"ok"/.test(taxBlock) && /<DeferredGate/.test(taxBlock), 'tax tab shows a gate, not zero expenses, until expenses have loaded');
// waitlist card
ok(/deferred\.waitlist\s*!==\s*"ok"/.test(src), 'waitlist card is gated on deferred.waitlist');
// client sheet forms tab + label count
ok(/deferred\.forms\s*===\s*"ok"\s*\?\s*` \(\$\{cForms\.length\}\)`/.test(src) || /deferred\.forms==="ok"\?` \(\$\{cForms\.length\}\)`/.test(src), 'client sheet forms tab label shows no count until forms have loaded (0 would be a lie)');
ok(/clientTab==="forms"&&deferred\.forms/.test(src), 'client sheet forms content is gated on deferred.forms');

// no other reader of the three lists slipped in ungated
const readers = [...src.matchAll(/\b(expenses|waitlist)\.(filter|map|length|reduce|find)/g)].length;
ok(readers <= 6, `expenses/waitlist have only the known readers (found ${readers}) - a new reader needs a gate`);

console.log(`load chain: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);
