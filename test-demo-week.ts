// The demo clinic's week (lib/demoWeek.ts): the pattern is anchored to the RESET DAY, whatever weekday that is.
//
// The test the seed is built for: "that's my Tuesday", not "that's a demo" - and the same on a Wednesday. The busy day is today (6 rows:
// a gap, a cancellation); when today is a Saturday it is Sunday and Saturday stays empty. Checked for 90 different reset days, because
// a seed that is right on a Tuesday and dead on a Friday would only show up on the day someone records a video.
import assert from 'node:assert/strict';
import { buildDemoWeek, fullName, israelDate, israelToUtcIso } from './lib/demoWeek.ts';

// the REAL durations of the cosmetics demo's eight services (75, 60, 45, 60, 60, 75, 60, 30): a Friday is only five hours long
const SERVICES = [
  { name: 'ניקוי פנים עמוק', price: 300, duration: 75 }, { name: 'טיפול פנים קלאסי', price: 260, duration: 60 },
  { name: 'פילינג כימי', price: 380, duration: 45 }, { name: 'הידרפייסיאל', price: 500, duration: 60 },
  { name: 'מיקרונידלינג', price: 650, duration: 60 }, { name: 'טיפול אנטי-אייג׳ינג', price: 480, duration: 75 },
  { name: 'הסרת שיער בלייזר', price: 220, duration: 60 }, { name: 'עיסוי פנים', price: 180, duration: 30 },
];
const wd = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();
const addDays = (date: string, n: number) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// names: full, Hebrew, distinct
const names = Array.from({ length: 20 }, (_, i) => fullName(i));
assert.equal(new Set(names).size, 20, 'twenty distinct full names');
assert.ok(names.every((n) => /^[֐-׿]+ [֐-׿ ]+$/.test(n)), 'Hebrew first and last name, not "דנה כ."');

// time zone: Israel is UTC+3 until the end of October and UTC+2 after it
assert.equal(israelToUtcIso('2026-10-06', 14 * 60 + 30), '2026-10-06T11:30:00.000Z', 'summer time');
assert.equal(israelToUtcIso('2026-11-10', 14 * 60 + 30), '2026-11-10T12:30:00.000Z', 'winter time');

