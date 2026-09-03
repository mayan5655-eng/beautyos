// lib/messages.js
//
// One voice for everything this product sends a client.
//
// There are seven outbound messages across five files - the booking
// confirmation, THREE separate reminder implementations, the receipt, the
// review request, the winback and the birthday - and every one was written on
// its own. They all opened "שלום {name}!" and then diverged: four different
// greeting emoji (💗, 💆‍♀️, ✦, ✨), two label systems (emoji-prefixed fields
// versus bare lines), two sign-offs, and dates raw ISO in some and preformatted
// in others.
//
// A client who books, is reminded, pays and is asked for a review hears from
// four businesses. This is the shared vocabulary they compose from instead.
//
// ── Why this is .js and not .ts ───────────────────────────────────────────
//
// lib/reminders/smartReminders.js imports it, and that file is loaded directly
// by `node test-smart-reminders.js` - a plain node process with no TypeScript
// loader. A .ts import there resolves under Next, which compiles it, and fails
// under the test harness, which does not. The build stayed green and the tests
// stopped running, which is the worst combination available: the check that
// would have caught a mistake is the thing that broke.
//
// So: plain ESM, types in JSDoc, and every importer of it uses the explicit
// .js extension so node's ESM resolver and webpack agree.
//
// Pure - no environment, no I/O, no clock beyond what is passed in. That is
// what makes it safe to import into the reminder engine, which is otherwise
// import-free so it can run against a synthetic dataset. lib/reviewToken is
// injected into that engine rather than imported for the opposite reason: it
// reads a signing secret.

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
 *
 * @param {string} dateStr
 * @returns {Date | null}
 */
function parseDay(dateStr) {
  const d = new Date(String(dateStr || '') + 'T12:00:00');
  return Number.isNaN(+d) ? null : d;
}

/**
 * "יום שבת, 5 בספטמבר" — how a person says a date out loud.
 * @param {string} dateStr
 * @returns {string}
 */
export function hebrewDate(dateStr) {
  const d = parseDay(dateStr);
  if (!d) return String(dateStr || '');
  return `יום ${HE_DAYS[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`;
}

/**
 * "שבת 5.9" — for a line that has to be glanceable rather than readable.
 * @param {string} dateStr
 * @returns {string}
 */
export function hebrewDateShort(dateStr) {
  const d = parseDay(dateStr);
  if (!d) return String(dateStr || '');
  return `${HE_DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

/**
 * "14:30" from minutes past midnight.
 * @param {number} minutes
 * @returns {string}
 */
export function hhmm(minutes) {
  const m = ((Number(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * "14:30–15:15", or just "14:30" when the duration is unknown.
 *
 * The end time is not decoration: it is the difference between a client
 * planning her afternoon and a client guessing at it.
 *
 * @param {number} startMinute
 * @param {number | null | undefined} [durationMin]
 * @returns {string}
 */
export function timeRange(startMinute, durationMin) {
  const start = hhmm(startMinute);
  const dur = Number(durationMin);
  if (!Number.isFinite(dur) || dur <= 0) return start;
  return `${start}–${hhmm(Number(startMinute) + dur)}`;
}

/**
 * "45 דקות" / "שעה" / "שעה וחצי" — the way it is said, not the arithmetic.
 * @param {number | null | undefined} [durationMin]
 * @returns {string}
 */
export function durationHe(durationMin) {
  const d = Number(durationMin);
  if (!Number.isFinite(d) || d <= 0) return '';
  if (d === 60) return 'שעה';
  if (d === 90) return 'שעה וחצי';
  if (d === 120) return 'שעתיים';
  if (d % 60 === 0) return `${d / 60} שעות`;
  return `${d} דקות`;
}

/**
 * "שלום דנה! ✦" — the same opening every time, with the same mark.
 * @param {string | null | undefined} [name]
 * @returns {string}
 */
export function greet(name) {
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
 * ternaries that leaves a hole wherever one is absent, and a message with a hole
 * in it looks broken in a way a shorter one does not.
 *
 * Runs of blanks collapse to one and the ends are trimmed, so a caller can write
 * `address ? '' : null` before a block without reasoning about what happens when
 * two optional blocks are both missing.
 *
 * @param {...(string | false | null | undefined)} parts
 * @returns {string}
 */
export function lines(...parts) {
  const out = [];
  for (const part of parts) {
    if (typeof part !== 'string') continue;
    const blank = part.trim() === '';
    if (blank && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(blank ? '' : part);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/**
 * A Google Maps link for an address she can tap once, at the door.
 * @param {string | null | undefined} [address]
 * @returns {string}
 */
export function mapsLink(address) {
  const a = String(address || '').trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : '';
}
