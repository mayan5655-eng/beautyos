// lib/cancelMessage.js
//
// The wording of the owner alert when a client cancels. Pure (no I/O), so the
// sentences are testable; lib/cancelNotify.js does the reading and sending.

import { lines, hebrewDateShort, timeRange } from './messages.js';

/** How many waiting clients want this service (or did not say which). Pure. */
export function countMatchingWaiting(waitlist, service) {
  const want = String(service || "").trim();
  return (waitlist || []).filter((w) => {
    if (w && w.status && w.status !== "waiting") return false;
    const s = String(w?.service || "").trim();
    return !s || !want || s === want;
  }).length;
}

/** The message she reads. Pure, so the wording is testable. */
export function buildCancellationMessage({ name, service, date, startMinute: start, duration, waiting }) {
  const who = String(name || "").trim() || "לקוחה";
  const when = `${hebrewDateShort(date)}, ${timeRange(start, duration)}`;
  const n = Number(waiting) || 0;
  return lines(
    `${who} ביטלה את התור של ${when}${service ? ` (${service})` : ""}.`,
    "השעה חזרה ליומן.",
    n > 0 ? "" : null,
    n === 1 ? "יש אחת ברשימת ההמתנה שמתאימה. אפשר להציע לה את השעה מהיומן, ואני לא שולחת לה כלום בלי שתאשרי." : null,
    n > 1 ? `יש ${n} ברשימת ההמתנה שמתאימות. אפשר להציע להן את השעה מהיומן, ואני לא שולחת להן כלום בלי שתאשרי.` : null
  );
}
