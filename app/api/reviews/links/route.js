// app/api/reviews/links/route.js
//
// POST { appointmentIds: string[] } -> { success, links: { [appointmentId]: url } }
//
// Signed review-form links for the manual "בקשת ביקורת" message in the app. The daily cron already puts the same link
// in its queued message (lib/reminders/smartReminders.js); the in-app message used to ask for a review with nowhere to
// write it. The link opens /review for that one visit, and what the client writes lands in public.reviews, the only
// reviews her public page shows.
//
// The secret never leaves the server: the browser gets finished URLs only, and only for appointments of HER business
// that already happened and were not cancelled. Nothing is sent from here.
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { reviewLink } from "../../../../lib/reviewToken";
import { APP_URL } from "../../../../lib/appUrl";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 50;

/** Today's date in Israel, YYYY-MM-DD. */
function todayIL(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
}

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    let body = {};
    try { body = await request.json(); } catch { /* empty body: no ids */ }
    const ids = [...new Set((Array.isArray(body?.appointmentIds) ? body.appointmentIds : []).map(String))]
      .filter((id) => UUID_RE.test(id))
      .slice(0, MAX_IDS);
    if (!ids.length) return Response.json({ success: true, links: {} });

    const { data, error } = await admin
      .from("appointments")
      .select("id, date, confirmation_status")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) {
      console.error("[reviews/links] read failed:", error.message);
      return Response.json({ success: false, error: "לא הצלחנו להכין את הקישורים" }, { status: 500 });
    }

    const today = todayIL();
    const links = {};
    for (const a of data || []) {
      if (a.confirmation_status === "cancelled") continue;
      if (!a.date || a.date > today) continue; // a visit that has not happened yet gets no review link
      try {
        links[a.id] = reviewLink(APP_URL, a.id);
      } catch {
        // No signing secret configured: no links at all, and the app falls back to her Google link or plain text.
        return Response.json({ success: true, links: {}, unavailable: true });
      }
    }
    return Response.json({ success: true, links });
  } catch (e) {
    console.error("[reviews/links] failed:", e instanceof Error ? e.message : "unknown");
    return Response.json({ success: false, error: "לא הצלחנו להכין את הקישורים" }, { status: 500 });
  }
}
