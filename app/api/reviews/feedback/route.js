// app/api/reviews/feedback/route.js
//
// POST ?id=<appointment>&t=<signature>  { mood: 'happy' | 'unhappy', text? }
//
// The answer to "איך היה?" on the two-step review page (lib/reviewRequests.ts). One row per visit in public.visit_feedback:
// the first tap writes it, a later tap or the note updates it, and once a note is written it is final (no rewrite, no second
// notification from the same link). An unhappy note reaches ONLY the business owner: an in-app notification and her
// /dashboard/feedback screen. Nothing is published and nothing is sent to anyone else.
//
// Before add_visit_feedback_2026-11-09.sql runs this answers 503 { needsMigration: true } and the page falls back to the stars
// form, so a client's words are never accepted and then dropped.

import { createClient } from "@supabase/supabase-js";
import { checkIpLimit } from "@/lib/rateLimit";
import { resolveReviewVisit } from "@/lib/reviewVisit";
import { isMood, cleanFeedback, isMissingFeedbackTable, feedbackNotice, reviewTwoStepOn } from "@/lib/reviewRequests";
import { notifyOwner } from "@/lib/ownerNotify";
import { saveVisitFeedback } from "@/lib/visitFeedbackWrite";

// JSON of a 1000 character note, escaped, with room to spare.
const MAX_FEEDBACK_BODY_BYTES = 16_000;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request) {
  const limited = checkIpLimit(request, "reviews");
  if (limited) return limited;
  try {
    const { searchParams } = new URL(request.url);
    const r = await resolveReviewVisit(admin, searchParams.get("id"), searchParams.get("t"));
    if (!r.appt) return Response.json({ success: false, error: r.error }, { status: r.status });
    const appt = r.appt;

    if (appt.confirmation_status === "cancelled" || appt.confirmation_status === "no_show") {
      return Response.json({ success: false, error: "התור הזה לא התקיים, אז אין עליו מה לספר" }, { status: 409 });
    }

    // A note is at most MAX_FEEDBACK characters; a body far past that is not a note.
    const raw = await request.text().catch(() => "");
    if (raw.length > MAX_FEEDBACK_BODY_BYTES) return Response.json({ success: false, error: "ההודעה ארוכה מדי" }, { status: 413 });
    let body = {};
    try { body = JSON.parse(raw); } catch { /* handled below */ }
    if (!isMood(body?.mood)) return Response.json({ success: false, error: "איך היה? אפשר לבחור תשובה" }, { status: 400 });
    const mood = body.mood;
    const text = mood === "unhappy" ? cleanFeedback(body?.text) : "";

    const { data: s } = await admin.from("settings").select("automations, business_phone").eq("tenant_id", appt.tenant_id).maybeSingle();
    if (!reviewTwoStepOn(s)) return Response.json({ success: false, error: "הקישור אינו תקין" }, { status: 404 });

    // The write and the race (two submissions of the same link at once) live in lib/visitFeedbackWrite.js: only the request
    // whose own write stored its own words gets noteCommitted, so the owner hears about a note exactly once.
    const w = await saveVisitFeedback(admin, appt, mood, text, { isMissingTable: isMissingFeedbackTable });
    if (w.status === "error") {
      if (w.missingTable) return Response.json({ success: false, needsMigration: true }, { status: 503 });
      console.error("[reviews/feedback] write failed:", w.error?.message, w.error?.code);
      return Response.json({ success: false, error: "לא הצלחנו לשמור, אפשר לנסות שוב" }, { status: 500 });
    }
    if (w.status === "already") return Response.json({ success: true, already: true });

    // Tell her, once per note. In the app and as a push, never a WhatsApp (it is about her client, read on her own screen).
    // onceForAppointment: with the unique index from add_visit_feedback_2026-11-09.sql, a second notification for the same
    // visit is refused by the database and no push goes out; before it runs, noteCommitted alone keeps it to one.
    if (mood === "unhappy" && text && w.noteCommitted) {
      const n = feedbackNotice({ clientName: appt.name || "", body: text });
      try {
        await notifyOwner({ tenantId: appt.tenant_id, kind: "visit_feedback", title: n.title, body: n.body, appointmentId: appt.id, settingsRow: s, url: "/dashboard/feedback", whatsapp: false, onceForAppointment: true });
      } catch (e) {
        console.error("[reviews/feedback] notify failed:", e?.message || String(e));
      }
    }
    return Response.json({ success: true });
  } catch (e) {
    console.error("[reviews/feedback] failed:", e?.message || String(e));
    return Response.json({ success: false, error: "לא הצלחנו לשמור, אפשר לנסות שוב" }, { status: 500 });
  }
}
