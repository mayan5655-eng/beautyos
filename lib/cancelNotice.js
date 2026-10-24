// lib/cancelNotice.js
// The message that tells a client her appointment was cancelled by the business
// (app/api/cancel-notice). Warm and first person, like every client message.
import { greet, lines, hebrewDate } from "./messages.js";

export function cancelNoticeText({ clientName, service, date, time, businessName, therapistName }) {
  return lines(
    greet(clientName),
    `לצערי אני צריכה לבטל את התור שלך${businessName ? ` ב${businessName}` : ""}.`,
    "",
    [service, date ? hebrewDate(date) : null, time || null].filter(Boolean).join(" · "),
    "",
    "מצטערת על השינוי. אשמח לקבוע לך מועד אחר, מתי נוח לך?",
    therapistName ? `${therapistName} 🌸` : "🌸"
  );
}
