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
import { requireActiveTenant } from "../../../../lib/planGuard";
import { sendWhatsApp } from "../../../../lib/whatsapp";
import { LEAD_STATUS_KEYS } from "../../../../lib/leads/statuses";

// Service-role client for reading the tenant's leads (bypasses RLS; always
// filtered by the session-derived tenant_id below).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The canonical manual statuses a bulk send may target. Imported so the API can
// never drift from what the UIs offer - the failure mode this refactor removes.
const ALLOWED_STATUSES = LEAD_STATUS_KEYS;

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

    // Plan gate: a lapsed or paused tenant cannot send real messages. Placed
    // before any sending work. Fails open, so it cannot lock out a paying user.
    const guard = await requireActiveTenant(supabase);
    if (!guard.ok) return guard.response;

    // 3. Validate the request body.
    const body = await request.json().catch(() => ({}));
    const status = body.status;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    // Optional: restrict this send to specific leads (the per-lead one-click
    // send). Applied AFTER the tenant and status filters below, so it can only
    // ever narrow the group - never widen it or reach another tenant's leads.
    const leadIds = Array.isArray(body.leadIds)
      ? body.leadIds.filter((id) => typeof id === "string" && id)
      : null;

    if (!ALLOWED_STATUSES.includes(status)) {
      return Response.json({ success: false, error: "סטטוס לא תקין" }, { status: 400 });
    }
    if (!message) {
      return Response.json({ success: false, error: "נא לכתוב הודעה" }, { status: 400 });
    }
    if (leadIds && leadIds.length === 0) {
      return Response.json({ success: false, error: "לא נבחרו פניות" }, { status: 400 });
    }

    // 4. Load only THIS tenant's leads in the requested status.
    let query = admin
      .from("leads")
      // contact_attempts + first_contacted_at are read so the contact trail
      // below can be computed per row without a second query.
      .select("id, name, phone, status, contact_attempts, first_contacted_at")
      .eq("tenant_id", tenantId)
      .eq("status", status);

    if (leadIds) query = query.in("id", leadIds);

    const { data: leads, error } = await query;

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    // 5. Send to each lead that has a phone. Leads with no phone are skipped
    //    (reported, not failed). One failure never aborts the batch.
    let sent = 0;
    let failed = 0;
    let skipped_no_phone = 0;
    const results = [];
    // Leads we actually reached, for the contact trail written after the loop.
    const contacted = [];

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
        contacted.push(lead);
        results.push({ name: lead.name || null, status: "נשלח" });
      } else {
        failed++;
        results.push({ name: lead.name || null, status: "נכשל" });
      }
    }

    // 6. Stamp the contact trail, successes only - a failed message must never
    //    claim she made contact. Each row needs its own values (its own attempt
    //    count, and first_contacted_at only when it was empty), so these go out
    //    as one awaited batch of concurrent updates rather than a single
    //    statement. Updates, not upsert: a row deleted between the select and
    //    the write must no-op, never be re-inserted half-empty.
    if (contacted.length > 0) {
      const nowIso = new Date().toISOString();
      const writes = await Promise.all(
        contacted.map((lead) =>
          admin
            .from("leads")
            .update({
              last_contacted_at: nowIso,
              first_contacted_at: lead.first_contacted_at || nowIso,
              contact_attempts: (Number(lead.contact_attempts) || 0) + 1,
            })
            .eq("id", lead.id)
            .eq("tenant_id", tenantId)
        )
      );
      // Never fail the response over this: the messages already went out.
      const stampFailures = writes.filter((w) => w.error).length;
      if (stampFailures) {
        console.error(
          `[send-bulk] contact trail: ${stampFailures}/${contacted.length} updates failed`,
          writes.find((w) => w.error)?.error?.message
        );
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
