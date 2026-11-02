// app/api/reminders/handled/route.js
//
// POST { appointmentId } -> { success, closed }
// Called by the dashboard after a reminder she built in the browser ("שלחי תזכורת", "שליחה מרוכזת") opened in her WhatsApp. It
// tells the server so the daily cron does not queue the same reminder again, and dismisses a copy already waiting in her queue
// (lib/reminders/handled.js). Sends nothing.
//
// SECURITY: the tenant comes from the session (get_user_tenant_id), never from the body, and the appointment is loaded within it.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { markReminderHandled } from "../../../../lib/reminders/handled.js";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await session.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    const { appointmentId } = await request.json().catch(() => ({}));
    if (!appointmentId || !/^[0-9a-f-]{36}$/i.test(String(appointmentId))) {
      return Response.json({ success: false, error: "חסר מזהה תור" }, { status: 400 });
    }
    const db = admin();
    const { data: appt, error } = await db.from("appointments").select("id, date").eq("id", appointmentId).eq("tenant_id", tenantId).maybeSingle();
    if (error) return Response.json({ success: false, error: "משהו נתקע אצלנו" }, { status: 500 });
    if (!appt) return Response.json({ success: false, error: "התור לא נמצא" }, { status: 404 });

    const r = await markReminderHandled(db, { tenantId, appointmentId: appt.id, date: appt.date });
    return Response.json({ success: true, closed: r.closed });
  } catch (err) {
    console.error("[reminders/handled] failed:", err?.message);
    return Response.json({ success: false, error: "משהו נתקע אצלנו" }, { status: 500 });
  }
}
