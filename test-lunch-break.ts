import assert from 'node:assert/strict';
import { resolveLunch, overlapsLunch, lunchBusy } from './lib/lunchBreak.js';

assert.equal(resolveLunch(null), null);
assert.equal(resolveLunch({}), null);
assert.equal(resolveLunch({ lunch_break: { on: false, start_minute: 780, minutes: 30 } }), null, 'off is off');
assert.equal(resolveLunch({ lunch_break: { on: true, start_minute: 780, minutes: 5 } }), null, 'too short to be a break');
assert.equal(resolveLunch({ lunch_break: { on: true, start_minute: 2000, minutes: 30 } }), null, 'not a time of day');
assert.equal(resolveLunch({ lunch_break: { on: true, start_minute: 780, minutes: 500 } }), null, 'not a lunch');
const l = resolveLunch({ lunch_break: { on: true, start_minute: 780, minutes: 30 } });
assert.deepEqual(l, { startMinute: 780, minutes: 30 });

// 13:00-13:30. A booking that touches it is refused; one that ends at 13:00 or starts at 13:30 is fine.
assert.equal(overlapsLunch(l, 12 * 60, 60), false, 'ends exactly when the break starts');
assert.equal(overlapsLunch(l, 12 * 60 + 30, 60), true, 'runs into it');
assert.equal(overlapsLunch(l, 13 * 60, 30), true, 'inside it');
assert.equal(overlapsLunch(l, 13 * 60 + 30, 45), false, 'starts when it ends');
assert.equal(overlapsLunch(l, 12 * 60, 180), true, 'spans it');
assert.equal(overlapsLunch(null, 780, 60), false, 'no lunch, no clash');

const busy = lunchBusy(l, new Date(2026, 8, 29), 3);
assert.equal(busy.length, 4);
assert.deepEqual(busy[0], { date: '2026-09-29', start_minute: 780, hour: 13, duration: 30 });
assert.equal(busy[3].date, '2026-10-02', 'rolls over the month');
assert.deepEqual(lunchBusy(null), []);
console.log('lunch break: ok');
