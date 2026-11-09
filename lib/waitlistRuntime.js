// lib/waitlistRuntime.js
//
// The real wiring for lib/waitlistOffers.js: the service-role client, sendWhatsApp, notifyOwner and the app's own URL. Routes call these
// two; the plain-node tests call the functions in waitlistOffers.js with fakes instead.

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { sendWhatsApp } from "./whatsapp.js";
import { notifyOwner } from "./ownerNotify.js";
import { APP_URL } from "./appUrl.ts";
import { offerFreedSlot, afterWaitlistWin } from "./waitlistOffers.js";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export function runWaitlistOffer({ tenantId, appt, db = admin() }) {
  return offerFreedSlot({ db, send: sendWhatsApp, notify: notifyOwner, tenantId, appt, baseUrl: APP_URL });
}

/**
 * A slot freed by the system rather than by a person: a deposit hold that ran out unpaid (lib/grow/cancelFees.ts releaseExpiredHolds).
 * Reads the appointment and offers it only if it really is cancelled now. Never throws.
 */
export async function runWaitlistOfferForAppointment({ tenantId, appointmentId, db = admin() }) {
  try {
    const { data: appt, error } = await db.from("appointments").select("*").eq("id", appointmentId).eq("tenant_id", tenantId).maybeSingle();
    if (error || !appt) return { status: "appointment_unreadable", offered: 0 };
    if (appt.confirmation_status !== "cancelled") return { status: "not_cancelled", offered: 0 };
    return await offerFreedSlot({ db, send: sendWhatsApp, notify: notifyOwner, tenantId, appt, baseUrl: APP_URL });
  } catch (e) {
    console.error("[waitlistRuntime] offer after release failed:", e?.message || String(e));
    return { status: "error", offered: 0 };
  }
}

/**
 * The releaseExpiredHolds hook (cron, availability, booking): schedule the offer with after(), so a released hold never delays the
 * response that released it. Only call inside a request.
 */
export function offerFreedHold(tenantId, appointmentId) {
  try { after(() => runWaitlistOfferForAppointment({ tenantId, appointmentId }).then(() => undefined)); } catch (e) { console.warn("[waitlistRuntime] could not schedule the offer:", e?.message || String(e)); }
}

export function runWaitlistWin({ tenantId, token, claimed, db = admin() }) {
  return afterWaitlistWin({ db, send: sendWhatsApp, notify: notifyOwner, tenantId, token, claimed });
}
