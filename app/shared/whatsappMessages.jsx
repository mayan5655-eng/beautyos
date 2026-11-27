"use client";
// app/shared/whatsappMessages.jsx — the text of the messages she sends from her own WhatsApp: confirmation, birthday, review, payment.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { greet as msgGreet, lines as msgLines, mapsLink as msgMapsLink, hebrewDate as msgHebrewDate, moveLine as msgMoveLine } from "@/lib/messages.js";
import { withMarketingFooter } from "@/lib/marketingConsent";
import { birthdayMessage } from "@/lib/birthdayOffer";
import { waMsg } from "./datesAndLinks";
import { dayWordFor } from "./dayWord";

/* @module-body */
// `time` is an ALREADY-FORMATTED "14:30", not an hour number. It used to take
// appt.hour and interpolate it raw, which sent a client "בשעה 14" - the bare
// integer, wrong for every half-hour appointment and badly formatted even for
// whole ones. Callers pass fmtApptTime(appt); the parameter is named for what
// it is so the next caller cannot make the same substitution.
function waConfirmLink(phone, name, service, date, time, links, extra = {}) {
  // The THIRD hand-written copy of "remind her about tomorrow", after the cron
  // and the manual route. Same voice as the other two now, including the
  // address/arrival-note enrichment and the softened, reschedule-inviting
  // cancel line - it keeps its own date and time arguments because its
  // callers pass them already formatted.
  const confirmUrl = links.confirmUrl;
  const cancelUrl  = links.cancelUrl;
  const businessName = (extra.businessName || "").trim();
  const address = (extra.address || "").trim();
  const arrivalNote = (extra.arrivalNote || "").trim();
  return waMsg(
    phone,
    msgLines(
      msgGreet(name),
      businessName ? `תזכורת לתור שלך ב${businessName}${dayWordFor(date)}.` : `תזכורת לתור${dayWordFor(date)}.`,
      "",
      service,
      `${msgHebrewDate(date)}, ${time}`,
      address ? "" : null,
      address ? `📍 ${address}` : null,
      address ? msgMapsLink(address) : null,
      arrivalNote ? "" : null,
      arrivalNote || null,
      "",
      `לאישור: ${confirmUrl}`,
      msgMoveLine(links.rescheduleUrl, extra.branding),
      `אם צריך לבטל, אפשר כאן: ${cancelUrl}`
    )
  );
}

function waBirthday(phone, name, businessName, automations) {
  // Her own birthday offer (lib/birthdayOffer.js); the business-name clause drops when empty or the legacy placeholder.
  return waMsg(phone, withMarketingFooter(birthdayMessage(name, businessName, automations)));
}

function waReview(phone, name) {
  return waMsg(phone, `שלום ${name}! \nתודה שביקרת אצלנו!\nנשמח מאוד אם תשאירי לנו ביקורת \nזה לוקח רק דקה ועוזר לנו מאוד! `);
}

function waPayment(phone, name, amount, service, method, businessPhone) {
  let payLine = "";
  if (method==="ביט"&&businessPhone) payLine=`\nביט: ${businessPhone}`;
  else if (method==="פייבוקס") payLine=`\nפייבוקס`;
  else if (method==="העברה") payLine=`\nהעברה בנקאית`;
  return waMsg(phone, `שלום ${name}! \nתודה על הביקור! ✦\nלתשלום עבור ${service}:\nסכום: ₪${amount}${payLine}\n\nתודה רבה! `);
}
/* @module-end */
export {
  waBirthday, waConfirmLink, waPayment, waReview,
};
