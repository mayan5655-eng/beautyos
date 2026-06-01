// app/api/skin-scan/send/route.js
// Sends the skin report via WhatsApp to BOTH:
//   * the client (her personal report)
//   * the business owner (as a hot lead)
// Multi-tenant: the tenant is resolved from the `tenantId` sent by the
// scanner page (which reads it from the ?t= URL param). The owner's phone
// and business name are looked up per-tenant from the settings table.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fallback tenant (Maayan's) - used only if no tenant is provided in the request,
// so the scanner keeps working from the old plain URL without breaking.
const FALLBACK_TENANT_ID = "448e9e45-2251-4572-b665-886c5bc7a4c8";

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

    // Resolve the tenant: use the one sent from the scanner page, or fall back.
    const activeTenantId = tenantId || FALLBACK_TENANT_ID;

    // Look up THIS tenant's business name + owner phone from settings
    const settingsRes = await supabase
      .from("settings")
      .select("business_name, business_phone")
      .eq("tenant_id", activeTenantId)
      .limit(1);

    const settingsRow =
      settingsRes.data && settingsRes.data.length > 0 ? settingsRes.data[0] : null;
    const businessName = settingsRow?.business_name || "";
    const ownerPhone = settingsRow?.business_phone || "";

    // 1. Send the full report to the CLIENT
    const clientMsg = buildClientMessage(report, businessName);
    const clientResult = await sendWhatsApp(clientPhone, clientMsg, {
      name: clientName || "לקוחה",
      type: "skin_report",
      tenantId: activeTenantId,
    });

    // 2. Send a hot-lead notification to the OWNER (only if she has a phone set)
    if (ownerPhone) {
      const ownerMsg = buildOwnerMessage(report, clientName, clientPhone);
      await sendWhatsApp(ownerPhone, ownerMsg, {
        name: "בעלת העסק",
        type: "skin_lead_alert",
        tenantId: activeTenantId,
      });
    }

    // 3. Save the lead so it shows up in the leads list (best-effort).
    try {
      await supabase.from("leads").insert({
        tenant_id: activeTenantId,
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
