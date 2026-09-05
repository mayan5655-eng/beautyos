// lib/bookingNotify.js
//
// The ONE booking-confirmation template - client WhatsApp + owner alert -
// shared by every path that creates an appointment for a client:
// /api/book-appointment (the public booking page) and /api/claim (a gap-fill
// slot claimed from a wa.me offer). Extracted rather than copied so the two
// flows can never drift: a client who claims a freed slot gets exactly the
// confirmation a regular booking gets, cancel link included.
//
// Both sends are best-effort by design: the appointment is already booked
// when this runs, and a messaging failure must not fail the booking. Errors
// are logged, never thrown.

import { sendWhatsApp } from "./whatsapp";
import { confirmLinks } from "./confirmToken";
import { APP_URL } from "./appUrl";
import { greet, lines, hebrewDate, hebrewDateShort, timeRange, durationHe, mapsLink } from "./messages.js";

/**
 * @param {object} p
 * @param {object|null} p.settingsRow  settings row with business_name,
 *   business_phone, therapist_name, branding (jsonb). Caller loads it - both
 *   routes already hold one or can read it with their service client.
 * @param {string}  p.tenantId
 * @param {string}  p.appointmentId    for the cancel link
 * @param {string}  p.name             client name
 * @param {string}  p.phone            client phone
 * @param {string}  p.service
 * @param {string}  p.date             "YYYY-MM-DD"
 * @param {number}  p.startMinute      minutes from midnight
 * @param {number}  p.duration         minutes
 * @param {boolean} [p.isReturningClient]
 * @param {string}  [p.ownerNote]      extra line for the owner alert (e.g.
 *                                     "תור שהתפנה נתפס דרך הצעת וואטסאפ")
 */
export async function sendBookingNotifications(p) {
  const settingsRow = p.settingsRow || {};
  const businessName = settingsRow.business_name || "העסק";
  const ownerPhone = settingsRow.business_phone || "";

  const brandJson =
    settingsRow.branding && typeof settingsRow.branding === "object" ? settingsRow.branding : {};
  const address = String(brandJson.public_address || brandJson.address || "").trim();
  const arrivalNote = String(brandJson.arrival_note || "").trim();
  const therapist = String(settingsRow.therapist_name || "").trim();
  const durationText = durationHe(p.duration);

  // Client confirmation. What she needs, in the order she needs it: what she
  // booked and how long it takes, when, where, with whom, and how to get out
  // of it. The cancel link is the point - see the long comment at the
  // original site in /api/book-appointment.
  try {
    const { cancelUrl } = confirmLinks(APP_URL, p.appointmentId);
    const clientMsg = lines(
      greet(p.name),
      `התור שלך ב${businessName} נקבע.`,
      "",
      durationText ? `${p.service} · ${durationText}` : p.service,
      `${hebrewDate(p.date)}, ${timeRange(p.startMinute, p.duration)}`,
      therapist ? `מטפלת: ${therapist}` : null,
      address ? "" : null,
      address ? `📍 ${address}` : null,
      address ? mapsLink(address) : null,
      arrivalNote ? "" : null,
      arrivalNote || null,
      "",
      "לא מתאים לך? אפשר לבטל כאן:",
      cancelUrl
    );
    await sendWhatsApp(p.phone, clientMsg, {
      name: p.name,
      type: "booking_confirm",
      tenantId: p.tenantId,
    });
  } catch (waErr) {
    console.error("[bookingNotify] client WhatsApp failed:", waErr?.message || String(waErr));
  }

  // Owner alert. First line answers the only question she has mid-treatment:
  // WHEN, and does it collide with anything.
  if (ownerPhone) {
    try {
      const ownerMsg = lines(
        `תור חדש · ${hebrewDateShort(p.date)}, ${timeRange(p.startMinute, p.duration)}`,
        `${p.name} · ${p.service}${durationText ? ` (${durationText})` : ""}`,
        p.ownerNote || (p.isReturningClient ? "לקוחה חוזרת" : "לקוחה חדשה"),
        p.phone
      );
      await sendWhatsApp(ownerPhone, ownerMsg, {
        name: "בעלת העסק",
        type: "owner_alert",
        tenantId: p.tenantId,
      });
    } catch (waErr) {
      console.error("[bookingNotify] owner WhatsApp failed:", waErr?.message || String(waErr));
    }
  }
}
