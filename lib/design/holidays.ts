// lib/design/holidays.ts
//
// When each occasion is, so a seasonal template can surface itself: "ראש
// השנה בעוד 12 ימים, תרצי פוסט?" three weeks out, and go quiet the day
// after. Hebrew dates come from Intl's Hebrew calendar (ICU, in Node and
// every browser this app supports), so there is no table to keep and no
// year this file stops working in. Gregorian dates for the seasons and the
// international days.
//
// A template opts in by naming its `holiday`; the studio asks
// upcomingHolidays() and shows a card for each template whose window is open.

export type HolidayKey =
  | 'rosh_hashana' | 'yom_kippur' | 'sukkot' | 'hanukkah' | 'tu_bishvat' | 'purim' | 'pesach' | 'yom_haatzmaut' | 'shavuot' | 'family_day'
  | 'womens_day' | 'spring' | 'summer' | 'autumn' | 'winter';

export type Holiday = {
  key: HolidayKey;
  name: string;
  /** Hebrew calendar: month names as Intl (en) prints them; Purim accepts Adar and Adar II. */
  hebrew?: { day: number; months: string[] };
  gregorian?: { month: number; day: number };
  /** How many days before the date the window opens. */
  lead: number;
  /** A season stays open this many days after its first day; a holiday closes the day after. */
  span: number;
};

export const HOLIDAYS: Holiday[] = [
  { key: 'rosh_hashana', name: 'ראש השנה', hebrew: { day: 1, months: ['Tishri'] }, lead: 21, span: 2 },
  { key: 'yom_kippur', name: 'יום כיפור', hebrew: { day: 10, months: ['Tishri'] }, lead: 10, span: 1 },
  { key: 'sukkot', name: 'סוכות', hebrew: { day: 15, months: ['Tishri'] }, lead: 14, span: 7 },
  { key: 'hanukkah', name: 'חנוכה', hebrew: { day: 25, months: ['Kislev'] }, lead: 21, span: 8 },
  { key: 'tu_bishvat', name: 'ט"ו בשבט', hebrew: { day: 15, months: ['Shevat'] }, lead: 14, span: 1 },
  { key: 'family_day', name: 'יום המשפחה', hebrew: { day: 30, months: ['Shevat'] }, lead: 14, span: 1 },
  { key: 'purim', name: 'פורים', hebrew: { day: 14, months: ['Adar', 'Adar II'] }, lead: 21, span: 2 },
  { key: 'pesach', name: 'פסח', hebrew: { day: 15, months: ['Nisan'] }, lead: 21, span: 7 },
  { key: 'yom_haatzmaut', name: 'יום העצמאות', hebrew: { day: 5, months: ['Iyar'] }, lead: 14, span: 1 },
  { key: 'shavuot', name: 'שבועות', hebrew: { day: 6, months: ['Sivan'] }, lead: 14, span: 1 },
  { key: 'womens_day', name: 'יום האישה', gregorian: { month: 3, day: 8 }, lead: 14, span: 1 },
  { key: 'spring', name: 'אביב', gregorian: { month: 3, day: 21 }, lead: 10, span: 45 },
  { key: 'summer', name: 'קיץ', gregorian: { month: 6, day: 15 }, lead: 14, span: 60 },
  { key: 'autumn', name: 'סתיו', gregorian: { month: 10, day: 15 }, lead: 10, span: 45 },
  { key: 'winter', name: 'חורף', gregorian: { month: 12, day: 1 }, lead: 14, span: 60 },
];

export const holidayByKey = (key: string): Holiday | null => HOLIDAYS.find((h) => h.key === key) || null;

const TZ = 'Asia/Jerusalem';
const DAY = 86_400_000;

let hebrewFormatter: Intl.DateTimeFormat | null | undefined;
function hebrewFmt(): Intl.DateTimeFormat | null {
  if (hebrewFormatter !== undefined) return hebrewFormatter;
  try { hebrewFormatter = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }); }
  catch { hebrewFormatter = null; }
  return hebrewFormatter;
}

/** The Hebrew date of an instant, in Israel; null where the runtime has no Hebrew calendar. */
export function hebrewDate(d: Date): { day: number; month: string; year: number } | null {
  const f = hebrewFmt();
  if (!f) return null;
  const parts = f.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const day = Number(get('day')), year = Number(get('year'));
  const month = get('month');
  return Number.isFinite(day) && month ? { day, month, year } : null;
}

/** Midnight in Israel of the calendar day that holds `d`, as a UTC instant (so day arithmetic is clean). */
export function israelDay(d: Date): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return new Date(`${s}T00:00:00Z`);
}

const weekdayIl = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d);

/** The next date (Israel day, as a UTC-midnight instant) of a holiday on or after `from`. */
export function nextOccurrence(h: Holiday, from: Date = new Date()): Date | null {
  const start = israelDay(from);
  if (h.gregorian) {
    const y = start.getUTCFullYear();
    for (const year of [y, y + 1]) {
      const d = new Date(Date.UTC(year, h.gregorian.month - 1, h.gregorian.day));
      if (d.getTime() >= start.getTime()) return d;
    }
    return null;
  }
  if (!h.hebrew || !hebrewFmt()) return null;
  for (let i = 0; i < 400; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const hd = hebrewDate(new Date(d.getTime() + 12 * 3_600_000));
    if (hd && hd.day === h.hebrew.day && h.hebrew.months.includes(hd.month)) {
      // Independence Day moves off Friday/Saturday to the Thursday before, and off Monday to Tuesday.
      if (h.key === 'yom_haatzmaut') {
        const wd = weekdayIl(d);
        const shifted = wd === 'Fri' ? -1 : wd === 'Sat' ? -2 : wd === 'Mon' ? 1 : 0;
        const moved = new Date(d.getTime() + shifted * DAY);
        if (moved.getTime() < start.getTime()) continue;
        return moved;
      }
      return d;
    }
  }
  return null;
}

export type Upcoming = { holiday: Holiday; date: Date; /** Days until the date; 0 = today, negative = inside its span. */ daysLeft: number };

/** Every occasion whose window is open on `from`: from `lead` days before its date to `span` days after. */
export function upcomingHolidays(from: Date = new Date()): Upcoming[] {
  const today = israelDay(from);
  const out: Upcoming[] = [];
  for (const h of HOLIDAYS) {
    // The window may already be past the date (inside the span), so look back by the span first.
    const back = new Date(today.getTime() - h.span * DAY);
    const date = nextOccurrence(h, back);
    if (!date) continue;
    const daysLeft = Math.round((date.getTime() - today.getTime()) / DAY);
    if (daysLeft <= h.lead && daysLeft > -h.span) out.push({ holiday: h, date, daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** "ראש השנה בעוד 12 ימים, תרצי פוסט?" */
export function holidayPrompt(u: Upcoming): string {
  const when = u.daysLeft <= 0 ? (u.holiday.hebrew ? 'עכשיו' : 'כבר כאן') : u.daysLeft === 1 ? 'מחר' : u.daysLeft === 2 ? 'מחרתיים' : `בעוד ${u.daysLeft} ימים`;
  return `${u.holiday.name} ${when}, תרצי פוסט?`;
}
