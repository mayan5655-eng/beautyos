// lib/reschedule.ts
//
// "להזיז את התור": the client moves her own appointment from the link in her confirmation or reminder
// (app/api/confirm/reschedule, app/confirm/page.jsx).
//
// Pure: no database, no clock of its own (every function takes `now`), so test-reschedule.ts runs it with node alone.
//
// The free times are decided by the SAME rules the public booking page and /api/book-appointment use, from the same
// helpers: her hours (lib/businessHours), her notice and how far ahead (lib/bookingPolicy resolveBookingRules), her break
// (lib/lunchBreak), the buffer after each treatment (lib/serviceBuffer), half-hour starts that end by closing
// (lib/apptTime slotsBetween). The one difference: the appointment being moved does not block itself, so she can move
// it half an hour later inside its own old time.
//
// The move itself is ONE update of the same row (date + start), so the old time is freed and the new one held in the
// same statement; the database's uniq_appt_slot_active (23505) and appointments_no_overlap (23P01) refuse a time a
// parallel booking took, exactly as they do for a new booking. The row keeps its id, so a paid deposit, a saved card
// and her cancellation-policy consent (all keyed by appointment id) carry over with it.

import { dayHoursFrom, type HoursSettings } from './businessHours.ts';
import { slotsBetween, overlaps } from './apptTime.ts';
import { isTooSoonForSelfBooking, isTooFarAhead, wallClockNow, type BookingRules } from './bookingPolicy.ts';

/** How many times one appointment can be moved from the client's link. Her own moves in the app are not counted. */
export const MAX_MOVES_DEFAULT = 2;
export const MAX_MOVES_LIMIT = 5;
/** How many open days the move screen offers. */
export const RESCHEDULE_DAYS_SHOWN = 14;
export const RESCHEDULE_SLOT_STEP = 30;

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** branding.booking_rules.max_reschedules (0..5); missing or malformed = 2. 0 turns moving off for her clients. */
export function maxMovesFrom(branding: unknown): number {
  const raw = asObj(asObj(branding).booking_rules).max_reschedules;
  if (raw === undefined || raw === null || raw === '') return MAX_MOVES_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return MAX_MOVES_DEFAULT;
  return Math.min(MAX_MOVES_LIMIT, Math.max(0, Math.round(n)));
}

/** A stored move count as a whole number >= 0 (null, garbage, negative = 0). */
export function cleanMoveCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Busy time on one day, each range already including its own buffer: [start, end). */
export type BusyRange = [number, number];

export type SlotRules = Pick<BookingRules, 'minLeadMinutes' | 'maxDaysAhead'>;

export type SlotQuery = {
  hours: HoursSettings | null | undefined;
  rules: SlotRules;
  /** the treatment's own length and the buffer after it */
  duration: number;
  buffer: number;
  /** her break on every working day, as lib/lunchBreak resolveLunch returns it, or null */
  lunch?: { startMinute: number; minutes: number } | null;
  /** busy ranges by date, WITHOUT the appointment being moved */
  busyByDate: Record<string, BusyRange[]>;
  now?: Date;
};

/** Is this exact start bookable for the move? The same checks /api/book-appointment makes, in the same order. */
export function moveSlotProblem(q: SlotQuery & { date: string; start: number }): null | 'bad' | 'too_soon' | 'too_far' | 'closed' | 'hours' | 'taken' {
  const now = q.now ?? new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date) || !Number.isFinite(q.start) || q.start < 0 || q.start >= 1440 || q.start % 5 !== 0) return 'bad';
  if (new Date(q.date + 'T12:00:00Z').toISOString().slice(0, 10) !== q.date) return 'bad';
  if (isTooSoonForSelfBooking(q.date, q.start, now, q.rules.minLeadMinutes)) return 'too_soon';
  if (isTooFarAhead(q.date, q.rules.maxDaysAhead, now)) return 'too_far';
  const dh = dayHoursFrom(q.hours, new Date(q.date + 'T12:00:00Z').getUTCDay());
  if (!dh) return 'closed';
  const duration = Number(q.duration) > 0 ? Number(q.duration) : 60;
  const buffer = Number(q.buffer) > 0 ? Number(q.buffer) : 0;
  if (q.start < dh.open * 60 || q.start + duration > dh.close * 60) return 'hours';
  const lunch = q.lunch;
  if (lunch && Number(lunch.minutes) > 0 && overlaps(q.start, q.start + duration + buffer, Number(lunch.startMinute), Number(lunch.startMinute) + Number(lunch.minutes))) return 'taken';
  const busy = q.busyByDate[q.date] || [];
  if (busy.some(([bs, be]) => overlaps(q.start, q.start + duration + buffer, bs, be))) return 'taken';
  return null;
}

