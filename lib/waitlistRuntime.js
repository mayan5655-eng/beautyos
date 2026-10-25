// lib/waitlistRuntime.js
//
// The real wiring for lib/waitlistOffers.js: the service-role client, sendWhatsApp, notifyOwner and the app's own URL. Routes call these
// two; the plain-node tests call the functions in waitlistOffers.js with fakes instead.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "./whatsapp.js";
import { notifyOwner } from "./ownerNotify.js";
import { APP_URL } from "./appUrl.ts";
import { offerFreedSlot, afterWaitlistWin } from "./waitlistOffers.js";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export function runWaitlistOffer({ tenantId, appt, db = admin() }) {
  return offerFreedSlot({ db, send: sendWhatsApp, notify: notifyOwner, tenantId, appt, baseUrl: APP_URL });
}

export function runWaitlistWin({ tenantId, token, claimed, db = admin() }) {
  return afterWaitlistWin({ db, send: sendWhatsApp, notify: notifyOwner, tenantId, token, claimed });
}
