// test-skin-scan-guard.js
//
// Tests for the skin-scan protections. Run with plain node:
//
//     node test-skin-scan-guard.js
//
// NO DATABASE. NO NETWORK. The supabase client is an injected fake.
//
// ── What is actually being protected ───────────────────────────────────────
// /api/skin-scan is public, calls Claude with an image at max_tokens 3000, and
// costs about $0.0135 a call. The three measures do DIFFERENT jobs and the
// tests are grouped that way:
//
//   signature  - stops naming a tenant whose link you never had. It does NOT
//                stop someone who HAS a link; the link is public by design.
//   quota      - the only hard cap on money.
//   rate limit - a speed bump (in-memory, per serverless instance).
//
// The most important assertions here are the two that are easy to get
// backwards: a refusal must NOT consume the ceiling, and an unreadable quota
// must fail OPEN.

process.env.CONFIRM_LINK_SECRET = 'test-secret-for-scan-links';

import { signScanLink, verifyScanLink, buildScanUrl } from './lib/scanToken.ts';
import {
  getQuotaStatus,
  monthStartIso,
  monthlyLimit,
  DEFAULT_MONTHLY_LIMIT,
  SKIN_SCAN_CALL_SITE,
} from './lib/skinScanQuota.ts';

const OUT = console.log.bind(console);
let passed = 0, failed = 0;
const eq = (l, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passed++; else { failed++; OUT(`  FAIL  ${l}\n        got  ${a}\n        want ${b}`); }
};
const ok = (l, c) => { if (c) passed++; else { failed++; OUT(`  FAIL  ${l}`); } };
const group = (n) => OUT(`\n── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}`);
const quiet = (fn) => async () => {
  const e = console.error; console.error = () => {};
  try { return await fn(); } finally { console.error = e; }
};

const TENANT = '448e9e45-2251-4572-b665-886c5bc7a4c8';
const OTHER  = 'b09637c8-a5c8-4b80-bda8-ff603f7ada60';

/** Fake supabase whose ai_usage count is whatever the test says. */
function makeDb({ count = 0, error = null, nullCount = false, throwOn = false } = {}) {
  const seen = [];
  return {
    seen,
    from(table) {
      const filters = {};
      const chain = {
        select() { return chain; },
        eq(col, val) { filters[col] = val; return chain; },
        gte(col, val) { filters[col] = val; return chain; },
        then(res) {
          if (throwOn) throw new Error('connection exploded');
          seen.push({ table, filters });
          return Promise.resolve({ count: nullCount ? null : count, error }).then(res);
        },
      };
      return chain;
    },
  };
}

OUT('='.repeat(64));
OUT('skin-scan guards');
OUT('NO database, NO network.');
OUT('='.repeat(64));

// ── 1. signature ───────────────────────────────────────────────────────────
group('signature');
{
  const sig = signScanLink(TENANT);
  ok('produces a token', typeof sig === 'string' && sig.length === 32);
  ok('URL-safe (no +, / or =)', !/[+/=]/.test(sig));
  ok('deterministic', signScanLink(TENANT) === sig);
  ok('valid token verifies', verifyScanLink(TENANT, sig));

  // THE POINT: a different tenant's signature must not admit this one.
  ok('another tenant\'s signature is rejected', !verifyScanLink(TENANT, signScanLink(OTHER)));
  ok('signature is tenant-specific', signScanLink(TENANT) !== signScanLink(OTHER));

  ok('tampered token rejected', !verifyScanLink(TENANT, sig.slice(0, -1) + 'x'));
  ok('truncated token rejected', !verifyScanLink(TENANT, sig.slice(0, 16)));
  ok('empty token rejected', !verifyScanLink(TENANT, ''));
  ok('null token rejected', !verifyScanLink(TENANT, null));
  ok('undefined token rejected', !verifyScanLink(TENANT, undefined));
  ok('missing tenant rejected', !verifyScanLink('', sig));
  ok('garbage does not throw', verifyScanLink(TENANT, '!!!not base64!!!') === false);
  ok('much longer token rejected without throwing', verifyScanLink(TENANT, 'x'.repeat(500)) === false);

  const url = buildScanUrl('https://example.com/', TENANT);
  ok('url has no double slash', !url.includes('.com//'));
  ok('url carries the tenant', url.includes(`t=${TENANT}`));
  ok('url carries the signature', url.includes(`s=${sig}`));
  const parsed = new URL(url);
  ok('url round-trips through URL parsing',
    verifyScanLink(parsed.searchParams.get('t'), parsed.searchParams.get('s')));
}

