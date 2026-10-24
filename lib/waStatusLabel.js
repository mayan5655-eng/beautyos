// lib/waStatusLabel.js
//
// The status column in her message log (app/beautyos.jsx, הודעות > יומן הודעות).
//
// It used to be "anything that is not 'sent' is ✕ נכשל". But most rows are
// pending_manual: lib/whatsapp.js queues every message it does not send
// automatically (all marketing, and every utility message while the central
// number is off) for her to send with one tap. Her first booking confirmation
// showed as a red failure while it was simply waiting for her (2026-10-20
// new-tenant walk). A message is only "failed" when it really failed.
//
// "sent" still only means GreenAPI accepted the call; delivery_status is the
// honest arrival answer (pending/whatsapp-delivery-status.sql).

export function waStatusLabel(m) {
  const status = m && m.status;
  if (status === "pending_manual") return { text: "⏳ ממתינה לשליחה ממך", color: "var(--warning)" };
  if (status === "dismissed") return { text: "הוסרה מהרשימה בלי שליחה", color: "var(--ink-3)" };
  if (status !== "sent") return { text: "✕ לא נשלחה", color: "var(--danger)" };
  // Her tap on "שליחה" in the queue marks the row sent with no GreenAPI id: it opened in her own WhatsApp.
  if (!m.green_api_id && !m.delivery_status) return { text: "✓ נפתחה לשליחה בוואטסאפ שלך", color: "var(--ink-3)" };
  if (m.delivery_status === "read") return { text: "✓✓ נקראה", color: "var(--success)" };
  if (m.delivery_status === "delivered") return { text: "✓✓ הגיעה", color: "var(--success)" };
  if (m.delivery_status === "undelivered") return { text: "⚠ לא הגיעה", color: "var(--danger)" };
  return { text: "✓ נמסרה לוואטסאפ · אין אישור הגעה", color: "var(--ink-3)" };
}

/** Hebrew names for message_type, including the automatic kinds the smart reminders write. */
export const WA_TYPE_LABELS = {
  reminder: "תזכורת", confirmation: "אישור הגעה", booking_confirm: "אישור תור",
  owner_alert: "התראת תור", reminder_failure: "דוח תזכורות", skin_report: "דוח עור",
  skin_lead_alert: "ליד מהסורק", slot_offer: "הצעת תור", lead_bulk: "הודעה ללידים",
  comeback: "חזרנו לעבוד", auto_winback: "החזרת לקוחה", auto_review: "בקשת ביקורת",
  auto_birthday: "ברכת יום הולדת", auto_package_done: "סיום חבילה", auto_package_expiring: "תוקף חבילה",
  auto_rebook: "תזכורת לתור הבא", marketing_optout_ack: "אישור הסרה מהרשימה", ai_agent_reply: "תשובת בוט",
  cancel_notice: "ביטול תור",
  general: "כללי",
};
