// app/api/reviews/summary/route.js
//
// GET   what came back from her review requests in the last 30 days, for the LOGGED-IN owner (/dashboard/feedback and the
//       reviews card in Settings): how many were asked, how many tapped through to Google, how many reviews landed on her page,
//       and the private notes from clients who said something was less good (lib/reviewRequests.ts).
// POST  { id } marks one private note as read.
//
// The tenant comes from her session (get_user_tenant_id), never from the request. The reads use the service role, because
// visit_feedback and auto_reminders_log have no policy for her, and every one of them is filtered by that session tenant.
// The plan gate runs first (same reason as /api/weekly-digest): the reads below bypass RLS. Nothing is sent from here.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/planGuard";
import { isDemoTenantId } from "@/lib/demoTenants";
import { isMissingFeedbackTable, feedbackSummaryLine, FEEDBACK_NEEDS_MIGRATION_HE, israelDateBack } from "@/lib/reviewRequests";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sessionTenant() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { res: NextResponse.json({ success: false, error: "לא מחוברת" }, { status: 401 }) };
  const { data: tenantId } = await session.rpc("get_user_tenant_id");
  if (!tenantId) return { res: NextResponse.json({ success: false, error: "לא זוהה עסק" }, { status: 400 }) };
  if (!isDemoTenantId(String(tenantId))) {
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return { res: guard.response };
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return { tenantId: String(tenantId), admin };
}

export async function GET() {
  try {
    const s = await sessionTenant();
    if (s.res) return s.res;
    const { tenantId, admin } = s;
    const now = new Date();
    const sinceDay = israelDateBack(now, WINDOW_DAYS);
    const sinceIso = new Date(now.getTime() - WINDOW_DAYS * 864e5).toISOString();

    // Asked: review rows in the reminder log whose visit is inside the window (the log row's reference is the appointment id).
    const log = await admin.from("auto_reminders_log").select("reference_id").eq("tenant_id", tenantId).eq("reminder_type", "review");
    let requested = null;
    if (!log.error) {
      const ids = [...new Set((log.data || []).map((r) => String(r.reference_id || "")).filter((id) => UUID_RE.test(id)))];
      requested = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const ap = await admin.from("appointments").select("id").eq("tenant_id", tenantId).in("id", ids.slice(i, i + 200)).gte("date", sinceDay);
        if (ap.error) { requested = null; break; }
        requested += (ap.data || []).length;
      }
    }

    const rv = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", sinceIso);
    const inAppReviews = !rv.error && typeof rv.count === "number" ? rv.count : 0;

    const fb = await admin.from("visit_feedback")
      .select("id, appointment_id, client_id, client_name, mood, body, google_clicked_at, read_at, created_at")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
    if (fb.error) {
      if (!isMissingFeedbackTable(fb.error)) throw new Error(`feedback read failed: ${fb.error.message}`);
      const counts = { requested: requested || 0, happy: 0, unhappy: 0, googleClicks: 0, inAppReviews };
      return NextResponse.json({ success: true, available: false, needsMigration: FEEDBACK_NEEDS_MIGRATION_HE, counts, line: feedbackSummaryLine(counts), notes: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const rows = fb.data || [];
    const recent = rows.filter((r) => String(r.created_at || "") >= sinceIso);
    const counts = {
      requested: requested ?? recent.length,
      happy: recent.filter((r) => r.mood === "happy").length,
      unhappy: recent.filter((r) => r.mood === "unhappy").length,
      googleClicks: recent.filter((r) => !!r.google_clicked_at).length,
      inAppReviews,
    };

    // The private notes (all time, newest first, up to 50), with the visit and a phone so she can answer herself.
    const notes = rows.filter((r) => r.mood === "unhappy").slice(0, 50);
    const apptIds = [...new Set(notes.map((n) => n.appointment_id).filter(Boolean))];
    const clientIds = [...new Set(notes.map((n) => n.client_id).filter(Boolean))];
    const [ap, cl] = await Promise.all([
      apptIds.length ? admin.from("appointments").select("id, service, date").eq("tenant_id", tenantId).in("id", apptIds) : Promise.resolve({ data: [] }),
      clientIds.length ? admin.from("clients").select("id, phone").eq("tenant_id", tenantId).in("id", clientIds) : Promise.resolve({ data: [] }),
    ]);
    const apptById = new Map((ap.data || []).map((a) => [String(a.id), a]));
    const phoneById = new Map((cl.data || []).map((c) => [String(c.id), c.phone || ""]));
    const out = notes.map((n) => ({
      id: n.id,
      clientName: n.client_name || "",
      body: n.body || "",
      createdAt: n.created_at,
      read: !!n.read_at,
      service: apptById.get(String(n.appointment_id))?.service || "",
      date: apptById.get(String(n.appointment_id))?.date || "",
      phone: phoneById.get(String(n.client_id)) || "",
    }));
    return NextResponse.json({ success: true, available: true, counts, line: feedbackSummaryLine(counts), notes: out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[reviews/summary] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: "לא הצלחנו לטעון, אפשר לנסות שוב בעוד רגע" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const s = await sessionTenant();
    if (s.res) return s.res;
    let body = {};
    try { body = await request.json(); } catch { /* handled below */ }
    const id = String(body?.id || "");
    if (!UUID_RE.test(id)) return NextResponse.json({ success: false, error: "חסר מזהה" }, { status: 400 });
    const { data, error } = await s.admin.from("visit_feedback").update({ read_at: new Date().toISOString() })
      .eq("id", id).eq("tenant_id", s.tenantId).select("id");
    if (error) {
      if (isMissingFeedbackTable(error)) return NextResponse.json({ success: false, error: FEEDBACK_NEEDS_MIGRATION_HE }, { status: 503 });
      throw new Error(error.message);
    }
    if (!(data || []).length) return NextResponse.json({ success: false, error: "ההערה לא נמצאה" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[reviews/summary] mark read failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: "לא הצלחנו לשמור, אפשר לנסות שוב" }, { status: 500 });
  }
}
