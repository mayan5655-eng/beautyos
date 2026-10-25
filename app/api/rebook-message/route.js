// app/api/rebook-message/route.js
// "קבעי לה שוב", step 2: the message that tells the client about the visit she has just been booked for.
//
// POST { appointmentId, mode }
//   mode "preview" (default): builds the text and a wa.me link and returns them. Writes nothing, sends nothing: the
//        app opens the link in HER WhatsApp from a tap (the link is fetched BEFORE the tap, because Safari and the
//        Instagram browser block a window opened after an await).
//   mode "queue": keeps the same message in "הודעות מוכנות לשליחה" (status pending_manual) for her to send later.
//        forceManual: it is NEVER sent by the central number, even when that is connected: the owner decides.
//
// SECURITY: tenant from the session, never the body; the appointment must be hers, not cancelled, a real client with
// a phone. Demo tenants are blocked by sendWhatsApp for the queue; a preview of a demo appointment is harmless text.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { requireActiveTenant } from "../../../lib/planGuard";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { confirmLinks } from "../../../lib/confirmToken";
import { APP_URL } from "../../../lib/appUrl";
import { startMinute } from "../../../lib/apptTime";
import { waMsgLink } from "../../../lib/whatsappLink";
import { rebookMessageText } from "../../../lib/rebookMessage.js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const fail = (where, err) => (console.error(`[rebook-message] ${where} failed:`, err?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));

export async function POST(request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await session.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return guard.response;

    const { appointmentId, mode = "preview" } = await request.json().catch(() => ({}));
    if (!appointmentId || typeof appointmentId !== "string") {
      return Response.json({ success: false, error: "חסר מזהה תור" }, { status: 400 });
    }
    if (mode !== "preview" && mode !== "queue") {
      return Response.json({ success: false, error: "בקשה לא מוכרת" }, { status: 400 });
    }

    const { data: appt, error: aErr } = await admin
      .from("appointments")
      .select("id, name, service, date, hour, start_minute, duration, client_id, client_phone, confirmation_status")
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (aErr) return fail("read appointment", aErr);
    if (!appt) return Response.json({ success: false, error: "התור לא נמצא" }, { status: 404 });
    if (appt.confirmation_status === "cancelled") {
      return Response.json({ success: false, error: "התור הזה בוטל" }, { status: 409 });
    }

    let phone = appt.client_phone || "";
    if (appt.client_id) {
      const { data: c } = await admin.from("clients").select("phone").eq("id", appt.client_id).eq("tenant_id", tenantId).maybeSingle();
      if (c?.phone) phone = c.phone;
    }
    if (!phone) return Response.json({ success: false, error: "אין ללקוחה מספר טלפון" }, { status: 400 });

    const { data: st } = await admin.from("settings").select("business_name, branding").eq("tenant_id", tenantId).maybeSingle();
    const brand = st?.branding && typeof st.branding === "object" ? st.branding : {};
    const { confirmUrl, cancelUrl } = confirmLinks(APP_URL, appt.id, { date: appt.date });
    const text = rebookMessageText({
      name: appt.name,
      businessName: st?.business_name || "",
      service: appt.service,
      date: appt.date,
      startMinute: startMinute(appt),
      duration: Number(appt.duration) || 60,
      address: brand.public_address || brand.address,
      arrivalNote: brand.arrival_note,
      confirmUrl,
      cancelUrl,
    });
    const waLink = waMsgLink(phone, text);
    if (!waLink) return Response.json({ success: false, error: "מספר הטלפון של הלקוחה לא תקין" }, { status: 400 });

    if (mode === "preview") return Response.json({ success: true, text, waLink });

    const result = await sendWhatsApp(phone, text, { name: appt.name, type: "booking_confirm", tenantId, forceManual: true });
    if (result.demoBlocked) return Response.json({ success: false, error: result.error }, { status: 403 });
    if (!result.queued) return Response.json({ success: false, error: "לא הצלחנו לשמור את ההודעה" }, { status: 502 });
    return Response.json({ success: true, queued: true, messageId: result.messageId || null, waLink });
  } catch (err) {
    return fail("route", err);
  }
}
