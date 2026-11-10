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

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "./whatsapp";
import { displayName } from "./personName.js";
import { notifyOwner } from "./ownerNotify.js";
import { confirmLinks } from "./confirmToken";
import { APP_URL } from "./appUrl";
import { lines, hebrewDate, hebrewDateShort, timeRange, durationHe, mapsLink } from "./messages.js";
import { resolveBookingRules, cancelLinesHe } from "./bookingPolicy";
import { autoConfig } from "./waCloud/autoConfig.ts";
import { sendAutoMessage, autoTookIt } from "./waCloud/auto.ts";
import { autoParams } from "./waCloud/autoContent.ts";
import { isYomTov } from "./greetings/calendar.ts";

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
 * @param {"public_page"|"gap_fill_claim"} [p.source="public_page"]  which
 *   channel created this appointment - its own line in the owner alert, kept
 *   separate from isReturningClient so neither fact erases the other (a
 *   previous version used one line for both, so a returning client's gap-
 *   fill claim silently lost "which channel" and a new client's public
 *   booking silently lost nothing, which was the asymmetry that gave it
 *   away - the source line was never shown for the common case).
 * @param {boolean} [p.underCancelPolicy]  the client agreed to a Grow
 *   cancellation policy for this booking: her link always cancels (a late
 *   cancel has a fee), so the cancellation-window sentence does not apply.
 */
let _admin = null;
function getAdmin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _admin;
}

/**
 * The automatic confirmation (lib/waCloud/auto.ts). { handled: true, ok } when nothing else may go out (sent, already sent,
 * or held to 08:00); { queue: true } when it was refused and the message belongs in her manual queue; { handled: false } when
 * the feature is off for her: the ordinary path, unchanged. With WA_AUTO_ENABLED unset it returns at the first line, before
 * any read.
 */
async function autoBookingConfirm(p, settingsRow) {
  if (!autoConfig().enabled || !p.appointmentId || !p.tenantId) return { handled: false };
  try {
    const out = await sendAutoMessage({
      db: getAdmin(), tenantId: p.tenantId, kind: "booking_confirm", appointmentId: p.appointmentId, phone: p.phone, name: p.name, apptDate: p.date,
      params: autoParams({ id: p.appointmentId, name: p.name, service: p.service, date: p.date, start_minute: p.startMinute, duration: p.duration }, settingsRow),
      // Her automations when the caller's row carries them; otherwise auto.ts reads them.
      settingsRow: settingsRow && "automations" in settingsRow ? settingsRow : undefined,
      isYomTov,
    });
    // ok only for a real send: a held confirmation leaves confirmation_sent false until the morning run sends it.
    if (autoTookIt(out)) return { handled: true, ok: out.outcome === "sent" };
    // Refused by the gate (ceilings, the platform switch, her pause) or by Meta: her manual queue, never another automatic send.
    if (out.outcome === "fallback" || out.outcome === "paused") return { handled: false, queue: true };
  } catch (e) {
    // Unknown state (the gate may not have run): her manual queue, never an unguarded automatic send.
    console.error("[bookingNotify] automatic confirmation failed, her manual queue instead:", e?.message || String(e));
    return { handled: false, queue: true };
  }
  return { handled: false };
}

