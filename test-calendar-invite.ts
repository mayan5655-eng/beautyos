// Add-to-calendar after booking: the hour must be Israel wall-clock on both sides of DST, and the file must be valid ICS.
import assert from 'node:assert/strict';
import { israelWallToUtc, buildIcs, googleCalendarUrl } from './lib/calendarInvite.ts';

// Winter (UTC+2): 10:00 Israel = 08:00Z.
assert.equal(israelWallToUtc('2026-12-15', 600).toISOString(), '2026-12-15T08:00:00.000Z');
// Summer (UTC+3): 10:00 Israel = 07:00Z.
assert.equal(israelWallToUtc('2026-07-15', 600).toISOString(), '2026-07-15T07:00:00.000Z');
// The day after Israel leaves summer time (last Sunday of October 2026 is the 25th).
assert.equal(israelWallToUtc('2026-10-26', 9 * 60 + 30).toISOString(), '2026-10-26T07:30:00.000Z');
assert.equal(israelWallToUtc('2026-10-23', 9 * 60 + 30).toISOString(), '2026-10-23T06:30:00.000Z');

const invite = { date: '2026-12-15', startMinute: 600, duration: 90, title: 'לק ג׳ל · סטודיו רונית', location: 'הרצל 1, תל אביב', details: 'לשינוי: https://wa.me/972500000000' };
const ics = buildIcs(invite, new Date('2026-10-19T00:00:00Z'));
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
assert.ok(ics.includes('DTSTART:20261215T080000Z'));
assert.ok(ics.includes('DTEND:20261215T093000Z'));
assert.ok(ics.includes('LOCATION:הרצל 1\\, תל אביב'), 'commas are escaped');
assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);

const g = new URL(googleCalendarUrl(invite));
assert.equal(g.hostname, 'calendar.google.com');
assert.equal(g.searchParams.get('dates'), '20261215T080000Z/20261215T093000Z');
assert.equal(g.searchParams.get('text'), invite.title);

console.log('calendar invite: ok');
