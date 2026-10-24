// lib/eveningSummary.js
//
// The message she can read in ten seconds the night before: how many, who is
// first, when it ends, who has not confirmed. She carries tomorrow in her head
// all evening; this lets her put it down.
//
// Returns null when tomorrow has no client appointments: an empty-day message
// is noise, not care. Pure, so the sentences are testable; the cron route does
// the reading and sending.
//
// Sent only to her, only when she has turned it on. Not on Friday evening;
// on Saturday it goes out after Shabbat, at 20:00, so she has Sunday's picture.

import { lines, hebrewDateShort, hhmm } from "./messages.js";
import { joinNames } from "./closingList.js";
import { clientCronSlot } from "./shabbat.js";

const plural = (n) => (n === 1 ? "לקוחה אחת" : `${n} לקוחות`);

/**
 * @param {object} p
 * @param {string} p.date              tomorrow, "YYYY-MM-DD"
 * @param {object[]} p.appointments    tomorrow's CLIENT appointments, any status
 * @param {(a:object)=>number|null} p.startMinute
 * @param {(a:object)=>number|null} p.endMinute
 * @returns {string|null}
 */
export function buildEveningSummary({ date, appointments, startMinute, endMinute }) {
  const live = (appointments || [])
    .filter((a) => a && a.confirmation_status !== "cancelled")
    .map((a) => ({ a, s: startMinute(a), e: endMinute(a) }))
    .filter((x) => x.s !== null && x.s !== undefined)
    .sort((x, y) => x.s - y.s);
  if (!live.length) return null;

  const first = live[0];
  const lastEnd = Math.max(...live.map((x) => (x.e ?? x.s)));
  const unconfirmed = live.filter((x) => x.a.confirmation_status !== "confirmed").map((x) => x.a.name);

  return lines(
    `מחר, ${hebrewDateShort(date)}: ${plural(live.length)}.`,
    `${live.length === 1 ? "היא" : "הראשונה"} ב-${hhmm(first.s)} (${first.a.name}${first.a.service ? ", " + first.a.service : ""})${live.length > 1 ? ` והיום נגמר ב-${hhmm(lastEnd)}` : ""}.`,
    unconfirmed.length ? "" : null,
    unconfirmed.length ? `עוד לא אישרו: ${joinNames(unconfirmed)}.` : null,
    "",
    "לילה טוב."
  );
}

/** Israel's weekday for a Date, 0 = Sunday. */
export function israelWeekday(now = new Date()) {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(s);
}

/**
 * No evening message on Friday (Shabbat comes in). On Saturday only the run that lands at 20:00 Israel time goes out (the
 * Saturday-night slot in lib/shabbat.js), so Sunday still gets its summary and it arrives once.
 */
export function isQuietEvening(now = new Date()) {
  const d = israelWeekday(now);
  if (d === 5) return true;
  if (d === 6) return !clientCronSlot(now).run;
  return false;
}
