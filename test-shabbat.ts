// test-shabbat.ts
//
// Proves lib/shabbat.js and the Saturday-night wiring: nothing goes to clients on Saturday before 20:00 Israel time, exactly one
// of the two Saturday-night cron entries (17:00 and 18:00 UTC) runs in summer AND in winter, Friday is unchanged, and the owner's
// evening summary now goes out Saturday night. Plain node, a fixed clock everywhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { israelClock, isShabbatHold, clientCronSlot } from './lib/shabbat.js';
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

// The Saturday-night entries "0 17,18 * * 6": exactly one runs, in both seasons.
const satNight = (date: string) => [17, 18].map((h) => clientCronSlot(at(`${date}T${h}:00:00Z`)).run);
assert.deepEqual(satNight('2026-10-24'), [true, false], 'summer: the 17Z run (20:00) goes, the 18Z run (21:00) is skipped');
assert.deepEqual(satNight('2026-10-31'), [false, true], 'winter: the 17Z run (19:00) is held, the 18Z run (20:00) goes');
assert.deepEqual(satNight('2027-01-16'), [false, true], 'deep winter too');
assert.deepEqual(satNight('2027-07-17'), [true, false], 'deep summer too');
assert.equal(clientCronSlot(at('2026-10-24T18:00:00Z')).reason, 'saturday-night-done');
// Vercel jitter: a run a few minutes late is still in the 20:00 hour.
assert.equal(clientCronSlot(at('2026-10-31T18:07:00Z')).run, true, 'a late run still counts');

// A manual retry (?only=) after 21:00 Saturday is allowed (it has its own dedupe), but never during Shabbat.
assert.equal(clientCronSlot(at('2026-10-24T19:00:00Z'), { retry: true }).run, true, 'retry Saturday 22:00');
assert.equal(clientCronSlot(at('2026-10-24T10:00:00Z'), { retry: true }).run, false, 'retry Saturday morning: still held');

assert.equal(isShabbatHold(at('2026-10-24T09:00:00Z')), true);
assert.equal(isShabbatHold(at('2026-10-24T17:00:00Z')), false);
assert.equal(isShabbatHold(at('2026-10-23T14:00:00Z')), false, 'Friday afternoon is not held');

// The owner's evening summary: daily at 17Z plus "0 18 * * 6". Friday stays quiet; Saturday sends exactly once.
assert.equal(isQuietEvening(at('2026-10-23T17:00:00Z')), true, 'Friday evening: quiet');
assert.deepEqual([17, 18].map((h) => !isQuietEvening(at(`2026-10-24T${h}:00:00Z`))), [true, false], 'Saturday summer: once, 20:00');
assert.deepEqual([17, 18].map((h) => !isQuietEvening(at(`2026-10-31T${h}:00:00Z`))), [false, true], 'Saturday winter: once, 20:00');
assert.equal(isQuietEvening(at('2026-10-25T17:00:00Z')), false, 'Sunday evening: sends');

// Wiring: the crons exist and the client routes ask the slot before sending.
const rd = (p: string) => readFileSync(p, 'utf8');
const crons = JSON.parse(rd('vercel.json')).crons as Array<{ path: string; schedule: string }>;
const has = (path: string, schedule: string) => crons.some((c) => c.path === path && c.schedule === schedule);
assert.ok(has('/api/send-reminders', '0 14 * * *') && has('/api/send-reminders', '0 17,18 * * 6'), 'reminders: daily + Saturday night');
assert.ok(has('/api/send-smart-reminders', '0 14 * * *') && has('/api/send-smart-reminders', '0 17,18 * * 6'), 'smart reminders: daily + Saturday night');
assert.ok(has('/api/send-owner-evening', '0 17 * * *') && has('/api/send-owner-evening', '0 18 * * 6'), 'evening summary: daily + Saturday 18Z');
for (const p of ['app/api/send-reminders/route.js', 'app/api/send-smart-reminders/route.js']) {
  const src = rd(p);
  const gate = src.indexOf('clientCronSlot(');
  assert.ok(gate > 0, `${p} asks the Shabbat slot`);
  assert.ok(gate < src.indexOf('run' + (p.includes('smart') ? 'SmartReminders({' : 'DailyReminders({')), `${p} asks before it sends`);
}

console.log('shabbat: all checks passed');
