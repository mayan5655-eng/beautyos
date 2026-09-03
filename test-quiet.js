// test-quiet.js
//
// Proves lib/quiet.js: when the business counts as quiet, when the comeback
// question is due, and - just as important - when it must NOT be. Plain node,
// no database, no network. `now` is injected everywhere so nothing here
// depends on the day the suite runs.

import { quietStatus, QUIET_GAP_DAYS, COMEBACK_WAIT_DAYS, COMEBACK_WINDOW_DAYS } from './lib/quiet.js';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const DAY = 86400000;
const NOW = new Date('2026-09-03T12:00:00').getTime();
const d = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

// ── Not quiet, no break: a normal week ─────────────────────────────────────
eq(quietStatus({ pastDates: [d(1), d(3), d(5)], now: NOW }).quietNow, false, 'active business is not quiet');
eq(quietStatus({ pastDates: [d(1), d(3), d(5)], now: NOW }).comebackDue, false, 'active business owes no comeback');

// ── Automatic quiet: history exists, calendar went dark ────────────────────
eq(quietStatus({ pastDates: [d(QUIET_GAP_DAYS + 2)], now: NOW }).quietNow, true, 'dark calendar with history = auto quiet');
// A brand-new tenant with NO history is not "quiet" - she is new.
eq(quietStatus({ pastDates: [], now: NOW }).quietNow, false, 'no history is not quiet');

// ── Manual quiet wins regardless of the calendar ───────────────────────────
eq(quietStatus({ pastDates: [d(1)], manualQuiet: true, now: NOW }).quietNow, true, 'manual quiet with a busy calendar');

// ── The comeback wait: day one back is NOT due, day 7 is ───────────────────
{
  // A 20-day break that ended `sinceEnd` days ago.
  const breakEnded = (sinceEnd) => [d(sinceEnd + 20), d(sinceEnd), d(Math.max(sinceEnd - 1, 0))];
  eq(quietStatus({ pastDates: breakEnded(1), now: NOW }).comebackDue, false, 'day 1 after quiet: not due (pressure)');
  eq(quietStatus({ pastDates: breakEnded(COMEBACK_WAIT_DAYS - 1), now: NOW }).comebackDue, false, 'day 6: still not due');
  const due = quietStatus({ pastDates: breakEnded(COMEBACK_WAIT_DAYS), now: NOW });
  eq(due.comebackDue, true, 'day 7: due');
  eq(due.quietStart, d(COMEBACK_WAIT_DAYS + 20), 'quietStart = last appointment before the break');
  eq(due.quietEnd, d(COMEBACK_WAIT_DAYS), 'quietEnd = first appointment back');
}

// ── The window closes: an old break never produces a stale question ────────
{
  const old = [d(COMEBACK_WINDOW_DAYS + 40), d(COMEBACK_WINDOW_DAYS + 1), d(1)];
  eq(quietStatus({ pastDates: old, now: NOW }).comebackDue, false, 'break older than the window: not due');
}

// ── Manual end date drives the wait exactly ────────────────────────────────
{
  const hist = [d(30), d(2)];
  const endedAt = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
  eq(quietStatus({ pastDates: hist, manualQuietEndedAt: endedAt(2), now: NOW }).comebackDue, false, 'manual end 2 days ago: waiting');
  const due = quietStatus({ pastDates: hist, manualQuietEndedAt: endedAt(COMEBACK_WAIT_DAYS), now: NOW });
  eq(due.comebackDue, true, 'manual end 7 days ago: due');
  eq(due.quietStart, d(30), 'manual quietStart = last appointment before the end stamp');
  eq(quietStatus({ pastDates: hist, manualQuietEndedAt: endedAt(COMEBACK_WINDOW_DAYS + 1), now: NOW }).comebackDue, false, 'manual end past the window: not due');
}

// ── Still quiet = never due, even if a gap is in the window ────────────────
eq(quietStatus({ pastDates: [d(40), d(12)], now: NOW }).comebackDue, false, 'quiet again: no comeback while away');

if (failed) { console.error(`${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`quiet: ${passed} assertions passed`);
