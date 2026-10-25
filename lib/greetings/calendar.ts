// lib/greetings/calendar.ts
//
// The holiday side of personal greetings: which holidays fall in a window (from the list the design studio already uses,
// lib/design/holidays.ts) and which days are yom tov, when nothing goes out to clients.

import { HOLIDAYS, nextOccurrence, hebrewDate, israelDay } from '../design/holidays.ts';

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Holidays whose date falls on or after `from` and within `days` days, as 'YYYY-MM-DD' (Israel). */
export function holidaysBetween(from: Date, days: number): { key: string; name: string; date: string }[] {
  const start = israelDay(from);
  const out: { key: string; name: string; date: string }[] = [];
  for (const h of HOLIDAYS) {
    const d = nextOccurrence(h, start);
    if (!d) continue;
    if ((d.getTime() - start.getTime()) / DAY <= days) out.push({ key: h.key, name: h.name, date: ymd(d) });
  }
  return out;
}

// Israel's yom tov days (Hebrew calendar, as Intl prints the months): Rosh Hashana 1-2, Yom Kippur, Sukkot 1 and Shmini Atzeret,
// Pesach 1 and 7, Shavuot.
const YOM_TOV: Record<string, number[]> = {
  Tishri: [1, 2, 10, 15, 22],
  Nisan: [15, 21],
  Sivan: [6],
};

/** Is this Israel calendar day ('YYYY-MM-DD') a yom tov? False where the runtime has no Hebrew calendar. */
export function isYomTov(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const hd = hebrewDate(d);
  return !!hd && (YOM_TOV[hd.month] || []).includes(hd.day);
}
