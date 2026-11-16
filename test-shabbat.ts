// test-shabbat.ts
//
// Proves lib/shabbat.js and the Saturday-night wiring: nothing goes to clients on Saturday before Shabbat is out (sunset in Tel Aviv
// + 45 minutes, since the 2026-11-16 audit: a fixed 20:00 went out during Shabbat in summer), exactly one
// of the two Saturday-night cron entries (17:00 and 18:00 UTC) runs in summer AND in winter, the first one after it is out, Friday is unchanged, and the owner's
// evening summary now goes out Saturday night. Plain node, a fixed clock everywhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { israelClock, isShabbatHold, clientCronSlot, sunsetOn, restEndsAt } from './lib/shabbat.js';
import { isQuietEvening } from './lib/eveningSummary.js';

const at = (iso: string) => new Date(iso);

// Israel clock: summer (UTC+3) and winter (UTC+2). 2026 DST ends Sunday 25 October.
assert.deepEqual(israelClock(at('2026-10-24T17:00:00Z')), { weekday: 6, hour: 20 }, 'Sat 24 Oct (summer time): 17Z = 20:00');
assert.deepEqual(israelClock(at('2026-10-31T18:00:00Z')), { weekday: 6, hour: 20 }, 'Sat 31 Oct (winter time): 18Z = 20:00');
assert.deepEqual(israelClock(at('2026-10-24T21:30:00Z')), { weekday: 0, hour: 0 }, 'midnight reads 0, not 24');

// The daily 14:00 UTC run.
const daily = (iso: string) => clientCronSlot(at(iso));
assert.equal(daily('2026-10-24T14:00:00Z').run, false, 'Saturday 17:00 (summer): held');
assert.equal(daily('2026-10-24T14:00:00Z').reason, 'shabbat');
assert.equal(daily('2026-10-31T14:00:00Z').run, false, 'Saturday 16:00 (winter): held');
assert.equal(daily('2026-10-23T14:00:00Z').run, true, 'Friday: unchanged, goes out before Shabbat');
assert.equal(daily('2026-10-25T14:00:00Z').run, true, 'Sunday');
assert.equal(daily('2026-10-22T14:00:00Z').run, true, 'Thursday');

// When Shabbat is out: sunset in Tel Aviv (checked against published times, to the minute) + 45 minutes.
const il = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
assert.equal(il(sunsetOn('2026-06-20')), '19:49', 'Tel Aviv sunset, June');
assert.equal(il(sunsetOn('2026-12-19')), '16:39', 'Tel Aviv sunset, December');
assert.equal(il(restEndsAt(at('2027-07-17T12:00:00Z'))), '20:32', 'high summer: out at 20:32, after the old fixed 20:00');

// The Saturday-night entries "0 17,18 * * 6": exactly one runs, the first one after Shabbat is out.
const satNight = (date: string) => [17, 18].map((h) => clientCronSlot(at(`${date}T${h}:00:00Z`)).run);
assert.deepEqual(satNight('2026-10-24'), [true, false], 'end of summer time: out 18:44, the 17Z run (20:00) goes');
assert.deepEqual(satNight('2026-10-31'), [true, false], 'winter: out 17:37, the 17Z run (19:00) goes');
assert.deepEqual(satNight('2027-01-16'), [true, false], 'deep winter too');
assert.deepEqual(satNight('2027-07-17'), [false, true], 'high summer: 20:00 is still Shabbat, the 18Z run (21:00) goes');
assert.equal(clientCronSlot(at('2027-07-17T17:00:00Z')).reason, 'shabbat', 'never during Shabbat, whatever the season');
assert.equal(clientCronSlot(at('2026-10-24T18:00:00Z')).reason, 'saturday-night-done');
// Vercel jitter: a run a few minutes late is still its own slot.
assert.equal(clientCronSlot(at('2026-10-31T17:07:00Z')).run, true, 'a late run still counts');

// A manual retry (?only=) after 21:00 Saturday is allowed (it has its own dedupe), but never during Shabbat.
assert.equal(clientCronSlot(at('2026-10-24T19:00:00Z'), { retry: true }).run, true, 'retry Saturday 22:00');
assert.equal(clientCronSlot(at('2026-10-24T10:00:00Z'), { retry: true }).run, false, 'retry Saturday morning: still held');

assert.equal(isShabbatHold(at('2026-10-24T09:00:00Z')), true);
assert.equal(isShabbatHold(at('2026-10-24T17:00:00Z')), false);
assert.equal(isShabbatHold(at('2026-10-23T14:00:00Z')), false, 'Friday afternoon is not held');

