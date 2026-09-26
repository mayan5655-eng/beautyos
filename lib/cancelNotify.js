// lib/cancelNotify.js
//
// When a CLIENT cancels through her link, the owner used to hear nothing: the
// slot simply reappeared in her calendar, and she found out by looking. This
// tells her, in the way a person would - who, which slot, that it is free again,
// and whether anyone is waiting for one like it.
//
// It never says it did something it did not do. In particular it does NOT offer
// the slot to the waiting list on her behalf: that would be sending messages in
// her name that she has not approved. It says who is waiting and leaves the
// decision, and the button, with her.
//
// No scolding: a late cancellation is not called out. The audit columns
// (cancelled_at) already keep that fact for her client card.

import { sendWhatsApp } from "./whatsapp";
import { buildCancellationMessage, countMatchingWaiting } from "./cancelMessage.js";
import { startMinute } from "./apptTime";

/**
 * Best-effort: the appointment is already cancelled when this runs, and a
 * failed message must never turn a successful cancellation into an error.
 */
export async function notifyOwnerOfCancellation({ supabase, tenantId, appt }) {
  try {
    const [{ data: st }, { data: wl }] = await Promise.all([
      supabase.from("settings").select("business_phone").eq("tenant_id", tenantId).maybeSingle(),
      supabase.from("waitlist").select("service, status").eq("tenant_id", tenantId).eq("status", "waiting"),
    ]);
    const ownerPhone = st?.business_phone || "";
    if (!ownerPhone) return;
    const msg = buildCancellationMessage({
      name: appt.name,
      service: appt.service,
      date: appt.date,
      startMinute: startMinute(appt),
      duration: appt.duration,
      waiting: countMatchingWaiting(wl, appt.service),
    });
    await sendWhatsApp(ownerPhone, msg, { name: "בעלת העסק", type: "owner_alert", tenantId });
  } catch (e) {
    console.error("[cancelNotify] owner alert failed:", e?.message || String(e));
  }
}
