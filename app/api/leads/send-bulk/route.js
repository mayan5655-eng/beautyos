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
import { renderLeadTemplate } from "../../../../lib/leads/templates";
import { withMarketingFooter } from "../../../../lib/marketingConsent";
import { phoneVariants } from "../../../../lib/clientData";
import { IMPORT_SOURCE } from "../../../../lib/leads/buildRows";

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
    // Imported lists carry no evidence that anyone asked to hear from her (section 30A). They are held back
    // unless she states, for this send, that the people on the list agreed.
    const confirmedConsent = body.confirmedConsent === true;
    const leadIds = Array.isArray(body.leadIds)
      ? body.leadIds.filter((id) => typeof id === "string" && id)
      : null;

    if (!ALLOWED_STATUSES.includes(status)) {
      return Response.json({ success: false, error: "סטטוס לא תקין" }, { status: 400 });
    }
    if (!message) {
      return Response.json({ success: false, error: "עוד לא כתבת הודעה" }, { status: 400 });
    }
    if (leadIds && leadIds.length === 0) {
      return Response.json({ success: false, error: "לא נבחרו פניות" }, { status: 400 });
    }

    // 4. Load only THIS tenant's leads in the requested status.
    let query = admin
      .from("leads")
      // contact_attempts + first_contacted_at are read so the contact trail
      // below can be computed per row without a second query.
      .select("id, name, phone, status, source")
      .eq("tenant_id", tenantId)
      .eq("status", status);

    if (leadIds) query = query.in("id", leadIds);

    const { data: leads, error } = await query;

    if (error) {
      console.error("[leads/send-bulk] read failed:", error.message);
      return Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 });
    }

    // Nobody who asked to stop gets a promotional message: not a lead who replied "הסר" (leads.marketing_opted_out_at, added by
    // add_audit_hardening_2026-10-18.sql; until then this part is skipped), and not a number whose client card is opted out.
    const optedOutPhones = new Set();
    const optedOutLeadIds = new Set();
    try {
      const { data: oc } = await admin.from("clients").select("phone").eq("tenant_id", tenantId).not("marketing_opted_out_at", "is", null);
      for (const c of oc || []) for (const v of phoneVariants(c.phone)) optedOutPhones.add(v);
    } catch { /* column not there yet: nobody is opted out */ }
    try {
      const { data: ol, error: oe } = await admin.from("leads").select("id").eq("tenant_id", tenantId).not("marketing_opted_out_at", "is", null);
      if (!oe) for (const l of ol || []) optedOutLeadIds.add(l.id);
    } catch { /* same */ }
    const leadList = (leads || []).filter((l) => !optedOutLeadIds.has(l.id) && !phoneVariants(l.phone).some((v) => optedOutPhones.has(v)));
    const optedOutCount = (leads || []).length - leadList.length;

    // The business name, for {clinic}. One read for the whole batch; a missing
    // row just means the neutral fallback, which is what renderLeadTemplate
    // does with an empty settings object anyway.
    const { data: settingsRow } = await admin
      .from("settings")
      .select("business_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // 5. Send to each lead that has a phone. Leads with no phone are skipped
    //    (reported, not failed). One failure never aborts the batch.
    //
    //    The message arrives as the TEMPLATE, placeholders intact, and is
    //    rendered here once per recipient. That is the whole fix for the gap
    //    logged in REVIEW.md: substitution used to happen once in the
    //    composer, with no lead to substitute for a group, so every recipient
    //    got the same "לקוחה יקרה". A message she typed with no placeholders
    //    passes through renderLeadTemplate unchanged, so a literal message and
    //    a template take the same path and there is nothing to distinguish.
    // Lead outreach is never automatic (lib/whatsapp.js's UTILITY_TYPES does
    // not include "lead_bulk", by design - this is exactly the kind of
    // message the open-launch WhatsApp decision calls "outreach"). Every
    // call below comes back `queued`, with a wa.me link already composed
    // from the per-recipient rendered text; she taps each one herself. The
    // contact trail stamps on queue, not on a confirmed tap - the same trust
    // level the gap-fill/comeback "prepare" flows already use for the same
    // reason: there is no delivery receipt for a tap WhatsApp makes no
    // promise to report back on.
    let queued_count = 0;
    let failed = 0;
    let skipped_no_phone = 0;
    let skipped_no_consent = 0;
    const results = [];

    for (const lead of leadList) {
      if (!lead.phone) {
        skipped_no_phone++;
        results.push({ name: lead.name || null, status: "אין טלפון" });
        continue;
      }
      if (lead.source === IMPORT_SOURCE && !confirmedConsent) {
        skipped_no_consent++;
        results.push({ name: lead.name || null, status: "ללא אישור הסכמה לדיוור" });
        continue;
      }

      // Every bulk message carries the removal line (section 30A), once.
      const text = withMarketingFooter(renderLeadTemplate(message, lead, settingsRow || {}));
      const res = await sendWhatsApp(lead.phone, text, {
        name: lead.name,
        type: "lead_bulk",
        tenantId,
      });

      if (res.queued && res.waLink) {
        queued_count++;
        results.push({ leadId: lead.id, name: lead.name || null, status: "ממתין לשליחה ידנית", waLink: res.waLink });
      } else if (res.ok) {
        // Not reachable today (lead_bulk is never a utility type), kept so a
        // future type reclassification doesn't silently miscount.
        queued_count++;
        results.push({ leadId: lead.id, name: lead.name || null, status: "נשלח" });
      } else {
        failed++;
        results.push({ name: lead.name || null, status: "נכשל" });
      }
    }

    // 6. The contact trail is NOT stamped here. Nothing has been sent: these are wa.me links she has yet to
    //    tap. The sheet calls /api/leads/mark-contacted for each lead she actually opens.
    return Response.json({
      success: true,
      queued: queued_count,
      failed,
      skipped_no_phone,
      skipped_no_consent,
      skipped_opted_out: optedOutCount,
      results,
    });
  } catch (err) {
    return (console.error("[leads/send-bulk] failed:", err?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));
  }
}
