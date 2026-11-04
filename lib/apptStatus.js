// One set of words for an appointment's state, shared by the Today list, the agenda card and "היום שלי".
// They used to disagree on the same screen ("אושר" / "אישרה", "ממתין" / "ממתין לאישור" / "ממתינה לאישור"); 2026-11-03 UX review.
// Same value as NO_SHOW in lib/reliability.ts (test-appt-status.ts pins the two together).
const NO_SHOW_VALUE = "no_show";

/**
 * @param {{confirmation_status?: string|null}|null|undefined} appt
 * @param {{personal?: boolean}} [opts]
 * @returns {{key: "personal"|"confirmed"|"cancelled"|"no_show"|"pending", label: string, tone: "muted"|"success"|"danger"|"warning"}}
 */
export function apptStatus(appt, opts = {}) {
  if (opts.personal) return { key: "personal", label: "אישי", tone: "muted" };
  const s = appt && appt.confirmation_status;
  if (s === "confirmed") return { key: "confirmed", label: "אישרה", tone: "success" };
  if (s === "cancelled") return { key: "cancelled", label: "בוטל", tone: "muted" };
  if (s === NO_SHOW_VALUE) return { key: "no_show", label: "לא הגיעה", tone: "danger" };
  return { key: "pending", label: "ממתינה לאישור", tone: "warning" };
}

/** The label alone. */
export function apptStatusWord(appt, opts = {}) {
  return apptStatus(appt, opts).label;
}

export const APPT_STATUS_TONE_COLOR = {
  muted: "var(--ink-3)",
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
};
