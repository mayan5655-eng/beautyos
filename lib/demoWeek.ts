// lib/demoWeek.ts
//
// What a demo clinic's week looks like, as plain data (used by lib/demoSeed.ts, tested without a database).
//
// The test it is built for: she looks at it and thinks "that's my Tuesday", not "that's a demo". So: full Hebrew names, a
// range of real treatments at their real prices, busy days and quiet days (a busy Tuesday, a short Friday, no Saturday), start
// times that are not a metronome (09:00, 10:15, 11:45...), a gap in the day, a cancellation, a no-show, and receipts dated on
// the day each treatment was paid, so a day's revenue is a few hundred to a couple of thousand shekels, not one lump at reset time.
//
// Deterministic (no Math.random): the same inputs give the same week, so the nightly reset is predictable and testable.

export type WeekService = { name: string; price: number; duration: number };
export type WeekAppt = {
  date: string; start_minute: number; duration: number; clientIndex: number; service: string; price: number; serviceIndex: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'no_show'; dayOffset: number;
};
export type WeekReceipt = { clientIndex: number | null; clientName: string; service: string; amount: number; method: string; createdAtUtc: string; apptKey: string | null };

const FIRST = ['מאיה', 'נועה', 'שירה', 'טליה', 'רוני', 'יעל', 'ליה', 'אור', 'דנה', 'עדי', 'מיכל', 'הילה', 'שני', 'גלית', 'נטע', 'קרן', 'תמר', 'רותם', 'אביגיל', 'מורן'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'אזולאי', 'חדד', 'גבאי', 'שמעון', 'אוחנה', 'סבג', 'מלכה', 'אדרי', 'חיים', 'בן דוד', 'אשכנזי', 'פרידמן', 'רוזנברג'];
/** A full name, unique for the first 20 indexes (first and last advance at different steps). */
export function fullName(i: number): string { return `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`; }

// What a cosmetician writes on her clients' cards: a note, an allergy, a medical line, a birthday. Warm, short, Hebrew, deterministic.
// (Invented: no real person. Enough cards carry something that the client-card screen never looks empty.)
const NOTES = ['מעדיפה טיפולים בשעות הבוקר', 'עור רגיש, להימנע מחומצות חזקות', 'מגיעה עם הבת שלה לפעמים', 'חוזרת כל ארבעה שבועות, תמיד בזמן', 'אוהבת שקט בזמן הטיפול', 'מתחתנת בעוד חודשיים, רוצה הכנה לאירוע'];
const ALLERGIES = ['רגישות ללנולין', 'אלרגיה לניקל', 'רגישה לבשמים בקרמים'];
const MEDICAL = ['נוטלת תרופה ללחץ דם, בלי חומצות ביום הטיפול', 'בהיריון, לפי אישור הרופא בלבד'];
const BIRTHDAYS = ['1989-11-14', '1992-03-02', '1985-12-27', '1995-07-19'];
export function clientDetails(i: number): { notes?: string; allergies?: string; medical?: string; birthday?: string } {
  const d: { notes?: string; allergies?: string; medical?: string; birthday?: string } = {};
  if (i % 2 === 0 || i % 5 === 0) d.notes = NOTES[i % NOTES.length];
  if (i % 4 === 1) d.allergies = ALLERGIES[Math.floor(i / 4) % ALLERGIES.length];
  if (i % 7 === 3) d.medical = MEDICAL[Math.floor(i / 7) % MEDICAL.length];
  if (i % 3 === 0) d.birthday = BIRTHDAYS[Math.floor(i / 3) % BIRTHDAYS.length];
  return d;
}

