// test-client-activity.ts
//
// Proves lib/clientActivity.ts's one rule: a client with no appointment yet
// is NEW, not dormant. This is the fix for a live, confirmed audit finding -
// a brand-new client (zero appointments) was tagged "רדומה · 999+ ימים" and
// surfaced in the needs-attention queue's win-back suggestions, because the
// old code used a sentinel number (999) for "no last visit" and every >60
// comparison downstream read that sentinel as a genuinely lapsed client.
//
// The empty-tenant shape this guards against: clients.length > 0,
// appointments.length === 0 for that client - exactly what a cosmetician has
// the moment she adds someone from a phone call, before the first visit.

import assert from 'node:assert/strict';
import { daysSinceLastVisit, isActiveClient, isColdClient } from './lib/clientActivity.ts';

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const NOW = new Date('2026-10-02T12:00:00Z');

// ── The empty-tenant case: no appointment at all ────────────────────────────
ok(daysSinceLastVisit(null, NOW) === null, 'null lastApptDate -> null days (not a sentinel number)');
ok(daysSinceLastVisit(undefined, NOW) === null, 'undefined lastApptDate -> null days');
ok(daysSinceLastVisit('', NOW) === null, 'empty-string lastApptDate -> null days');
ok(isActiveClient(null, NOW) === false, 'a client with no appointment yet is never "active"');
ok(isColdClient(null, NOW) === false, 'a client with no appointment yet is never "cold" - this is the exact bug: it used to be true');

// The regression this exists to catch: null must NOT silently coerce to 0 in
// a bare `<= 60` comparison, which would make a never-visited client read as
// "just visited today" and wrongly active.
ok(isActiveClient(undefined, NOW) === false, 'undefined lastApptDate does not coerce into a false "active" reading');

// ── Real dates, so the boundary logic itself still works ───────────────────
ok(daysSinceLastVisit('2026-10-01T12:00:00Z', NOW) === 1, 'one day since her last visit');
ok(isActiveClient('2026-10-01T12:00:00Z', NOW) === true, 'visited yesterday -> active');
ok(isColdClient('2026-10-01T12:00:00Z', NOW) === false, 'visited yesterday -> not cold');

const sixtyOneDaysAgo = new Date(NOW.getTime() - 61 * 24 * 60 * 60 * 1000).toISOString();
ok(isColdClient(sixtyOneDaysAgo, NOW) === true, '61 days since her last visit -> cold');
ok(isActiveClient(sixtyOneDaysAgo, NOW) === false, '61 days since her last visit -> not active');

const sixtyDaysAgo = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
ok(isActiveClient(sixtyDaysAgo, NOW) === true, 'exactly 60 days -> still active (the boundary is inclusive)');
ok(isColdClient(sixtyDaysAgo, NOW) === false, 'exactly 60 days -> not cold');

console.log(`client activity: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);
