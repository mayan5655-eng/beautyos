// The demo clinic's week (lib/demoWeek.ts): does it look like a real one, whatever day it is reset on?
//
// The test the seed is built for: "that's my Tuesday", not "that's a demo". Checked for 90 different "today" dates, because a
// seed that is right on a Tuesday and wrong on a Friday would only show up on the day someone records a video.
import assert from 'node:assert/strict';
import { buildDemoWeek, fullName, israelDate, israelToUtcIso } from './lib/demoWeek.ts';

const SERVICES = [
  { name: 'ניקוי פנים עמוק', price: 300, duration: 75 }, { name: 'טיפול פנים קלאסי', price: 260, duration: 60 },
  { name: 'פילינג כימי', price: 380, duration: 45 }, { name: 'הידרפייסיאל', price: 500, duration: 60 },
  { name: 'מיקרונידלינג', price: 650, duration: 60 }, { name: 'טיפול אנטי-אייג׳ינג', price: 480, duration: 75 },
  { name: 'הסרת שיער בלייזר', price: 220, duration: 30 }, { name: 'עיסוי פנים', price: 180, duration: 30 },
];
const wd = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();

// names: full, Hebrew, distinct
const names = Array.from({ length: 20 }, (_, i) => fullName(i));
assert.equal(new Set(names).size, 20, 'twenty distinct full names');
assert.ok(names.every((n) => /^[֐-׿]+ [֐-׿ ]+$/.test(n)), 'Hebrew first and last name, not "דנה כ."');

// time zone: Israel is UTC+3 until the end of October and UTC+2 after it
assert.equal(israelToUtcIso('2026-10-06', 14 * 60 + 30), '2026-10-06T11:30:00.000Z', 'summer time');
assert.equal(israelToUtcIso('2026-11-10', 14 * 60 + 30), '2026-11-10T12:30:00.000Z', 'winter time');

let sawCancelled = 0, sawNoShow = 0, sawGap = 0;
for (let k = 0; k < 90; k++) {
  const now = new Date(Date.UTC(2026, 8, 1 + k, 2, 0)); // the nightly reset: 02:00 UTC
  const w = buildDemoWeek(SERVICES, 14, now);
  const where = `now=${now.toISOString().slice(0, 10)}`;

  // days: never Saturday; some busy, some quiet
  const byDay: Record<string, typeof w.appts> = {};
  for (const a of w.appts) (byDay[a.date] ||= []).push(a);
  assert.ok(Object.keys(byDay).every((d) => wd(d) !== 6), `${where}: no Saturday`);
  const counts = Object.values(byDay).map((v) => v.length);
  assert.ok(Math.max(...counts) - Math.min(...counts) >= 2, `${where}: busy and quiet days (counts ${counts.join(',')})`);

  for (const [date, list] of Object.entries(byDay)) {
    const sorted = [...list].sort((a, b) => a.start_minute - b.start_minute);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      assert.ok(a.start_minute >= 9 * 60, `${where} ${date}: nothing before 09:00`);
      assert.ok(a.start_minute + a.duration <= (wd(date) === 5 ? 14 : 19) * 60, `${where} ${date}: nothing past closing (Friday closes at 14:00)`);
      if (i > 0) {
        const prevEnd = sorted[i - 1].start_minute + sorted[i - 1].duration;
        assert.ok(a.start_minute >= prevEnd, `${where} ${date}: no overlap`);
        if (a.start_minute - prevEnd >= 60) sawGap++;
      }
    }
    // not a metronome: more than one distinct start-minute pattern across the week
  }
  const startMinutes = new Set(w.appts.map((a) => a.start_minute % 60));
  assert.ok(startMinutes.size >= 3, `${where}: start times are not all on the hour (${[...startMinutes].join(',')})`);
  assert.ok(new Set(w.appts.map((a) => a.service)).size >= 5, `${where}: a variety of treatments`);
  sawCancelled += w.appts.some((a) => a.status === 'cancelled') ? 1 : 0;
  sawNoShow += w.appts.some((a) => a.status === 'no_show') ? 1 : 0;

  // revenue: per past day a few hundred to a couple of thousand, never one lump; nothing for a day that has not happened
  const perDay: Record<string, number> = {};
  for (const r of w.receipts) {
    const d = israelDate(new Date(r.createdAtUtc));
    perDay[d] = (perDay[d] || 0) + r.amount;
    assert.ok(d <= w.today, `${where}: no receipt dated in the future (${d})`);
    assert.ok(d === r.apptKey!.split('#')[0], `${where}: a receipt carries the day of its appointment, in Israel time`);
  }
  for (const [d, total] of Object.entries(perDay)) {
    assert.ok(total >= 150 && total <= 2600, `${where} ${d}: a day's revenue is ₪${total}, expected a few hundred to ~two thousand`);
  }
  assert.ok((perDay[w.today] || 0) <= 1500, `${where}: today so far is modest`);
  assert.ok(w.receipts.every((r) => r.service !== 'טיפול'), `${where}: receipts name the real treatment`);
  assert.ok(new Set(w.receipts.map((r) => r.method)).size >= 2, `${where}: more than one payment method`);

  // last month: really last month, no Saturday
  const lm = new Date(Date.UTC(+w.today.slice(0, 4), +w.today.slice(5, 7) - 2, 1));
  const prefix = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}`;
  assert.ok(w.lastMonth.length >= 3, `${where}: last month has receipts`);
  assert.ok(w.lastMonth.every((r) => israelDate(new Date(r.createdAtUtc)).startsWith(prefix)), `${where}: last month's receipts are in ${prefix}`);
}
assert.ok(sawCancelled >= 85, `a cancellation is in nearly every week (${sawCancelled}/90)`);
assert.ok(sawNoShow >= 80, `a no-show too (${sawNoShow}/90)`);
assert.ok(sawGap >= 90, 'and real gaps in the day');

console.log('demo week: ok');
