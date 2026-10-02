// app/api/skin-scan/send/route.js
// Sends the skin report via WhatsApp to BOTH:
//   * the client (her personal report)
//   * the business owner (as a hot lead)
// Uses the existing lib/whatsapp.js sendWhatsApp() helper.
// Also saves the lead into the "leads" table (best-effort).

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { sendWhatsApp } from "../../../../lib/whatsapp";
import { notifyOwner } from "../../../../lib/ownerNotify.js";
import { upsertScanLead } from "../../../../lib/leads";
import { checkIpLimit, checkTenantLimit } from "../../../../lib/rateLimit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Build the client's nicely formatted report message
function buildClientMessage(report, businessName) {
  const lines = [];
  lines.push(`✨ *דוח העור שלך* ✨`);
  if (businessName) lines.push(`מ-${businessName}`);
  lines.push("");
  lines.push(`💯 *ציון העור:* ${report.score}/100`);
  lines.push(`🧴 *סוג עור:* ${report.skin_type}`);
  if (report.summary) { lines.push(""); lines.push(`💗 ${report.summary}`); }

  if (report.concerns?.length) {
    lines.push(""); lines.push(`🔍 *מה שזיהינו:*`);
    report.concerns.forEach((c) => lines.push(`• ${c}`));
  }
  if (report.routine_morning?.length) {
    lines.push(""); lines.push(`☀️ *שגרת בוקר:*`);
    report.routine_morning.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  }
  if (report.routine_evening?.length) {
    lines.push(""); lines.push(`🌙 *שגרת ערב:*`);
    report.routine_evening.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  }
  if (report.clinical_treatment) {
    lines.push(""); lines.push(`💉 *הטיפול המומלץ:* ${report.clinical_treatment}`);
    if (report.matched_service) lines.push(`   (אצלנו: ${report.matched_service})`);
  }
  lines.push(""); lines.push(`⚠️ הערכה קוסמטית כללית בלבד, אינה תחליף לייעוץ מקצועי.`);
  return lines.join("\n");
}

// Build the owner's lead-notification message
function buildOwnerMessage(report, clientName, clientPhone) {
  const lines = [];
  lines.push(`🔥 ליד חדש מסורק העור!`);
  lines.push("");
  if (clientName) lines.push(`👤 שם: ${clientName}`);
  lines.push(`📞 טלפון: ${clientPhone}`);
  lines.push(`💯 ציון עור: ${report.score}/100`);
  lines.push(`🧴 סוג עור: ${report.skin_type}`);
  if (report.clinical_treatment) lines.push(`💉 טיפול מומלץ: ${report.clinical_treatment}`);
  lines.push("");
  lines.push(`היא קיבלה את הדוח המלא לוואטסאפ. זה זמן מצוין ליצור קשר! 💗`);
  return lines.join("\n");
}

export async function POST(request) {
  try {
    // Tightest of the three caps, checked before the body is even read. Every
    // accepted call here sends TWO WhatsApp messages on the tenant's paid Green
    // API quota, so an unbounded version of this route is a way to spend a
    // cosmetician's money. See lib/rateLimit.ts.
    const ipLimited = checkIpLimit(request, "skin-scan-send");
    if (ipLimited) return ipLimited;

    const { report, clientName, clientPhone, tenantId } = await request.json();

    if (!report || !clientPhone) {
      return Response.json({ success: false, error: "חסרים פרטים" }, { status: 400 });
    }
    // Tenant must be explicit (the public scanner page passes ?t=<tenantId>).
    // No fallback: a scan with no tenant must fail rather than notify the wrong
    // business owner or save the lead into someone else's account.
    if (!tenantId) {
      return Response.json(
        { success: false, error: "קישור הסורק אינו תקין (חסר מזהה עסק)" },
        { status: 400 }
      );
    }

    // Per-tenant cap. Keyed on the business because the WhatsApp bill is, and
    // because it is the cap that survives a caller rotating addresses.
    const tenantLimited = checkTenantLimit(tenantId, "skin-scan-send");
    if (tenantLimited) return tenantLimited;

    // Business name for THIS tenant (per-tenant, from settings).
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name")
      .eq("tenant_id", tenantId)
      .limit(1);
    const settingsRow = settingsRows && settingsRows.length > 0 ? settingsRows[0] : null;
    const businessName = settingsRow?.business_name || "";

    // 1. The full report to the CLIENT. "skin_report" is a utility type - she
    //    asked for this and is waiting for it - so it sends automatically
    //    once the admin toggle is on, and falls back to the owner's manual
    //    queue (not lost) if the central number can't deliver it right now.
    const clientMsg = buildClientMessage(report, businessName);
    const clientResult = await sendWhatsApp(clientPhone, clientMsg, {
      name: clientName || "לקוחה",
      type: "skin_report",
      tenantId,
    });

    // 2. Hot-lead ping to the OWNER: in-app + push, not WhatsApp - same
    //    reasoning as bookingNotify/cancelNotify. No longer needs a phone.
    //    Scheduled via after(), not awaited: unlike the client report above,
    //    nothing in the response depends on this, so it must not be able to
    //    add its latency (or a failure) to what the visitor is waiting on.
    const ownerMsg = buildOwnerMessage(report, clientName, clientPhone);
    after(() =>
      notifyOwner({ tenantId, kind: "skin_hot_lead", title: "ליד חם מסורק העור", body: ownerMsg }).catch((e) => {
        console.error("[skin-scan/send] owner notify failed:", e?.message || String(e));
      })
    );

    // 3. Save/refresh the lead as a first-class "סורק העור" row (top-level
    //    phone/source/status/service_interest, deduped by tenant_id+phone).
    //    Best-effort — a lead failure never blocks anything above.
    try {
      await upsertScanLead(supabase, { tenantId, name: clientName, phone: clientPhone, report });
    } catch (leadErr) {
      console.error("Lead save (non-fatal):", leadErr.message);
    }

    // invalidPhone is a real failure (nothing to send, nothing to queue).
    // queued (manual mode, or the live send fell back) is NOT a failure - the
    // report is waiting in her WhatsApp queue, not lost - so the public page
    // must not tell its visitor "it didn't send".
    if (!clientResult.ok && clientResult.invalidPhone) {
      return Response.json(
        { success: false, error: "הדוח לא נשלח. בדקי שמספר הטלפון תקין." },
        { status: 502 }
      );
    }

    return Response.json({ success: true, queued: !!clientResult.queued });
  } catch (err) {
    console.error("skin-scan/send error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