const seenWeekdays = new Set<number>();
let sawNoShow = 0;
for (let k = 0; k < 90; k++) {
  const now = new Date(Date.UTC(2026, 8, 1 + k, 2, 0)); // the nightly reset: 02:00 UTC
  const w = buildDemoWeek(SERVICES, 14, now);
  const where = `now=${now.toISOString().slice(0, 10)} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd(w.today)]})`;
  seenWeekdays.add(wd(w.today));

  const byDay: Record<string, typeof w.appts> = {};
  for (const a of w.appts) (byDay[a.date] ||= []).push(a);
  assert.ok(Object.keys(byDay).every((d) => wd(d) !== 6), `${where}: no Saturday`);

  // the busy day: today, or the next working day when today is a Saturday
  const busyDate = wd(w.today) === 6 ? addDays(w.today, 1) : w.today;
  const busy = (byDay[busyDate] || []).sort((a, b) => a.start_minute - b.start_minute);
  const wantBusy = wd(busyDate) === 5 ? 5 : 6; // a Friday cannot hold six real treatments before 14:00
  assert.equal(busy.length, wantBusy, `${where}: the busy day (${busyDate}) has ${wantBusy} rows, got ${busy.length}`);
  assert.equal(busy.filter((a) => a.status === 'cancelled').length, 1, `${where}: the busy day has a cancellation`);
  const gaps = busy.slice(1).map((a, i) => a.start_minute - (busy[i].start_minute + busy[i].duration));
  assert.ok(Math.max(...gaps) >= (wd(busyDate) === 5 ? 15 : 60), `${where}: the busy day has a gap in it (gaps ${gaps.join(',')})`);
  assert.ok(Math.min(...gaps) >= 0, `${where}: no overlap on the busy day`);
  if (wd(w.today) === 6) assert.ok(!byDay[w.today], `${where}: Saturday stays clear`);
  for (const d of Object.keys(byDay)) if (d !== busyDate) assert.ok(byDay[d].length < wantBusy, `${where}: the busy day is the busiest (${d} has ${byDay[d].length})`);

  // days behind: a realistic mix (3-5); days ahead: lighter but never empty (2-3); every working day in the window has rows
  for (let off = -6; off <= 5; off++) {
    const d = addDays(w.today, off);
    if (wd(d) === 6 || d === busyDate) continue;
    const n = (byDay[d] || []).length;
    assert.ok(n >= 2, `${where}: ${d} is not empty (${n})`);
    if (d < busyDate) assert.ok(n >= 3 && n <= wantBusy - 1, `${where}: ${d} behind the busy day has a realistic mix (${n})`);
    else assert.ok(n <= 3, `${where}: ${d} ahead is lighter (${n})`);
  }

  // times: nothing before 09:00, nothing past closing, no overlaps, not a metronome
  for (const [date, list] of Object.entries(byDay)) {
    const sorted = [...list].sort((a, b) => a.start_minute - b.start_minute);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      assert.ok(a.start_minute >= 9 * 60, `${where} ${date}: nothing before 09:00`);
      assert.ok(a.start_minute + a.duration <= (wd(date) === 5 ? 14 : 19) * 60, `${where} ${date}: nothing past closing (Friday closes at 14:00)`);
      if (i > 0) assert.ok(a.start_minute >= sorted[i - 1].start_minute + sorted[i - 1].duration, `${where} ${date}: no overlap`);
    }
  }
  assert.ok(new Set(w.appts.map((a) => a.start_minute % 60)).size >= 3, `${where}: start times are not all on the hour`);
  assert.ok(new Set(w.appts.map((a) => a.service)).size >= 5, `${where}: a variety of treatments`);
  assert.ok(w.appts.filter((a) => a.status === 'cancelled').length >= 2, `${where}: a cancellation on the busy day and another in the week`);
  sawNoShow += w.appts.some((a) => a.status === 'no_show') ? 1 : 0;
  assert.ok(!w.appts.some((a) => a.status === 'no_show' && a.dayOffset >= 0), `${where}: a no-show is only ever behind us`);

  // revenue: per past day a few hundred to a couple of thousand, never one lump; nothing for a day that has not happened
  const perDay: Record<string, number> = {};
  for (const r of w.receipts) {
    const d = israelDate(new Date(r.createdAtUtc));
    perDay[d] = (perDay[d] || 0) + r.amount;
    assert.ok(d <= w.today, `${where}: no receipt dated in the future (${d})`);
    assert.ok(d === r.apptKey!.split('#')[0], `${where}: a receipt carries the day of its appointment, in Israel time`);
  }
  for (const [d, total] of Object.entries(perDay)) assert.ok(total >= 150 && total <= 2600, `${where} ${d}: a day's revenue is ₪${total}, expected a few hundred to ~two thousand`);
  assert.ok((perDay[w.today] || 0) <= 1500, `${where}: today so far is modest`);
  assert.ok(w.receipts.every((r) => r.service !== 'טיפול'), `${where}: receipts name the real treatment`);
  assert.ok(new Set(w.receipts.map((r) => r.method)).size >= 2, `${where}: more than one payment method`);

  // last month: really last month, no Saturday, enough for a month-over-month view
  const lm = new Date(Date.UTC(+w.today.slice(0, 4), +w.today.slice(5, 7) - 2, 1));
  const prefix = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}`;
  assert.ok(w.lastMonth.length >= 3, `${where}: last month has receipts`);
  assert.ok(w.lastMonth.every((r) => israelDate(new Date(r.createdAtUtc)).startsWith(prefix)), `${where}: last month's receipts are in ${prefix}`);
}
assert.deepEqual([...seenWeekdays].sort(), [0, 1, 2, 3, 4, 5, 6], 'every weekday, Saturday included, was a reset day in the run');
assert.ok(sawNoShow >= 80, `a no-show too (${sawNoShow}/90)`);

console.log('demo week: ok');
