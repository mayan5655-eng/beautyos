// app/api/send-reminder-manual/route.js
// Sends a ONE-OFF appointment reminder to a client via WhatsApp (GreenAPI),
// on demand from the dashboard. Mirrors the automatic cron reminder message
// (app/api/send-reminders) and the send-receipt route's per-tenant pattern.
// Multi-tenant: sends from the tenant's own GreenAPI instance (lib/whatsapp.js),
// and the appointment is loaded scoped to the caller's tenantId so a reminder
// can't be sent for another business's appointment.
//
// SECURITY: tenant comes from the AUTHENTICATED session (get_user_tenant_id),
// never the request body. This route runs on the service-role key, which
// bypasses RLS entirely, so a body-supplied tenantId would have made the
// `.eq("tenant_id", tenantId)` scoping below meaningless — any logged in user
// could pass another business's id and read that business's appointment, then
// message its client from its own GreenAPI instance. Mirrors the pattern in
// app/api/slots/offer/route.js. The client still posts a `tenantId` field; it
// is deliberately ignored.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { sendWhatsApp, isWhatsAppConnected } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://beautyos-theta.vercel.app";

export async function POST(request) {
  try {
    // Identify the caller and resolve THEIR tenant. Anything the body claims
    // about which business this is, is ignored.
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }
    const { data: tenantId } = await session.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    }

    const { appointmentId } = await request.json().catch(() => ({}));

    if (!appointmentId) {
      return Response.json({ success: false, error: "חסר מזהה תור" }, { status: 400 });
    }

    // Load the appointment scoped to THIS tenant (never cross-tenant).
    const { data: apptRows, error: apptErr } = await supabase
      .from("appointments")
      .select("id, name, service, date, hour, client_id, client_phone, tenant_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .limit(1);
    if (apptErr) {
      return Response.json({ success: false, error: apptErr.message }, { status: 500 });
    }
    const appt = apptRows && apptRows[0];
    if (!appt) {
      return Response.json({ success: false, error: "התור לא נמצא" }, { status: 404 });
    }

    // Resolve the phone: prefer the appointment's own, else the client's row.
    let phone = (appt.client_phone || "").trim();
    if (!phone && appt.client_id) {
      const { data: cl } = await supabase
        .from("clients")
        .select("phone")
        .eq("id", appt.client_id)
        .limit(1);
      phone = (cl && cl[0]?.phone ? String(cl[0].phone) : "").trim();
    }
    if (!phone) {
      return Response.json({ success: false, error: "אין ללקוחה מספר טלפון" }, { status: 400 });
    }

    // If neither the tenant's own GreenAPI nor the global env fallback is
    // configured, report it explicitly so the UI can use the wa.me fallback.
    if (!(await isWhatsAppConnected(tenantId))) {
      return Response.json(
        { success: false, notConnected: true, error: "וואטסאפ לא מחובר" },
        { status: 200 }
      );
    }

    // Business name from THIS tenant's settings (never trust the client).
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name")
      .eq("tenant_id", tenantId)
      .limit(1);
    const businessName = (settingsRows && settingsRows[0]?.business_name) || "העסק";

    // Same message as the automatic cron reminder, including confirm/cancel links.
    const confirmLink = `${APP_URL}/confirm?id=${appt.id}&action=confirm`;
    const cancelLink = `${APP_URL}/confirm?id=${appt.id}&action=cancel`;
    const message =
      `שלום ${appt.name}! 💆‍♀️ תזכורת לתור שלך ב-${businessName}:\n` +
      `📅 ${appt.date} בשעה ${appt.hour}:00\n` +
      `✨ טיפול: ${appt.service}\n\n` +
      `✅ לאישור התור: ${confirmLink}\n` +
      `🚫 לביטול התור: ${cancelLink}`;

    const result = await sendWhatsApp(phone, message, {
      name: appt.name,
      type: "reminder",
      tenantId,
    });

    if (!result.ok) {
      return Response.json({ success: false, error: "WhatsApp send failed" }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
