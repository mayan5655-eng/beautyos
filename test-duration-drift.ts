import assert from 'node:assert/strict';
import { actualDurationMinutes, durationOutcome, durationOutcomeHe } from './lib/durationDrift.ts';

// ── actualDurationMinutes ────────────────────────────────────────────────────
assert.equal(actualDurationMinutes('2026-10-01T09:00:00Z', '2026-10-01T10:15:00Z'), 75);
assert.equal(actualDurationMinutes(null, '2026-10-01T10:15:00Z'), null, 'never started');
assert.equal(actualDurationMinutes('2026-10-01T09:00:00Z', null), null, 'never finished');
assert.equal(actualDurationMinutes('not a date', '2026-10-01T10:15:00Z'), null);
assert.equal(actualDurationMinutes('2026-10-01T10:15:00Z', '2026-10-01T09:00:00Z'), null, 'end before start is not a real reading');

// ── durationOutcome ───────────────────────────────────────────────────────────
{
  const o = durationOutcome('2026-10-01T09:00:00Z', '2026-10-01T10:15:00Z', 60);
  assert.deepEqual(o, { actualMinutes: 75, bookedMinutes: 60, driftMinutes: 15 });
}
assert.equal(durationOutcome(null, null, 60), null);
{
  // A booked duration that never parsed (e.g. dropped column) reads as 0, not a throw.
  const o = durationOutcome('2026-10-01T09:00:00Z', '2026-10-01T09:30:00Z', NaN);
  assert.deepEqual(o, { actualMinutes: 30, bookedMinutes: 0, driftMinutes: 30 });
}

// ── durationOutcomeHe ─────────────────────────────────────────────────────────
assert.equal(durationOutcomeHe({ actualMinutes: 75, bookedMinutes: 60, driftMinutes: 15 }), 'הטיפול ארך 75 דק׳ — 15 דק׳ יותר מהמתוכנן (60 דק׳)');
assert.equal(durationOutcomeHe({ actualMinutes: 45, bookedMinutes: 60, driftMinutes: -15 }), 'הטיפול ארך 45 דק׳ — 15 דק׳ פחות מהמתוכנן (60 דק׳)');
assert.equal(durationOutcomeHe({ actualMinutes: 61, bookedMinutes: 60, driftMinutes: 1 }), 'הטיפול ארך 61 דק׳ — כמעט בדיוק כמו שתוכנן', 'under the negligible threshold');
assert.equal(durationOutcomeHe({ actualMinutes: 55, bookedMinutes: 60, driftMinutes: -5 }), 'הטיפול ארך 55 דק׳ — 5 דק׳ פחות מהמתוכנן (60 דק׳)', 'exactly at the threshold counts as worth saying');

console.log('duration drift: ok');
