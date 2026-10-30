// "קבעי לה שוב": the interval from her own history and the nearest free slot at her usual time.
import assert from 'node:assert/strict';
import { rebookInterval, rebookDefaultDays, proposeNextVisit, freeStartsOn } from './lib/rebookNext.js';

// ── interval ──
assert.equal(rebookDefaultDays(['nails']), 21);
assert.equal(rebookDefaultDays(['cosmetics']), 28);
assert.equal(rebookDefaultDays(undefined), 28);
const gel = ['2026-07-01', '2026-07-22', '2026-08-12', '2026-09-02'].map((date) => ({ date, service: 'לק ג׳ל' }));
assert.deepEqual(rebookInterval({ visits: gel, service: 'לק ג׳ל', businessFields: ['nails'] }), { days: 21, basis: 'service' });
// no history at all -> the default, labelled as one
assert.deepEqual(rebookInterval({ visits: [], service: 'לק ג׳ל', businessFields: ['nails'] }), { days: 21, basis: 'default' });
assert.deepEqual(rebookInterval({ visits: [], service: 'x', businessFields: ['cosmetics', 'nails'] }), { days: 28, basis: 'default' });
// one visit only -> still the default (one visit is not a rhythm)
assert.equal(rebookInterval({ visits: [{ date: '2026-09-01', service: 'a' }], service: 'a' }).basis, 'default');
// her gel rhythm is 3 weeks even when she also had a facial every 5 weeks: this service wins
const mixed = [...gel, { date: '2026-07-10', service: 'פנים' }, { date: '2026-08-14', service: 'פנים' }, { date: '2026-09-18', service: 'פנים' }];
assert.equal(rebookInterval({ visits: mixed, service: 'פנים' }).days, 35);
assert.equal(rebookInterval({ visits: mixed, service: 'לק ג׳ל' }).days, 21);
// a service she never had before falls back to all her visits, not the default
assert.equal(rebookInterval({ visits: gel, service: 'חדש' }).basis, 'client');

// ── slots ──
const WEEK = (d: number) => (d === 6 ? null : d === 5 ? { open: 9, close: 14 } : { open: 9, close: 18 }); // Saturday closed, Friday short
const T = '2026-10-25'; // a Sunday
const base = { today: T, hoursFor: WEEK, busy: [] as any[], lunch: null as any, duration: 60 };

// last visit three weeks ago on a Sunday at 10:00: the interval points at today, but a proposal is always for the future
let r: any = proposeNextVisit({ ...base, afterDate: '2026-10-04', anchorMinute: 600, intervalDays: 21 });
assert.deepEqual([r.date, r.minute, r.sameTime], ['2026-10-26', 600, true], 'never today');
// last visit today (finished appointment): +21 days, same weekday and time
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21 });
assert.deepEqual([r.date, r.minute, r.sameTime], ['2026-11-15', 600, true]);

// closed day: the target lands on Saturday 2026-10-31 -> Sunday 11-01 at the same time
r = proposeNextVisit({ ...base, afterDate: '2026-10-10', anchorMinute: 660, intervalDays: 21 });
assert.equal(r.targetDate, '2026-10-31');
assert.deepEqual([r.date, r.minute, r.sameTime], ['2026-11-01', 660, true]);

// Friday closes at 14:00: a 60-min visit at 13:30 does not fit -> the free start closest to 13:30 that does
r = proposeNextVisit({ ...base, afterDate: '2026-10-16', anchorMinute: 13 * 60 + 30, intervalDays: 21, exactWindowDays: 0 }); // target Fri 11-06
assert.equal(r.date, '2026-11-06');
assert.equal(r.sameTime, false, '13:30 + 60 min runs past the 14:00 close');
assert.equal(r.minute, 13 * 60, '13:00 is the free start closest to 13:30 that fits');

