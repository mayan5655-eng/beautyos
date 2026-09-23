// The occasion calendar: Hebrew dates from Intl, windows that open and close.
import assert from 'node:assert/strict';
import { HOLIDAYS, holidayByKey, hebrewDate, nextOccurrence, upcomingHolidays, holidayPrompt } from './lib/design/holidays.ts';

const day = (s: string) => new Date(`${s}T10:00:00+03:00`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

assert.deepEqual(hebrewDate(day('2026-09-12')), { day: 1, month: 'Tishri', year: 5787 }, 'the runtime has the Hebrew calendar');

// Known dates, one per rule: a plain Hebrew date, a leap-year Adar, the Independence Day shift, a Gregorian one.
assert.equal(iso(nextOccurrence(holidayByKey('rosh_hashana')!, day('2026-08-25'))), '2026-09-12');
assert.equal(iso(nextOccurrence(holidayByKey('yom_kippur')!, day('2026-08-25'))), '2026-09-21');
assert.equal(iso(nextOccurrence(holidayByKey('hanukkah')!, day('2026-11-20'))), '2026-12-05');
assert.equal(iso(nextOccurrence(holidayByKey('tu_bishvat')!, day('2027-01-01'))), '2027-01-23');
assert.equal(iso(nextOccurrence(holidayByKey('purim')!, day('2027-03-01'))), '2027-03-23', '5787 is a leap year: Purim is 14 Adar II');
assert.equal(iso(nextOccurrence(holidayByKey('pesach')!, day('2027-04-01'))), '2027-04-22');
assert.equal(iso(nextOccurrence(holidayByKey('yom_haatzmaut')!, day('2027-05-01'))), '2027-05-12', '5 Iyar 5787 is a Wednesday, no shift');
assert.equal(iso(nextOccurrence(holidayByKey('shavuot')!, day('2027-05-20'))), '2027-06-11');
assert.equal(iso(nextOccurrence(holidayByKey('womens_day')!, day('2027-01-10'))), '2027-03-08');
assert.equal(iso(nextOccurrence(holidayByKey('womens_day')!, day('2027-03-09'))), '2028-03-08', 'past this year -> next year');
// The Friday/Saturday rule: 5 Iyar 5788 falls on a Saturday (2028-04-29) -> Thursday 2028-04-27... unless it does not; assert the rule, not the year.
const yh = nextOccurrence(holidayByKey('yom_haatzmaut')!, day('2028-04-01'))!;
assert.ok(!['Fri', 'Sat', 'Mon'].includes(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(yh)), 'never on Fri/Sat/Mon');

// Windows: three weeks before Rosh Hashana it is on the list; six weeks before it is not; the day after it is gone.
const keys = (d: Date) => upcomingHolidays(d).map((u) => u.holiday.key);
assert.ok(keys(day('2026-08-25')).includes('rosh_hashana'));
assert.ok(!keys(day('2026-08-01')).includes('rosh_hashana'));
assert.ok(keys(day('2026-09-12')).includes('rosh_hashana'), 'on the day');
assert.ok(!keys(day('2026-09-15')).includes('rosh_hashana'), 'closed after its span');
assert.ok(keys(day('2026-07-01')).includes('summer'), 'a season stays open for weeks');
assert.equal(upcomingHolidays(day('2026-08-25'))[0].holiday.key, 'rosh_hashana', 'soonest first');

// The card's sentence.
const u = upcomingHolidays(day('2026-08-31')).find((x) => x.holiday.key === 'rosh_hashana')!;
assert.equal(u.daysLeft, 12);
assert.equal(holidayPrompt(u), 'ראש השנה בעוד 12 ימים, תרצי פוסט?');
assert.equal(holidayPrompt({ ...u, daysLeft: 1 }), 'ראש השנה מחר, תרצי פוסט?');
assert.equal(holidayPrompt({ ...u, daysLeft: 0 }), 'ראש השנה עכשיו, תרצי פוסט?');

assert.equal(new Set(HOLIDAYS.map((h) => h.key)).size, HOLIDAYS.length, 'unique keys');
console.log('design holidays: ok');
