// The rebooking nudge: her own rhythm, never to a booked client, one window per visit.
import assert from 'node:assert/strict';
import { typicalIntervalDays, rebookCandidates, defaultRebookDays, sinceHe } from './lib/reminders/rebook.js';

assert.equal(defaultRebookDays(['nails']), 21);
assert.equal(defaultRebookDays(['cosmetics']), 35);
assert.equal(defaultRebookDays(['cosmetics', 'nails']), 35);
assert.equal(typicalIntervalDays(['2026-01-01', '2026-01-22']), null, 'one gap is not a rhythm');
assert.equal(typicalIntervalDays(['2026-01-01', '2026-01-22', '2026-02-12', '2026-03-05']), 21);
assert.equal(typicalIntervalDays(['2026-01-01', '2026-01-02', '2026-01-23', '2026-02-13']), 21, 'a 1-day gap is ignored, the rest is her rhythm');

const today = '2026-10-19';
const appts = [
  // a: every 21 days, last visit 24 days ago -> due
  ...['2026-08-04', '2026-08-25', '2026-09-15', '2026-09-25'].map((date) => ({ client_id: 'a', tenant_id: 't', date, service: 'לק ג׳ל' })),
  // b: same, but already booked next week -> never
  ...['2026-08-25', '2026-09-15', '2026-10-26'].map((date) => ({ client_id: 'b', tenant_id: 't', date, service: 'לק ג׳ל' })),
  // c: one visit 40 days ago, default 35 (+2 grace) -> due
  { client_id: 'c', tenant_id: 't', date: '2026-09-09', service: 'טיפול פנים' },
  // d: one visit 60 days ago -> past the window, left to win-back
  { client_id: 'd', tenant_id: 't', date: '2026-08-20', service: 'טיפול פנים' },
  // e: cancelled future appointment does not count as booked; last real visit 38 days ago -> due
  { client_id: 'e', tenant_id: 't', date: '2026-09-11', service: 'x' },
  { client_id: 'e', tenant_id: 't', date: '2026-10-30', service: 'x', confirmation_status: 'cancelled' },
];
const due = rebookCandidates({ appointments: appts, today, defaultDaysFor: () => 35 });
const ids = due.map((d) => d.clientId).sort();
assert.deepEqual(ids, ['a', 'c', 'e']);
// a's own rhythm: gaps 21,21,10 -> median 21; 24 days since -> due under her rhythm.
const due2 = rebookCandidates({ appointments: appts.filter((x) => x.client_id === 'a'), today, defaultDaysFor: () => 35 });
assert.equal(due2.length, 1);
assert.equal(due2[0].interval, 21);
assert.equal(due2[0].lastDate, '2026-09-25');

assert.equal(sinceHe(21), '3 שבועות');
assert.equal(sinceHe(14), 'שבועיים');
assert.equal(sinceHe(10), '10 ימים');
console.log('rebook: ok');