/** "YYYY-MM-DD" plus n calendar days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The open days and their free starts, from her Israel "today" on, up to RESCHEDULE_DAYS_SHOWN days that have at
 * least one free start, within her "how far ahead". `skip` is the appointment's current date + start, which is not offered
 * (moving to where it already is changes nothing).
 */
export function rescheduleDays(q: SlotQuery & { skip?: { date: string; start: number } | null; maxDays?: number }): Array<{ date: string; slots: number[] }> {
  const now = q.now ?? new Date();
  const today = wallClockNow(now).date;
  const out: Array<{ date: string; slots: number[] }> = [];
  const want = q.maxDays ?? RESCHEDULE_DAYS_SHOWN;
  const duration = Number(q.duration) > 0 ? Number(q.duration) : 60;
  for (let i = 0; i <= q.rules.maxDaysAhead && out.length < want; i++) {
    const date = addDays(today, i);
    const dh = dayHoursFrom(q.hours, new Date(date + 'T12:00:00Z').getUTCDay());
    if (!dh) continue;
    const slots = slotsBetween(dh.open, dh.close, RESCHEDULE_SLOT_STEP, duration).filter((start) =>
      !(q.skip && q.skip.date === date && q.skip.start === start) && moveSlotProblem({ ...q, now, date, start }) === null);
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

// ── Copy (Hebrew, warm, feminine, no em dashes) ────────────────────────────────────────────────────────────────

export const RESCHEDULE_COPY = {
  title: 'להזיז את התור',
  pickDay: 'באיזה יום נוח לך?',
  pickTime: 'ובאיזו שעה?',
  confirmBtn: 'להזיז לשעה הזו',
  moving: 'מזיזה את התור שלך',
  doneTitle: 'התור הוזז!',
  noSlots: 'כרגע אין שעות פנויות לטיפול הזה בימים הקרובים. אפשר לכתוב לעסק ישירות, ונמצא יחד זמן שמתאים לך.',
  taken: 'השעה הזו נתפסה ממש עכשיו. אפשר לבחור שעה אחרת?',
  offerFromCancel: 'רוצה להזיז במקום לבטל?',
  keep: 'השארת התור כמו שהוא',
} as const;

/** The refusal once she has used her moves. Same calm shape as the other link refusals (lib/bookingPolicy clientLinkRefusal). */
export function movesUsedHe(max: number, businessName?: string): string {
  const who = String(businessName || '').trim() || 'העסק';
  if (max <= 0) return `אצל ${who} מזיזים תור ישירות מולה. אפשר לכתוב לה, והיא תשמח למצוא לך זמן אחר.`;
  const times = max === 1 ? 'פעם אחת' : max === 2 ? 'פעמיים' : `${max} פעמים`;
  return `את התור הזה כבר הזזת ${times} דרך הקישור. לשינוי נוסף אפשר ליצור קשר ישירות עם ${who}.`;
}

/** A deposit hold still waiting for payment is moved only after it is paid (or by her). */
export const MOVE_HELD_HE = 'התור שמור עבורך עד שהמקדמה משולמת. אחרי התשלום אפשר יהיה להזיז אותו מכאן.';

/** The owner's notification: who, from when to when, and that the old time is free again. */
export function ownerMoveMessage(p: { name?: string | null; service?: string | null; fromWhen: string; toWhen: string }): string {
  const who = String(p.name || '').trim() || 'לקוחה';
  const svc = String(p.service || '').trim();
  return [
    `${who} הזיזה את התור${svc ? ` ל${svc}` : ''} מ${p.fromWhen} ל${p.toWhen}.`,
    'השעה הקודמת התפנתה ביומן.',
  ].join(' ');
}
