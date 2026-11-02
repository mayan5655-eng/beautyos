// lib/reminders/handled.js
//
// One appointment, one day-before reminder, whichever button sent it. There are three ways a reminder leaves:
//   - the daily cron queues it (lib/reminders/dailyReminders.js), claiming `day_before:<date>` in reminder_claims;
//   - she taps "שלחי תזכורת" / "שליחה מרוכזת" in the app (a wa.me window built in the browser);
//   - she taps the reminder button on the client card (app/api/send-reminder-manual).
// Before 2026-11-02 the last two did not know about the cron: a reminder she sent in the morning was queued again at 16:00, and a
// client could get it twice. markReminderHandled() is what the two manual paths now call after a reminder went to her WhatsApp:
// it takes the same claim the cron takes (so the cron skips this appointment for that day) and dismisses any other copy still
// waiting in her queue for the same appointment ("dismissed", not "sent": that copy itself never went out). Best effort by design: a failure here never blocks a reminder she is sending.

import { claimReminder } from "./dailyReminders.js";

/** The text every reminder carries for this appointment: its confirm link (lib/confirmToken.confirmLinks). */
export const reminderMarker = (appointmentId) => `/confirm?id=${appointmentId}&action=confirm`;

/**
 * @param {any} db service-role client
 * @param {{ tenantId: string, appointmentId: string, date: string, keepMessageId?: string | null }} i
 * @returns {Promise<{ claim: string, closed: number }>}
 */
export async function markReminderHandled(db, i) {
  const out = { claim: "none", closed: 0 };
  try {
    out.claim = await claimReminder(db, i.appointmentId, `day_before:${String(i.date).slice(0, 10)}`);
  } catch { /* the claim is a guard, not a requirement */ }
  try {
    let q = db.from("whatsapp_messages")
      .update({ status: "dismissed" })
      .eq("tenant_id", i.tenantId)
      .eq("status", "pending_manual")
      .eq("message_type", "reminder")
      .like("message_body", `%${reminderMarker(i.appointmentId)}%`);
    if (i.keepMessageId) q = q.neq("id", i.keepMessageId);
    const { data } = await q.select("id");
    out.closed = (data || []).length;
  } catch { /* nothing to close, or the queue could not be read: the reminder itself already went */ }
  return out;
}
