// app/api/cancel-notice/route.js
// She cancelled a client's appointment from the calendar: prepare the message
// that tells the client. Before this, a business-side cancel told nobody, and
// the client could turn up to a slot that no longer existed (2026-10-23 pass, E1).
//
// POST { appointmentId }. The appointment must be HERS and cancelled by the
// business. The message goes through sendWhatsApp like every other utility
// message: out from the central number when it is on, otherwise waiting in her
// "הודעות מוכנות לשליחה" queue for one tap. Demo tenants are blocked there.
//
// SECURITY: tenant from the session (get_user_tenant_id), never the body; the
// reads use the service key but always filter by that tenant.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { requireActiveTenant } from "../../../lib/planGuard";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { cancelNoticeText } from "../../../lib/cancelNotice.js";
import { fmtApptTime } from "../../../lib/apptTime";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await session.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return guard.response;

    const { appointmentId } = await request.json().catch(() => ({}));
    if (!appointmentId || typeof appointmentId !== "string") {
      return Response.json({ success: false, error: "חסר מזהה תור" }, { status: 400 });
    }

    const { data: appt, error: aErr } = await admin
      .from("appointments")
      .select("id, name, service, date, hour, start_minute, client_id, client_phone, cancelled_at, cancelled_by, confirmation_status")
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (aErr) return (console.error("[cancel-notice] read failed:", aErr.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));
    if (!appt) return Response.json({ success: false, error: "התור לא נמצא" }, { status: 404 });
    if (appt.confirmation_status !== "cancelled" || appt.cancelled_by === "client") {
      return Response.json({ success: false, error: "התור לא בוטל על ידך" }, { status: 409 });
    }

    let phone = appt.client_phone || "";
    if (appt.client_id) {
      const { data: c } = await admin.from("clients").select("phone").eq("id", appt.client_id).eq("tenant_id", tenantId).maybeSingle();
      if (c?.phone) phone = c.phone;
    }
    if (!phone) return Response.json({ success: false, error: "אין ללקוחה מספר טלפון" }, { status: 400 });

    const { data: st } = await admin.from("settings").select("business_name, therapist_name").eq("tenant_id", tenantId).maybeSingle();
    const msg = cancelNoticeText({
      clientName: appt.name,
      service: appt.service,
      date: appt.date,
      time: fmtApptTime(appt),
      businessName: st?.business_name || "",
      therapistName: st?.therapist_name || "",
    });

    const result = await sendWhatsApp(phone, msg, { name: appt.name, type: "cancel_notice", tenantId });
    if (result.queued) return Response.json({ success: true, queued: true, waLink: result.waLink });
    if (!result.ok) {
      return Response.json(
        { success: false, error: result.demoBlocked ? result.error : "WhatsApp send failed" },
        { status: result.demoBlocked ? 403 : 502 }
      );
    }
    return Response.json({ success: true });
  } catch (err) {
    return (console.error("[cancel-notice] failed:", err?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));
  }
}
