// test-appt-ended.ts — an appointment that is over stops reading "ממתינה לאישור" in the agenda (lib/apptStatus.js apptEnded).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { apptEnded, apptStatus } from './lib/apptStatus.js';

const T = '2026-11-27';
// Another day decides alone.
assert.equal(apptEnded({ date: '2026-11-26', start_minute: 1380, duration: 60 }, T, 0), true);
assert.equal(apptEnded({ date: '2026-11-28', start_minute: 0, duration: 30 }, T, 1439), false);
// Today: over only once its END has passed, not its start.
assert.equal(apptEnded({ date: T, start_minute: 780, duration: 60 }, T, 800), false);
assert.equal(apptEnded({ date: T, start_minute: 780, duration: 60 }, T, 840), true);
// The legacy column: an hour with no start_minute.
assert.equal(apptEnded({ date: T, hour: 9, duration: 45 }, T, 9 * 60 + 44), false);
assert.equal(apptEnded({ date: T, hour: 9, duration: 45 }, T, 9 * 60 + 45), true);
// A timestamp-shaped date still compares by its day.
assert.equal(apptEnded({ date: '2026-11-26T00:00:00', start_minute: 600, duration: 60 }, T, 0), true);
// Nothing to go on is "not over": the badge stays rather than vanish on bad data.
assert.equal(apptEnded(null, T, 600), false);
assert.equal(apptEnded({ date: T }, T, 600), false);
assert.equal(apptEnded({ date: T, start_minute: 600, duration: 60 }, T, NaN), false);
// The words themselves did not change.
assert.equal(apptStatus({ confirmation_status: 'pending' }).label, 'ממתינה לאישור');

// The agenda card drops the pending badge for an appointment that is over, and only the pending one.
const cal = fs.readFileSync('app/screens/CalendarScreen.jsx', 'utf8');
assert.match(cal, /s0\.key==="pending"&&apptEnded\(appt,today,/);
console.log('test-appt-ended: ok');