const METHODS = ['ביט', 'אשראי', 'מזומן', 'ביט', 'אשראי'];
// The pattern is anchored to the RESET DAY, not to a weekday (a seed that is busy on Tuesdays is a dead clinic on every other day):
//   the busy day (today; the next working day when today is a Saturday) has BUSY_COUNT rows: a gap, a cancellation
//   days behind it keep a realistic mix, in order from yesterday backwards; days ahead are lighter but never empty
//   Saturdays stay empty
const BUSY_COUNT = 6;
// A Friday closes at 14:00 (the product's default hours): five hours. The six shortest real treatments need 315 minutes even with no
// gap, so six rows cannot fit. A Friday busy day gets 5, and the days around it are capped so it is still the busiest day.
const FRIDAY_BUSY_COUNT = 5;
const PAST_COUNTS = [5, 4, 3, 5, 4, 3];
const UPCOMING_COUNTS = [3, 2, 3, 2, 2];
const GAPS = [0, 15, 30, 0, 45, 15, 30, 0, 15]; // minutes between ordinary treatments
const BIG_GAP = 75; // the real gap in the busy day (after the third treatment)

const pad = (n: number) => String(n).padStart(2, '0');

/** Israel's date (YYYY-MM-DD) for a moment, and its UTC offset in minutes at that moment. */
export function israelDate(d: Date): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d); }
function israelOffsetMin(utcMs: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - utcMs) / 60000;
}
/** "2026-10-06" at 14:30 Israel time -> the UTC instant, as an ISO string (the receipts column holds UTC). */
export function israelToUtcIso(date: string, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  return new Date(guess - israelOffsetMin(guess) * 60000).toISOString();
}
const addDays = (date: string, n: number) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();