// taken: her usual 10:00 is booked that day -> the same time on the next open day is preferred over another time that day
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21, busy: [{ date: '2026-11-15', start: 570, end: 660 }] });
assert.deepEqual([r.date, r.minute, r.sameTime], ['2026-11-16', 600, true]);
// ...but with no exact-time window, the nearest free start that day is offered and flagged
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21, exactWindowDays: 0, busy: [{ date: '2026-11-15', start: 570, end: 660 }] });
assert.deepEqual([r.date, r.sameTime], ['2026-11-15', false]);
assert.ok(r.minute === 660 || r.minute === 510, 'closest free start to 10:00 around a 09:30-11:00 booking');
// back-to-back is not an overlap
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21, busy: [{ date: '2026-11-15', start: 540, end: 600 }, { date: '2026-11-15', start: 660, end: 720 }] });
assert.deepEqual([r.date, r.minute], ['2026-11-15', 600]);

// lunch break 13:00-13:30: a 12:30 visit would run into it
const lunch = { startMinute: 13 * 60, minutes: 30 };
r = proposeNextVisit({ ...base, lunch, afterDate: '2026-10-25', anchorMinute: 12 * 60 + 30, intervalDays: 21, exactWindowDays: 0 });
assert.equal(r.date, '2026-11-15');
assert.equal(r.sameTime, false);
assert.ok(!(r.minute < 13 * 60 + 30 && r.minute + 60 > 13 * 60), 'the proposal never touches the break');
// a time clear of the break is untouched
r = proposeNextVisit({ ...base, lunch, afterDate: '2026-10-25', anchorMinute: 14 * 60, intervalDays: 21 });
assert.deepEqual([r.date, r.minute, r.sameTime], ['2026-11-15', 840, true]);
// the exact time that hits the break is not offered on any day of the window either
r = proposeNextVisit({ ...base, lunch, afterDate: '2026-10-25', anchorMinute: 13 * 60, intervalDays: 21 });
assert.equal(r.sameTime, false);
assert.ok(!(r.minute < 13 * 60 + 30 && r.minute + 60 > 13 * 60));

// a fully booked week: every open day of the target week is full -> the first free day after it
const fullWeek: any[] = [];
for (const d of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) fullWeek.push({ date: d, start: 0, end: 1440 });
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21, busy: fullWeek });
assert.equal(r.date, '2026-11-22');
assert.deepEqual([r.minute, r.sameTime], [600, true]);

// a fully booked horizon -> nothing, not a made-up slot
const allFull: any[] = [];
for (let i = 0; i < 80; i++) allFull.push({ date: new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10), start: 0, end: 1440 });
assert.equal(proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21, busy: allFull }), null);

// a business closed every day -> nothing
assert.equal(proposeNextVisit({ ...base, hoursFor: () => null, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 21 }), null);

// an empty tenant: no anchor, no appointments -> the first slot of the target day, never undefined
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: null, intervalDays: 28 });
assert.deepEqual([r.date, r.minute], ['2026-11-22', 540]);

// an anchor off the half-hour grid is kept when it is free
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 14 * 60 + 15, intervalDays: 21 });
assert.equal(r.minute, 14 * 60 + 15);
// a bad / missing last-visit date degrades to "from today"
r = proposeNextVisit({ ...base, afterDate: undefined as any, anchorMinute: 600, intervalDays: 21 });
assert.equal(r.date, '2026-11-15');
// weekdays come from the calendar date, not the machine: 2026-11-01 is a Sunday
r = proposeNextVisit({ ...base, afterDate: '2026-10-25', anchorMinute: 600, intervalDays: 7 });
assert.equal(r.date, '2026-11-01');

// the picker's list agrees with the proposal: closed day empty, booked and lunch starts removed
assert.deepEqual(freeStartsOn({ date: '2026-10-31', duration: 60, hoursFor: WEEK, busy: [] }), [], 'Saturday is closed');
const fri = freeStartsOn({ date: '2026-11-06', duration: 60, hoursFor: WEEK, busy: [{ date: '2026-11-06', start: 600, end: 660 }], lunch });
assert.deepEqual(fri, [540, 660, 690, 720], 'Friday 9-14: the 10:00 booking, the 13:00 break and the 14:00 close remove the rest');
assert.deepEqual(freeStartsOn({ date: 'bad', duration: 60, hoursFor: WEEK, busy: [] }), []);

console.log('rebook-next: ok');
