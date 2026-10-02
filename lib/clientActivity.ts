// lib/clientActivity.ts
//
// "Days since her last visit", and the active/cold classification built on
// it. Extracted so the single most consequential piece of arithmetic behind
// the needs-attention queue (who gets nudged for a win-back message) is
// provable without rendering the whole dashboard component.
//
// The one rule this exists to enforce: a client with NO appointment yet is
// NEW, not dormant. A sentinel number (999) used to stand in for "no last
// visit", and every `>60` comparison downstream read that sentinel as a
// genuinely lapsed client - so a client added from a phone call, before her
// first appointment exists, was immediately flagged "hasn't visited in 999
// days" and surfaced in the needs-attention queue's win-back suggestions.
// Confirmed live against a brand-new tenant during the launch audit.
//
// null is the real, distinct state now, and every reader below checks for
// it explicitly - null coerces to 0 in a bare arithmetic comparison, which
// would make "<=60" (active) wrongly true for a client who was never seen
// at all. That silent-coercion trap is exactly how a second bug would hide
// behind a fix for the first one, which is why this is its own module with
// its own test rather than three more inline `!==null` checks trusted to
// everyone who touches this file next.

/** Days since lastApptDate, or null when there is no last visit at all. */
export function daysSinceLastVisit(
  lastApptDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!lastApptDate) return null;
  const then = new Date(lastApptDate).getTime();
  if (!Number.isFinite(then)) return null;
  const ms = now.getTime() - then;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Visited within the last 60 days. A client with no visit yet is NOT active. */
export function isActiveClient(lastApptDate: string | null | undefined, now?: Date): boolean {
  const d = daysSinceLastVisit(lastApptDate, now);
  return d !== null && d <= 60;
}

/** Overdue for a visit by more than 60 days. A client with no visit yet is NOT cold. */
export function isColdClient(lastApptDate: string | null | undefined, now?: Date): boolean {
  const d = daysSinceLastVisit(lastApptDate, now);
  return d !== null && d > 60;
}
