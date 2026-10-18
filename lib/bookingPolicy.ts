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

/**
 * Her own booking rules for self-booking on the public page (Settings > calendar and services), stored in
 * branding.booking_rules: { min_notice_hours, max_days_ahead }. Both are optional; a missing or malformed value
 * is the default, which is what the page did before the rules existed (2 hours' notice, 21 days ahead).
 * Read by the public page (to offer fewer slots) AND by /api/book-appointment (to refuse), from this one function,
 * so the page and the server can never disagree about what is bookable.
 */
export const DEFAULT_MAX_DAYS_AHEAD = 21;
export const MAX_DAYS_AHEAD_LIMIT = 60; // /api/availability reports 60 days

export type BookingRules = {
  minLeadMinutes: number;
  maxDaysAhead: number;
  /** Deposit asked for when booking, in shekels. 0 = none. Collected by her (Bit, transfer): see depositNote. */
  depositAmount: number;
  /** One line on how to pay the deposit, shown on the page and after booking. */
  depositNote: string;
  /** Hours before the appointment within which a client can no longer cancel through her link. 0 = no window. */
  cancelWindowHours: number;
};

export const MAX_DEPOSIT_AMOUNT = 5000;
export const MAX_DEPOSIT_NOTE = 200;
export const CANCEL_WINDOW_OPTIONS = [0, 12, 24, 48, 72] as const;

export function resolveBookingRules(branding: unknown): BookingRules {
  const b = branding && typeof branding === 'object' && !Array.isArray(branding) ? (branding as Record<string, unknown>) : {};
  const r = b.booking_rules && typeof b.booking_rules === 'object' ? (b.booking_rules as Record<string, unknown>) : {};
  const hours = Number(r.min_notice_hours);
  const days = Number(r.max_days_ahead);
  const dep = Number(r.deposit_amount);
  const win = Number(r.cancel_window_hours);
  const note = typeof r.deposit_note === 'string' ? r.deposit_note.replace(/\s+/g, ' ').trim().slice(0, MAX_DEPOSIT_NOTE) : '';
  return {
    minLeadMinutes: Number.isFinite(hours) && hours >= 0 && hours <= 168 ? Math.round(hours * 60) : SELF_BOOKING_MIN_LEAD_MINUTES,
    maxDaysAhead: Number.isFinite(days) && days >= 1 && days <= MAX_DAYS_AHEAD_LIMIT ? Math.round(days) : DEFAULT_MAX_DAYS_AHEAD,
    depositAmount: Number.isFinite(dep) && dep > 0 && dep <= MAX_DEPOSIT_AMOUNT ? Math.round(dep) : 0,
    depositNote: note,
    cancelWindowHours: Number.isFinite(win) && win > 0 && win <= 168 ? Math.round(win) : 0,
  };
}

/** Is this date further ahead than her rule allows? Unparseable counts as too far (refused, like the lead check). */
export function isTooFarAhead(dateStr: string, maxDaysAhead: number, now: Date = new Date()): boolean {
  const days = daysBetween(wallClockNow(now).date, dateStr);
  if (days === null) return true;
  return days > maxDaysAhead;
}

/**
 * Does booking on her page need an explicit "I agree" from the client? Yes when she asked for a deposit or set a
 * cancellation window: the page shows the terms and the server refuses a booking that did not accept them.
 */
export function bookingTermsRequired(rules: BookingRules): boolean {
  return rules.depositAmount > 0 || rules.cancelWindowHours > 0;
}

/**
 * Is this appointment inside her cancellation window, so the client's own link can no longer cancel it?
 * False when she set no window. An unparseable slot is NOT inside the window (the link then behaves as it always
 * did): this rule only ever restricts a client, it never blocks her own cancel in the app.
 */
export function isInsideCancelWindow(dateStr: string, startMinute: number, windowHours: number, now: Date = new Date()): boolean {
  if (!(windowHours > 0)) return false;
  const mins = minutesUntilSlot(dateStr, startMinute, now);
  if (mins === null) return false;
  return mins < windowHours * 60;
}
