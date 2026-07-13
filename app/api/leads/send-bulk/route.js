// app/api/leads/send-bulk/route.js
// Sends a WhatsApp message to EVERY lead in a given manual status, for the
// LOGGED-IN cosmetician's tenant only.
//
// SECURITY: the tenant is resolved from the AUTHENTICATED session
// (get_user_tenant_id() over the user's cookies) - never from a client-supplied
// param. The read of leads uses the service-role key (to bypass RLS) but is
// always filtered by the session-derived tenant_id, so one business can never
// message another's leads. Sending + logging reuse lib/whatsapp.js sendWhatsApp
// (GreenAPI), exactly like send-reminders/route.js.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { sendWhatsApp } from "../../../../lib/whatsapp";

// Service-role client for reading the tenant's leads (bypasses RLS; always
// filtered by the session-derived tenant_id below).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The canonical manual statuses a bulk send may target. Mirrors LEAD_STATUSES
// in app/dashboard/leads/LeadsClient.tsx.
const ALLOWED_STATUSES = [
  "no_answer",
  "in_progress",
  "scheduled",
  "no_show",
  "closed",
  "irrelevant",
];

export async function POST(request) {
  try {
    // 1. Identify the caller from their session cookies.
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }

    // 2. Resolve THEIR tenant with the same RPC the RLS policies use.
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    }

    // 3. Validate the request body.
    const body = await request.json().catch(() => ({}));
    const status = body.status;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!ALLOWED_STATUSES.includes(status)) {
      return Response.json({ success: false, error: "סטטוס לא תקין" }, { status: 400 });
    }
    if (!message) {
      return Response.json({ success: false, error: "נא לכתוב הודעה" }, { status: 400 });
    }

    // 4. Load only THIS tenant's leads in the requested status.
    const { data: leads, error } = await admin
      .from("leads")
      .select("id, name, phone, status")
      .eq("tenant_id", tenantId)
      .eq("status", status);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    // 5. Send to each lead that has a phone. Leads with no phone are skipped
    //    (reported, not failed). One failure never aborts the batch.
    let sent = 0;
    let failed = 0;
    let skipped_no_phone = 0;
    const results = [];

    for (const lead of leads || []) {
      if (!lead.phone) {
        skipped_no_phone++;
        results.push({ name: lead.name || null, status: "אין טלפון" });
        continue;
      }

      const res = await sendWhatsApp(lead.phone, message, {
        name: lead.name,
        type: "lead_bulk",
        tenantId,
      });

      if (res.ok) {
        sent++;
        results.push({ name: lead.name || null, status: "נשלח" });
      } else {
        failed++;
        results.push({ name: lead.name || null, status: "נכשל" });
      }
    }

    return Response.json({
      success: true,
      sent,
      failed,
      skipped_no_phone,
      results,
    });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
