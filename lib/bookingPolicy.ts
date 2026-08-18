// lib/bookingPolicy.ts
//
// Rules about WHEN a booking may be made, as opposed to lib/apptTime.ts which
// only knows how a time is represented.
//
// Deliberately its own tiny module with no dependencies: it is imported by both
// a client page and a server route, and the one rule in it is the first thing
// that will become a per-tenant setting.

/**
 * How far ahead a CLIENT must book on the public page.
 *
 * Scope is narrow and intentional:
 *   - applies to /book self-service only,
 *   - NOT to the cosmetician booking in the app, who needs to add a walk-in
 *     starting right now,
 *   - NOT to gap-fill, which exists precisely to fill a slot at short notice
 *     and carries its own MIN_LEAD_MINUTES in app/api/slots/offer.
 *
 * When this becomes per-tenant, this constant becomes the default and the
 * signature below already takes the value as an argument.
 */
export const SELF_BOOKING_MIN_LEAD_MINUTES = 120;

// Appointment dates are Israel wall-clock dates. Vercel runs in UTC, so
// comparing a date built from local parts against a real timestamp would put the
// two in different frames and overstate the lead by the offset - which would
// quietly let a client book with almost no notice. Same approach as
// app/api/send-reminders and app/api/slots/offer.
const TZ = 'Asia/Jerusalem';

/** The clinic's local date ("YYYY-MM-DD") and minutes-from-midnight, right now. */
export function wallClockNow(now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // hour can come back as "24" at midnight in some ICU versions.
  const hh = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hh * 60 + Number(get('minute')),
  };
}

/** Whole days from date a to date b, both "YYYY-MM-DD". Calendar-only, no TZ. */
function daysBetween(a: string, b: string): number | null {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  if (pa.length !== 3 || pb.length !== 3 || pa.some(isNaN) || pb.some(isNaN)) return null;
  const ua = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const ub = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((ub - ua) / 86400000);
}

/** Minutes from now until a slot starts. Negative when the slot is in the past. */
export function minutesUntilSlot(
  dateStr: string,
  startMinute: number,
  now: Date = new Date(),
): number | null {
  if (!dateStr || !Number.isFinite(Number(startMinute))) return null;
  const wall = wallClockNow(now);
  const days = daysBetween(wall.date, dateStr);
  if (days === null) return null;
  return days * 1440 + Number(startMinute) - wall.minutes;
}

/**
 * Is this slot too soon for a client to self-book?
 *
 * Returns true for anything unparseable, so a malformed request is refused
 * rather than waved through - the same direction the overlap check fails in.
 */
export function isTooSoonForSelfBooking(
  dateStr: string,
  startMinute: number,
  now: Date = new Date(),
  minLeadMinutes: number = SELF_BOOKING_MIN_LEAD_MINUTES,
): boolean {
  const mins = minutesUntilSlot(dateStr, startMinute, now);
  if (mins === null) return true;
  return mins < minLeadMinutes;
}
