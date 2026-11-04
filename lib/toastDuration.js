// How long a toast in the main app stays on screen (2026-11-03 UX review). 3.5s was too short for a Hebrew sentence of any length,
// and an undo button that vanishes before her thumb reaches it is not an undo.
export const TOAST_MIN_MS = 3500;
export const TOAST_MS_PER_CHAR = 70;
export const TOAST_ACTION_MS = 8000;
// What a toast's undo is protecting (the cancel notice to the client, the gap-fill offer, the waitlist offer) waits this long, so it
// can never go out while the "החזרה" button is still on screen.
export const UNDO_SETTLE_MS = TOAST_ACTION_MS + 1000;

/** @param {unknown} msg @param {boolean} [hasAction] */
export function toastDurationMs(msg, hasAction = false) {
  if (hasAction) return TOAST_ACTION_MS;
  const len = String(msg ?? "").length;
  return Math.max(TOAST_MIN_MS, len * TOAST_MS_PER_CHAR);
}
