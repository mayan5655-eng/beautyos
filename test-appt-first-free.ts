// Which time the "new appointment" sheet opens on (lib/apptFirstFree.js).
//
// 2026-10-06: it opened on the hour she opens. On a busy day that is taken, so the first thing she saw on a sheet she had just
// opened was a red "השעה תפוסה" and a disabled save button. The rule: keep the requested time if free; else the first free
// time at or after it inside her hours; else the first free time inside her hours; else any free time in the margin; else
// leave it (a fully booked day still shows the honest red state).
import assert from 'node:assert/strict';
import { firstFreeStart } from './lib/apptFirstFree.js';

const h = (hh: number, mm = 0) => hh * 60 + mm;
const range = (from: number, to: number, step = 30) => { const o: number[] = []; for (let m = from; m <= to; m += step) o.push(m); return o; };
// her day is 09:00-19:00; the sheet offers 07:00-21:00 (two-hour margin each side); a 60-minute treatment
const DUR = 60;
const options = range(h(7), h(21) - DUR);                         // start times that fit
const outside = (m: number) => m < h(9) || m + DUR > h(19);
const call = (requested: number, busy: Array<[number, number]>, over: Partial<{ duration: number; options: number[] }> = {}) =>
  firstFreeStart({ options: over.options ?? options, requested, duration: over.duration ?? DUR, busy, outside });

// a free day: the requested time is kept
assert.equal(call(h(9), []), h(9));
assert.equal(call(h(14, 30), []), h(14, 30), 'a free requested time is never moved, even if it is not the first free one');

// 09:00 is taken: the next free time at or after it
assert.equal(call(h(9), [[h(9), h(10)]]), h(10));
// a busy morning: first free after the last booking
assert.equal(call(h(9), [[h(9), h(12)], [h(12), h(15, 30)]]), h(15, 30));
// treatment length matters: a 60-minute slot at 10:30 would run into a 11:00 booking
assert.equal(call(h(9), [[h(9), h(10)], [h(11), h(12)]]), h(10), '10:00-11:00 is free and fits before the 11:00 booking');
assert.equal(call(h(9), [[h(9), h(10)], [h(10, 30), h(12)]]), h(12), 'a 30-minute hole does not fit a 60-minute treatment');

// she is booked from the requested time to the end of her day: an earlier free time inside her hours beats the margin
assert.equal(call(h(14), [[h(14), h(19)]]), h(9), 'nothing free after 14:00 in her hours: the first free time of the day');

// her whole working day is taken: the margin (outside hours) is offered rather than a red default
assert.equal(call(h(9), [[h(9), h(19)]]), h(7), 'all in-hours slots taken: the first free time in the margin');

// the whole offered range is taken: nothing to move to, the requested time stays and the sheet says so honestly
assert.equal(call(h(9), [[h(0), h(24)]]), h(9));

// requested time not among the options (stale hour): falls to the first in-hours option, then past anything taken
assert.equal(call(h(3), []), h(9), 'a requested 03:00 is not offered: the first time inside her hours');
assert.equal(call(h(3), [[h(9), h(11)]]), h(11));

// no options (a closed day): the request is returned untouched, no NaN
assert.equal(call(h(9), [], { options: [] }), h(9));

// a taken slot is judged with the duration: a longer treatment moves the choice
assert.equal(call(h(9), [[h(10), h(11)]], { duration: 90, options: range(h(7), h(21) - 90) }), h(11), '09:00 + 90 min overlaps the 10:00 booking');
assert.equal(call(h(9), [[h(10), h(11)]], { duration: 30, options: range(h(7), h(21) - 30) }), h(9), '09:00 + 30 min ends at 09:30: free');

console.log('appointment first-free time: ok');