export function buildDemoWeek(services: WeekService[], clientCount: number, now: Date) {
  const today = israelDate(now);
  const appts: WeekAppt[] = [];
  let cursor = 0; // walks through services and clients so the mix varies

  // The busy day is today; when today is a Saturday (closed) it is the next working day, and Saturday itself stays clear.
  let busyOff = 0;
  while (weekday(addDays(today, busyOff)) === 6) busyOff++;

  // How many rows each working day gets: the busy day BUSY_COUNT, the days behind it a realistic mix (yesterday first), the days
  // ahead lighter but never empty. Saturdays are skipped, and do not use up a slot of the mix.
  const plan: { off: number; date: string; wd: number; count: number }[] = [];
  let behindN = 0, aheadN = 0;
  const busyCount = weekday(addDays(today, busyOff)) === 5 ? FRIDAY_BUSY_COUNT : BUSY_COUNT;
  for (let off = busyOff - 1; off >= -6; off--) { const date = addDays(today, off); if (weekday(date) !== 6) plan.push({ off, date, wd: weekday(date), count: Math.min(PAST_COUNTS[behindN++ % PAST_COUNTS.length], busyCount - 1) }); }
  plan.reverse();
  plan.push({ off: busyOff, date: addDays(today, busyOff), wd: weekday(addDays(today, busyOff)), count: busyCount });
  for (let off = busyOff + 1; off <= 5; off++) { const date = addDays(today, off); if (weekday(date) !== 6) plan.push({ off, date, wd: weekday(date), count: UPCOMING_COUNTS[aheadN++ % UPCOMING_COUNTS.length] }); }

  // one cancellation behind us (the second most recent working day), one ahead (the first upcoming day with 3 or more)
  const pastDays = plan.filter((p) => p.off < busyOff);
  const cancelPast = pastDays.length > 1 ? pastDays[pastDays.length - 2].date : null;
  const cancelAhead = plan.find((p) => p.off > busyOff && p.count >= 3)?.date ?? null;

  for (const day of plan) {
    const { off, date, wd, count } = day;
    const close = (wd === 5 ? 14 : 19) * 60; // Friday closes at 14:00 (tenantTemplate's default hours)
    const busy = off === busyOff;
    const base = 9 * 60 + (busy ? 0 : [0, 15, 0, 30, 0][(cursor + wd) % 5]);
    // the day's treatments in order; if the busy day would run past closing (a Friday), it takes the shortest ones and a small gap
    let picks = Array.from({ length: count }, (_, s) => (cursor * 3 + s * 2 + wd) % services.length);
    const gapAfter = (s: number) => (busy && s === 2 ? BIG_GAP : GAPS[(cursor + s) % GAPS.length]);
    const endOf = (idxs: number[], gap: (s: number) => number) => idxs.reduce((t, i, s) => t + (Number(services[i].duration) || 60) + (s < idxs.length - 1 ? gap(s) : 0), base);
    let gap = gapAfter;
    if (endOf(picks, gap) > close) {
      const byLength = services.map((_, i) => i).sort((a, b) => (Number(services[a].duration) || 60) - (Number(services[b].duration) || 60));
      picks = Array.from({ length: count }, (_, s) => byLength[s % byLength.length]);
      gap = (s) => (busy && s === 2 ? 15 : 0);
    }
    let t = base;
    picks.forEach((svcIdx, s) => {
      const svc = services[svcIdx];
      const dur = Number(svc.duration) || 60;
      if (t + dur > close) return; // never past closing
      let status: WeekAppt['status'] = off <= 0 ? 'confirmed' : (s < 2 ? 'confirmed' : 'pending');
      // texture: a cancellation on the busy day (its slot stays pink in the grid), one behind us, one ahead
      if ((busy && s === 1) || (date === cancelPast && s === 1) || (date === cancelAhead && s === 2)) status = 'cancelled';
      appts.push({ date, start_minute: t, duration: dur, clientIndex: (cursor + s * 5) % clientCount, service: svc.name, price: Number(svc.price) || 0, serviceIndex: svcIdx, status, dayOffset: off });
      t += dur + gap(s);
    });
    cursor += count;
  }

  // a no-show: the last appointment of the most recent working day behind us (not "yesterday": that can be a Saturday)
  const past = appts.filter((a) => a.dayOffset < 0 && a.status === 'confirmed');
  if (past.length) {
    const lastDate = past[past.length - 1].date;
    const onDay = past.filter((a) => a.date === lastDate);
    onDay[onDay.length - 1].status = 'no_show';
  }

  // receipts: dated at the end of the treatment, for what was actually done; today only the first two (the rest are still to come)
  const receipts: WeekReceipt[] = [];
  const todayPaid: Record<string, number> = {};
  appts.forEach((a, i) => {
    if (a.status !== 'confirmed' || a.dayOffset > 0) return;
    if (a.dayOffset === 0) { todayPaid[a.date] = (todayPaid[a.date] || 0) + 1; if (todayPaid[a.date] > 2) return; }
    receipts.push({ clientIndex: a.clientIndex, clientName: fullName(a.clientIndex), service: a.service, amount: a.price, method: METHODS[i % METHODS.length], createdAtUtc: israelToUtcIso(a.date, a.start_minute + a.duration), apptKey: `${a.date}#${a.start_minute}` });
  });

  // last month: enough receipts that "this month vs last month" is a believable, modest comparison
  const monthStart = today.slice(0, 8) + '01';
  const thisMonthSoFar = receipts.filter((r) => israelDate(new Date(r.createdAtUtc)) >= monthStart).reduce((n, r) => n + r.amount, 0);
  const target = Math.round(Math.max(thisMonthSoFar, 2500) * 1.0);
  const lastMonth: WeekReceipt[] = [];
  const lm = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 2, 1)); // first day of last month
  const lmYear = lm.getUTCFullYear(), lmMonth = lm.getUTCMonth();
  let sum = 0, k = 0;
  while (sum < target && k < 60) {
    const svc = services[(k * 5 + 1) % services.length];
    const day = 2 + ((k * 3) % 26);
    const date = `${lmYear}-${pad(lmMonth + 1)}-${pad(day)}`;
    if (weekday(date) !== 6) {
      lastMonth.push({ clientIndex: (k * 3 + 1) % clientCount, clientName: fullName((k * 3 + 1) % clientCount), service: svc.name, amount: Number(svc.price) || 0, method: METHODS[k % METHODS.length], createdAtUtc: israelToUtcIso(date, 10 * 60 + ((k * 95) % 480)), apptKey: null });
      sum += Number(svc.price) || 0;
    }
    k++;
  }
  return { appts, receipts, lastMonth, today };
}
