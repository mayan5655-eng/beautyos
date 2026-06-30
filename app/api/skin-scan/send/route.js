// app/api/skin-scan/send/route.js
// Sends the skin report via WhatsApp to BOTH:
//   * the client (her personal report)
//   * the business owner (as a hot lead)
// Uses the existing lib/whatsapp.js sendWhatsApp() helper.
// Also saves the lead into the "leads" table (best-effort).

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../../lib/whatsapp";

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

    // Business name + owner phone for THIS tenant (per-tenant, from settings).
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name, business_phone")
      .eq("tenant_id", tenantId)
      .limit(1);
    const settingsRow = settingsRows && settingsRows.length > 0 ? settingsRows[0] : null;
    const businessName = settingsRow?.business_name || "";
    const ownerPhone = settingsRow?.business_phone || "";

    // 1. Send the full report to the CLIENT
    const clientMsg = buildClientMessage(report, businessName);
    const clientResult = await sendWhatsApp(clientPhone, clientMsg, {
      name: clientName || "לקוחה",
      type: "skin_report",
      tenantId,
    });

    // 2. Send a hot-lead notification to the OWNER (only if she set a phone)
    if (ownerPhone) {
      const ownerMsg = buildOwnerMessage(report, clientName, clientPhone);
      await sendWhatsApp(ownerPhone, ownerMsg, {
        name: "בעלת העסק",
        type: "skin_lead_alert",
        tenantId,
      });
    }

    // 3. Save the lead so it shows up in the leads list (best-effort).
    try {
      await supabase.from("leads").insert({
        tenant_id: tenantId,
        name: clientName || "לקוחה מסורק העור",
        raw_form_data: {
          source: "skin_scanner",
          phone: clientPhone,
          score: report.score,
          skin_type: report.skin_type,
          recommended_treatment: report.clinical_treatment || "",
        },
        received_at: new Date().toISOString(),
      });
    } catch (leadErr) {
      console.error("Lead save (non-fatal):", leadErr.message);
    }

    if (!clientResult.ok) {
      return Response.json(
        { success: false, error: "הדוח לא נשלח. בדקי שמספר הטלפון תקין." },
        { status: 502 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("skin-scan/send error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
