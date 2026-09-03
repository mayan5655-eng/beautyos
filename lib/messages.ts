// lib/messages.ts
//
// One voice for everything this product sends a client.
//
// There are seven outbound messages across five files - booking confirmation,
// two separate reminder implementations, the receipt, the review request, the
// winback and the birthday - and every one of them was written on its own. They
// all open "שלום {name}!" and then diverge: four different greeting emoji
// (💗, 💆‍♀️, ✦, ✨), two different label systems (emoji-prefixed fields versus
// bare lines), two different sign-offs, and dates that are raw ISO in some and
// preformatted in others.
//
// A client who books, gets reminded, pays and is asked for a review receives
// four messages from the same business that look like they came from four
// businesses. This is the shared vocabulary they compose from instead.
//
// Pure and dependency-free: it is imported by server routes and could be
// imported by the reminder engine, which deliberately has no imports at all.

/** The one mark. Not an emoji vocabulary - a signature. */
export const MARK = '✦';

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/**
 * Parse a stored 'YYYY-MM-DD' at MIDDAY, local.
 *
 * Not midnight: `new Date('2026-09-05')` is UTC, and midnight UTC is the
 * previous evening anywhere behind it - so a message could name the wrong day
 * to the one person who cares most which day it is. Noon cannot be pushed
 * across a boundary by any offset on earth.
 */
function parseDay(dateStr: string): Date | null {
  const d = new Date(String(dateStr || '') + 'T12:00:00');
  return Number.isNaN(+d) ? null : d;
}

/** "יום שבת, 5 בספטמבר" — how a person says a date out loud. */
export function hebrewDate(dateStr: string): string {
  const d = parseDay(dateStr);
  if (!d) return String(dateStr || '');
  return `יום ${HE_DAYS[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`;
}

/** "שבת 5.9" — for a line that has to be glanceable rather than readable. */
export function hebrewDateShort(dateStr: string): string {
  const d = parseDay(dateStr);
  if (!d) return String(dateStr || '');
  return `${HE_DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

/** "14:30" from minutes past midnight. */
export function hhmm(minutes: number): string {
  const m = ((Number(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * "14:30–15:15", or just "14:30" when the duration is unknown.
 *
 * The end time is not decoration: it is the difference between a client
 * planning her afternoon and a client guessing at it.
 */
export function timeRange(startMinute: number, durationMin?: number | null): string {
  const start = hhmm(startMinute);
  const dur = Number(durationMin);
  if (!Number.isFinite(dur) || dur <= 0) return start;
  return `${start}–${hhmm(Number(startMinute) + dur)}`;
}

/** "45 דקות" / "שעה" / "שעה וחצי" — the way it is said, not the arithmetic. */
export function durationHe(durationMin?: number | null): string {
  const d = Number(durationMin);
  if (!Number.isFinite(d) || d <= 0) return '';
  if (d === 60) return 'שעה';
  if (d === 90) return 'שעה וחצי';
  if (d === 120) return 'שעתיים';
  if (d % 60 === 0) return `${d / 60} שעות`;
  return `${d} דקות`;
}

/** "שלום דנה! ✦" — the same opening every time, with the same mark. */
export function greet(name?: string | null): string {
  const n = String(name || '').trim();
  return n ? `שלום ${n}! ${MARK}` : `שלום! ${MARK}`;
}

/**
 * Join lines. ABSENT and BLANK are different things, and the distinction is the
 * whole reason this exists:
 *
 *   null | undefined | false  →  omitted entirely (a field she has not filled in)
 *   ''                        →  a blank line (a deliberate paragraph break)
 *
 * These messages are assembled from fields that are usually missing - no
 * address, no therapist name, no arrival note - so the alternative is a chain of
 * ternaries that leaves a hole in the message wherever one is absent, and a
 * message with a hole in it looks broken in a way a shorter one does not.
 *
 * Runs of blanks collapse to one and the ends are trimmed, so a caller can
 * write `address ? '' : null` before a block without having to reason about
 * what happens when two optional blocks are both missing.
 */
export function lines(...parts: Array<string | false | null | undefined>): string {
  const kept = parts.filter((p): p is string => typeof p === 'string');
  const out: string[] = [];
  for (const line of kept) {
    const blank = line.trim() === '';
    if (blank && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(blank ? '' : line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** A Google Maps link for an address she can tap once, at the door. */
export function mapsLink(address?: string | null): string {
  const a = String(address || '').trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : '';
}
