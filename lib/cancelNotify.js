// lib/cancelNotify.js
//
// When a CLIENT cancels through her link, the owner used to hear nothing: the
// slot simply reappeared in her calendar, and she found out by looking. This
// tells her, in the way a person would - who, which slot, that it is free again,
// and whether anyone is waiting for one like it.
//
// It never says it did something it did not do. The offer to the waiting list is
// lib/waitlistOffers.js (only when she turned it on, lib/waitlistFlag.js), which
// sends its own one-line report; this message only says whether it is on.
//
// No scolding: a late cancellation is not called out. The audit columns
// (cancelled_at) already keep that fact for her client card.

import { notifyOwner } from "./ownerNotify.js";
import { buildCancellationMessage, countMatchingWaiting } from "./cancelMessage.js";
import { startMinute } from "./apptTime";
import { waitlistOffersOn } from "./waitlistFlag.js";

/**
 * Best-effort: the appointment is already cancelled when this runs, and a
 * failed notification must never turn a successful cancellation into an
 * error. In-app + push now, not WhatsApp - she's not a client, and this used
 * to depend on business_phone being set purely as a WhatsApp delivery
 * address, which no longer applies.
 */
export async function notifyOwnerOfCancellation({ supabase, tenantId, appt }) {
  try {
    const [{ data: wl }, { data: settingsRow }] = await Promise.all([
      supabase.from("waitlist").select("service, status").eq("tenant_id", tenantId).eq("status", "waiting"),
      supabase.from("settings").select("business_phone, automations").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    const msg = buildCancellationMessage({
      name: appt.name,
      service: appt.service,
      date: appt.date,
      startMinute: startMinute(appt),
      duration: appt.duration,
      waiting: countMatchingWaiting(wl, appt.service),
      autoOffer: waitlistOffersOn(settingsRow),
    });
    await notifyOwner({ tenantId, kind: "cancellation", title: "ביטול תור", body: msg, appointmentId: appt.id, settingsRow });
  } catch (e) {
    console.error("[cancelNotify] owner alert failed:", e?.message || String(e));
  }
}
