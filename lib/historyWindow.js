// lib/historyWindow.js
//
// The dashboard no longer reads a business's whole history before it shows anything. It reads the recent window first (what every first
// screen needs), shows the app, and then reads the older rows in the background and merges them in.
//
//   window  = the last HISTORY_DAYS days (and everything in the future) of appointments and payments
//   history = everything older
//
// 190 days is chosen, not guessed: the six-month revenue chart looks back five calendar months plus the current one, which is at most
// about 186 days, so that chart is already complete from the window alone. Anything that needs more than the window (lifetime totals,
// "last visit" for a client not seen in over six months, the tax years, the report by service) waits for the history, and says so.
//
// Pure functions, so the boundaries can be tested at any date.

export const HISTORY_DAYS = 190;

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {Date} [now]
 * @returns {{ date: string, iso: string }} `date` is the first day inside the window as YYYY-MM-DD (appointments.date is a plain date),
 *   `iso` is the same instant as a timestamp (receipts.created_at).
 */
export function historyCutoff(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - HISTORY_DAYS);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, iso: d.toISOString() };
}

/** `more` rows that are not already in `prev` (matched by id), appended. Rows with no id are all kept. Never drops or reorders `prev`. */
export function mergeById(prev, more) {
  const have = new Set((prev || []).filter((r) => r && r.id !== undefined && r.id !== null).map((r) => String(r.id)));
  const add = (more || []).filter((r) => !(r && r.id !== undefined && r.id !== null && have.has(String(r.id))));
  return add.length ? [...(prev || []), ...add] : prev || [];
}