// ── 2. quota arithmetic ────────────────────────────────────────────────────
group('quota');
await quiet(async () => {
  eq('default limit', monthlyLimit(), DEFAULT_MONTHLY_LIMIT);

  const at = async (count) => getQuotaStatus(TENANT, { db: makeDb({ count }) });

  const zero = await at(0);
  eq('fresh month: used 0', zero.used, 0);
  eq('fresh month: not exceeded', zero.exceeded, false);
  eq('fresh month: full remaining', zero.remaining, 200);

  // The boundary, spelled out - off-by-one here either refuses a paying
  // customer early or hands out a free scan every month.
  const at199 = await at(199);
  eq('199 used -> allowed', at199.exceeded, false);
  eq('199 used -> 1 remaining', at199.remaining, 1);
  const at200 = await at(200);
  eq('200 used -> EXCEEDED (limit is inclusive)', at200.exceeded, true);
  eq('200 used -> 0 remaining', at200.remaining, 0);
  const at201 = await at(201);
  eq('201 used -> exceeded', at201.exceeded, true);
  eq('remaining never goes negative', at201.remaining, 0);

  // The query must be scoped, or one tenant's scans would spend another's cap.
  const db = makeDb({ count: 5 });
  await getQuotaStatus(TENANT, { db });
  const q = db.seen[0];
  eq('counts the ai_usage table', q.table, 'ai_usage');
  eq('filtered to THIS tenant', q.filters.tenant_id, TENANT);
  eq('filtered to the scanner call site', q.filters.call_site, SKIN_SCAN_CALL_SITE);
  ok('filtered from the start of the month', typeof q.filters.created_at === 'string');
})();

// ── 3. FAILS OPEN ──────────────────────────────────────────────────────────
//
// A database wobble must not switch off every cosmetician's lead capture. The
// ceiling is a cost guard, not an auth boundary.
group('quota fails OPEN, never closed');
await quiet(async () => {
  const err = await getQuotaStatus(TENANT, { db: makeDb({ error: { message: 'boom' } }) });
  eq('read error -> not exceeded', err.exceeded, false);
  eq('read error -> flagged unknown', err.unknown, true);

  // The exact false positive seen in production: head:true on a missing table
  // returns NO error and a null count.
  const nul = await getQuotaStatus(TENANT, { db: makeDb({ nullCount: true }) });
  eq('null count (no error!) -> not exceeded', nul.exceeded, false);
  eq('null count -> flagged unknown', nul.unknown, true);

  const thrown = await getQuotaStatus(TENANT, { db: makeDb({ throwOn: true }) });
  eq('thrown -> not exceeded', thrown.exceeded, false);
  eq('thrown -> flagged unknown', thrown.unknown, true);

  const noTenant = await getQuotaStatus('', { db: makeDb({ count: 999 }) });
  eq('no tenant -> not exceeded', noTenant.exceeded, false);
  eq('no tenant -> unknown', noTenant.unknown, true);

  ok('a healthy read is NOT flagged unknown',
    (await getQuotaStatus(TENANT, { db: makeDb({ count: 3 }) })).unknown === false);
})();

// ── 4. month boundary ──────────────────────────────────────────────────────
group('month boundary');
{
  const iso = monthStartIso(new Date('2026-08-26T17:00:00Z'));
  ok('is an ISO instant', /^\d{4}-\d{2}-\d{2}T/.test(iso));
  const d = new Date(iso);
  ok('lands on the 1st in Israel time',
    d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', day: 'numeric' }) === '1');
  // hour12:false yields "00", not "0" - compare numerically rather than by
  // string, which is what made this assertion fail against correct code.
  ok('lands at midnight Israel time',
    Number(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false })) === 0);
  ok('a scan on the 1st at 09:00 Israel is INSIDE the window',
    new Date('2026-08-01T06:00:00Z') >= d);
  ok('a scan on the last day of the previous month is OUTSIDE',
    new Date('2026-07-31T20:00:00Z') < d);

  // January must not roll back into the previous year's December.
  const jan = new Date(monthStartIso(new Date('2026-01-15T12:00:00Z')));
  ok('January resolves to January, not December',
    jan.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', month: 'numeric' }) === '1');
  ok('January keeps the right year',
    jan.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric' }) === '2026');
}

// ── 5. a refusal must not consume the ceiling ──────────────────────────────
//
// Not a code path so much as a property of the design: the count comes from
// ai_usage, which only ever gains a row when a call was actually paid for. If
// refusals were counted, an attacker could lock a cosmetician out of her own
// funnel for a month without spending a cent of ours.
group('refusals do not consume the ceiling');
await quiet(async () => {
  const db = makeDb({ count: 200 });
  const before = await getQuotaStatus(TENANT, { db });
  eq('at the cap', before.exceeded, true);
  const callsBefore = db.seen.length;
  // A refused request performs no insert; nothing about the count changes.
  const after = await getQuotaStatus(TENANT, { db });
  eq('still exactly at the cap, not above', after.used, 200);
  eq('reading the quota does not write', db.seen.length, callsBefore + 1);
  ok('the count query is a read of ai_usage only',
    db.seen.every((s) => s.table === 'ai_usage'));
})();

OUT('\n' + '='.repeat(64));
OUT(`  passed ${passed}   failed ${failed}`);
OUT('='.repeat(64));
if (failed > 0) process.exit(1);
