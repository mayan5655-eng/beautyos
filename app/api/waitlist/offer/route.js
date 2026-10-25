// app/api/waitlist/offer/route.js
//
// She cancelled an appointment in the app: offer the freed slot to the waiting list (lib/waitlistOffers.js). The app calls this after its
// undo window, so a cancellation she took back never offers anything. Session-authenticated: the tenant comes from her session, the
// appointment is read here and must be hers and really cancelled. Does nothing unless Settings > הודעות > "הצעה אוטומטית לרשימת ההמתנה" is on.
// (A client's own cancel link reaches the same code from app/api/confirm, after its own checks.)

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { requireActiveTenant } from "../../../../lib/planGuard";
import { runWaitlistOffer } from "../../../../lib/waitlistRuntime.js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    const guard = await requireActiveTenant(supabase);
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const appointmentId = String(body.appointmentId || "");
    if (!UUID.test(appointmentId)) return Response.json({ success: false, error: "תור לא תקין" }, { status: 400 });
    const { data: appt, error } = await admin.from("appointments").select("*").eq("id", appointmentId).eq("tenant_id", tenantId).maybeSingle();
    if (error) return Response.json({ success: false, error: "לא הצלחנו לקרוא את התור" }, { status: 500 });
    if (!appt) return Response.json({ success: false, error: "התור לא נמצא" }, { status: 404 });
    // Restored in the meantime (the undo): nothing to offer.
    if (appt.confirmation_status !== "cancelled") return Response.json({ success: true, status: "not_cancelled", offered: 0 });

    const r = await runWaitlistOffer({ tenantId, appt: { ...appt, client_phone: appt.client_phone || null }, db: admin });
    return Response.json({ success: true, ...r });
  } catch (err) {
    console.error("[waitlist/offer] failed:", err?.message || String(err));
    return Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 });
  }
}