// The owner's evening summary: daily at 17Z plus "0 18 * * 6". Friday stays quiet; Saturday sends exactly once.
assert.equal(isQuietEvening(at('2026-10-23T17:00:00Z')), true, 'Friday evening: quiet');
assert.deepEqual([17, 18].map((h) => !isQuietEvening(at(`2026-10-24T${h}:00:00Z`))), [true, false], 'Saturday, end of summer time: once, 20:00');
assert.deepEqual([17, 18].map((h) => !isQuietEvening(at(`2026-10-31T${h}:00:00Z`))), [true, false], 'Saturday winter: once, 19:00');
assert.deepEqual([17, 18].map((h) => !isQuietEvening(at(`2027-07-17T${h}:00:00Z`))), [false, true], 'Saturday high summer: once, 21:00');
assert.equal(isQuietEvening(at('2026-10-25T17:00:00Z')), false, 'Sunday evening: sends');

// Wiring: the crons exist and the client routes ask the slot before sending.
const rd = (p: string) => readFileSync(p, 'utf8');
const crons = JSON.parse(rd('vercel.json')).crons as Array<{ path: string; schedule: string }>;
const has = (path: string, schedule: string) => crons.some((c) => c.path === path && c.schedule === schedule);
// The reminder runs: early (an eve), regular, and a night entry every day (yom tov ends on any weekday); reminderCronSlot picks one.
for (const p of ['/api/send-reminders', '/api/send-smart-reminders']) {
  assert.ok(has(p, '0 10 * * *') && has(p, '0 14 * * *') && has(p, '0 17,18 * * *'), `${p}: early, regular and night entries`);
}
assert.ok(has('/api/send-owner-evening', '0 17 * * *') && has('/api/send-owner-evening', '0 18 * * 6'), 'evening summary: daily + Saturday 18Z');
for (const p of ['app/api/send-reminders/route.js', 'app/api/send-smart-reminders/route.js']) {
  const src = rd(p);
  const gate = src.indexOf('reminderCronSlot(');
  assert.match(src, /isYomTov \}\)|isYomTov\s*\}\)/, `${p} passes the yom tov calendar`);
  assert.ok(gate > 0, `${p} asks the Shabbat slot`);
  assert.ok(gate < src.indexOf('run' + (p.includes('smart') ? 'SmartReminders({' : 'DailyReminders({')), `${p} asks before it sends`);
}

// reminderCronSlot (2026-11-02): eves early, rest days held to the night they end, ordinary days at the regular run only.
{
  const { reminderCronSlot } = await import('./lib/shabbat.js');
  const run = (iso: string, yt: string[] = [], retry = false) => reminderCronSlot(at(iso), { retry, isYomTov: (d: string) => yt.includes(d) }).run;
  assert.deepEqual(['10', '14', '17', '18'].map((h) => run(`2026-12-04T${h}:00:00Z`)), [true, false, false, false], 'winter Friday: only the early run (before Shabbat)');
  assert.deepEqual(['10', '14', '17', '18'].map((h) => run(`2026-12-05T${h}:00:00Z`)), [false, false, true, false], 'winter Saturday: only the 19:00 run, once Shabbat is out');
  assert.deepEqual(['10', '14', '17', '18'].map((h) => run(`2027-06-05T${h}:00:00Z`)), [false, false, false, true], 'summer Saturday: only the 21:00 run (out at 20:28)');
  assert.deepEqual(['10', '14', '17', '18'].map((h) => run(`2026-12-08T${h}:00:00Z`)), [false, true, false, false], 'an ordinary Tuesday: the regular run only');
  const pesach = ['2027-04-22'];
  assert.deepEqual(['10', '14'].map((h) => run(`2027-04-21T${h}:00:00Z`, pesach)), [true, false], 'erev Pesach: early, before the holiday comes in');
  assert.deepEqual(['10', '14', '17', '18'].map((h) => run(`2027-04-22T${h}:00:00Z`, pesach)), [false, false, true, false], 'Pesach: held until it is out (19:59), the 20:00 run');
  const rh = ['2027-10-02', '2027-10-03'];
  assert.equal(run('2027-10-02T17:00:00Z', rh), false, 'Rosh Hashana day 1 night: tomorrow is still yom tov, held');
  assert.equal(run('2027-10-03T17:00:00Z', rh), true, 'day 2 night: the rest days end, it runs');
  assert.equal(run('2027-05-28T17:00:00Z', ['2027-05-28']), false, 'a yom tov on Friday: held through Shabbat');
  assert.equal(run('2026-12-05T14:00:00Z', [], true), false, 'a manual retry is still held on Shabbat');
  assert.equal(run('2026-12-08T08:00:00Z', [], true), true, 'a manual retry on an ordinary day runs at any hour');
}

console.log('shabbat: all checks passed');
