// lib/calendarInvite.ts
//
// "Add to my calendar" for the client after she books. A client who has the
// appointment in her own phone calendar gets her phone's own reminder too, on
// top of ours, and forgets less - and it costs the cosmetician nothing.
//
// Two forms, because no single one works everywhere:
//   - an .ics file: iPhone opens it straight into Calendar, and most other
//     calendar apps accept it;
//   - a Google Calendar link: Android phones, where a downloaded .ics often
//     lands in Downloads and does nothing.
//
// The appointment is stored as a date plus minutes after midnight in ISRAEL
// time (the business's wall clock). Both forms are written in UTC, so a client
// abroad, or a phone set to another zone, still sees the right hour. The
// Israel offset (+2 / +3 in summer) is read from Intl, never hardcoded, since
// the DST dates move every year.

export type InviteInput = {
  /** 'YYYY-MM-DD', Israel date */
  date: string;
  /** minutes after midnight, Israel wall clock */
  startMinute: number;
  /** minutes */
  duration: number;
  title: string;
  location?: string;
  details?: string;
};

const TZ = 'Asia/Jerusalem';

/** Israel's UTC offset in minutes at a given instant (120 or 180). */
function israelOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant of an Israel wall-clock date + minute. */
export function israelWallToUtc(date: string, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minute);
  // First guess with the offset at the naive instant, then correct once:
  // that lands right on both sides of a DST change.
  let off = israelOffsetMinutes(new Date(naive));
  const second = israelOffsetMinutes(new Date(naive - off * 60000));
  if (second !== off) off = second;
  return new Date(naive - off * 60000);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545 text escaping, then folding long lines at 75 octets.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function range(i: InviteInput) {
  const start = israelWallToUtc(i.date, i.startMinute);
  const end = new Date(start.getTime() + Math.max(5, i.duration || 60) * 60000);
  return { start, end };
}

export function buildIcs(i: InviteInput, now: Date = new Date()): string {
  const { start, end } = range(i);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kalmea//Booking//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${stamp(start)}-${Math.abs(hash(i.title + i.date + i.startMinute))}@kalmea`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(i.title)}`,
    ...(i.location ? [`LOCATION:${esc(i.location)}`] : []),
    ...(i.details ? [`DESCRIPTION:${esc(i.details)}`] : []),
    // The phone's own reminder, a day and two hours before.
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(i.title)}`, 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(i.title)}`, 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(i: InviteInput): string {
  const { start, end } = range(i);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: i.title, dates: `${stamp(start)}/${stamp(end)}`, ctz: TZ });
  if (i.location) q.set('location', i.location);
  if (i.details) q.set('details', i.details);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function hash(s: string): number {
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0;
  return h;
}

export type FeedEvent = InviteInput & { uid: string };

/**
 * Her whole diary as one subscribed calendar (lib/calendarFeed.ts). No alarms: the phone
 * would otherwise ring for every client, and her own reminders are Kalmea's job.
 */
export function buildIcsFeed(events: FeedEvent[], calendarName: string, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kalmea//Diary//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Jerusalem',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    const { start, end } = range(e);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@kalmea`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      ...(e.details ? [`DESCRIPTION:${esc(e.details)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
