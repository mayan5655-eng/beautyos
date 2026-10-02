// lib/ownerNotify.js
//
// Replaces WhatsApp-to-herself for the three owner-facing pings that used to
// go through sendWhatsApp (type: "owner_alert" for a new booking and a
// cancellation, "skin_lead_alert" for a hot skin-scan lead): she is not a
// client, and texting a human from an automated number for something she'll
// see the moment she opens the app is exactly the kind of message that made
// the shared number a ban risk in the first place, for zero benefit over an
// in-app notification she's already looking at.
//
// Two channels, both best-effort:
//   1. owner_notifications row - always written. This is the source of
//      truth; the dashboard reads it whether or not push is set up.
//   2. Web push - to every browser she's granted permission in
//      (push_subscriptions). Best-effort: a dead/expired subscription is
//      removed, never thrown over.
//
// `reportReminderFailures` (lib/reminders/failureReport.js) is NOT folded in
// here. It was retired outright, not converted - a failed utility send now
// falls back into the same manual WhatsApp queue she already opens the app
// to work through, so there is nothing left for a separate failure report to
// say that the queue itself doesn't already say.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isDemoTenantId } from "./demoTenants.ts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
let vapidConfigured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:support@kalmea.app", VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
}

/**
 * @param {object} p
 * @param {string} p.tenantId
 * @param {"new_booking"|"cancellation"|"skin_hot_lead"|"evening_summary"} p.kind
 * @param {string} p.title   short, shown as the push/notification title
 * @param {string} p.body    one or two lines, shown under the title
 * @param {string} [p.appointmentId]  so tapping the notification can open
 *   that appointment directly - the point of new_booking/cancellation.
 *   Omitted for kinds with no single appointment (skin_hot_lead,
 *   evening_summary).
 */
export async function notifyOwner({ tenantId, kind, title, body, appointmentId }) {
  if (!tenantId) return;
  // Same rule as sendWhatsApp: a demo tenant gets no fabricated row and no
  // real push attempt. Missed before today - a demo booking was writing a
  // real owner_notifications row (once the migration runs) for a tenant
  // nobody owns.
  if (isDemoTenantId(tenantId)) return;

  const { data: row, error } = await supabase
    .from("owner_notifications")
    .insert({ tenant_id: tenantId, kind, title, body, appointment_id: appointmentId || null })
    .select("id")
    .maybeSingle();
  if (error) {
    // The table may not exist yet if the migration hasn't been run - fail
    // silently rather than throw, same "best-effort" rule bookingNotify.js
    // and cancelNotify.js already followed for the WhatsApp sends this
    // replaces. Logged, not thrown: nothing here may ever block the booking
    // or cancellation it's reporting on.
    console.error("[ownerNotify] insert failed:", error.message);
  }

  await sendPushToTenant(tenantId, { title, body, notificationId: row?.id });
}

async function sendPushToTenant(tenantId, payload) {
  if (!vapidConfigured) return; // VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set yet
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("tenant_id", tenantId);
  if (error || !subs || subs.length === 0) return;

  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json
        );
      } catch (err) {
        // 404/410 = the browser revoked or the subscription expired. Any
        // other code is logged but the row is left alone - a transient
        // failure (e.g. a push service hiccup) is not evidence the
        // subscription is dead.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[ownerNotify] push failed:", err?.statusCode, err?.message || String(err));
        }
      }
    })
  );
}