export async function sendBookingNotifications(p) {
  const settingsRow = p.settingsRow || {};
  const businessName = settingsRow.business_name || "העסק";

  const brandJson =
    settingsRow.branding && typeof settingsRow.branding === "object" ? settingsRow.branding : {};
  const address = String(brandJson.public_address || brandJson.address || "").trim();
  const arrivalNote = String(brandJson.arrival_note || "").trim();
  const therapist = displayName(settingsRow.therapist_name); // never a login handle: lib/personName.js
  const durationText = durationHe(p.duration);

  // Client confirmation. What she needs, in the order she needs it: what she
  // booked and how long it takes, when, where, with whom, anything she
  // should know before she arrives, and how to get out of it. The cancel
  // link is the point - see the long comment at the original site in
  // /api/book-appointment.
  //
  // Opens with the flower mark (🌸), not shared greet()'s ✦ - that mark is
  // the old BloomOS one, replaced everywhere else in the product already.
  // Written inline rather than changing greet() itself, which every other
  // message (reminders included) still uses on purpose - only this one
  // message was called out.
  try {
    // Dated: the cancel link dies three days after the visit, not never.
    const { cancelUrl } = confirmLinks(APP_URL, p.appointmentId, { date: p.date });
    const nameStr = String(p.name || "").trim();
    // What the cancel link will really do (lib/bookingPolicy.ts cancelLinesHe): inside her cancellation window it refuses,
    // so the one-tap promise is only made when she set no window. A booking made already inside the window gets no link at
    // all (it could never cancel), only "ביטול רק ישירות מול ..." (2026-11-09).
    const cancelCopy = cancelLinesHe(resolveBookingRules(brandJson), { underPolicy: p.underCancelPolicy === true, businessName, slot: { date: p.date, startMinute: p.startMinute } });
    const clientMsg = lines(
      nameStr ? `שלום ${nameStr}! 🌸` : `שלום! 🌸`,
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
      cancelCopy.before,
      cancelCopy.showLink ? cancelUrl : null,
      cancelCopy.after,
      "",
      `להתראות,\n${businessName}`
    );
    // The automatic confirmation through Meta's Cloud API, with a cancel button (lib/waCloud/auto.ts). Dormant unless
    // WA_AUTO_ENABLED=true and she turned it on herself; then 'sent' / 'duplicate' / 'deferred' (held to 08:00) mean
    // nothing else goes out, a refusal goes to her manual queue, and anything else is exactly the path below.
    const auto = await autoBookingConfirm(p, settingsRow);
    const sent = auto.handled ? auto : await sendWhatsApp(p.phone, clientMsg, {
      ...(auto.queue ? { forceManual: true } : {}),
      name: p.name,
      type: "booking_confirm",
      tenantId: p.tenantId,
      // Parameters of the kalmea_booking_confirmation template (lib/waCloud/templates.ts), used only when the
      // official Cloud route is on (WA_CLOUD_ENABLED). The text above stays the GreenAPI / manual-queue message.
      cloudParams: [nameStr || "יקרה", businessName, durationText ? `${p.service} · ${durationText}` : p.service, `${hebrewDate(p.date)}, ${timeRange(p.startMinute, p.duration)}`, cancelUrl],
    });
    // confirmation_sent is only true once the send actually went through. The booking route writes false, so a booking
    // whose message could not go out (number not connected, queued) shows in her "not sent" lists instead of looking handled.
    if (sent && sent.ok && !sent.queued && p.appointmentId) {
      try {
        const { error: flagErr } = await getAdmin().from("appointments").update({ confirmation_sent: true }).eq("id", p.appointmentId).eq("tenant_id", p.tenantId);
        if (flagErr) console.error("[bookingNotify] confirmation_sent flag failed:", flagErr.message);
      } catch (flagEx) { console.error("[bookingNotify] confirmation_sent flag failed:", flagEx?.message || String(flagEx)); }
    }
  } catch (waErr) {
    console.error("[bookingNotify] client WhatsApp failed:", waErr?.message || String(waErr));
  }

  // Owner alert: in-app + push, not WhatsApp - she's not a client, and this
  // no longer depends on business_phone being set. First line answers the
  // only question she has mid-treatment: WHEN, and does it collide with
  // anything. Source and returning/new status are each their own line - see
  // the JSDoc above for why they used to collapse into one and lose a fact.
  try {
    const sourceLabel = p.source === "gap_fill_claim" ? "מהצעת תור שהתפנה" : "מהדף הציבורי";
    const ownerMsg = lines(
      `תור חדש · ${hebrewDateShort(p.date)}, ${timeRange(p.startMinute, p.duration)}`,
      `${p.name} · ${p.service}${durationText ? ` (${durationText})` : ""}`,
      p.phone,
      `${sourceLabel} · ${p.isReturningClient ? "לקוחה חוזרת" : "לקוחה חדשה"}`
    );
    await notifyOwner({ tenantId: p.tenantId, kind: "new_booking", title: "תור חדש", body: ownerMsg, appointmentId: p.appointmentId, settingsRow });
  } catch (err) {
    console.error("[bookingNotify] owner alert failed:", err?.message || String(err));
  }
}
