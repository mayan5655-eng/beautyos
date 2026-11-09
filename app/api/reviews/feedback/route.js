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

    const prev = await admin.from("visit_feedback").select("id, mood, body").eq("appointment_id", appt.id).maybeSingle();
    if (prev.error) {
      if (isMissingFeedbackTable(prev.error)) return Response.json({ success: false, needsMigration: true }, { status: 503 });
      console.error("[reviews/feedback] read failed:", prev.error.message);
      return Response.json({ success: false, error: "לא הצלחנו לשמור, אפשר לנסות שוב" }, { status: 500 });
    }

    // ONE note per visit. Once she has written, the link cannot rewrite it or send another notification: a forwarded or
    // leaked link must not be a way to replace her words or to push note after note at the owner.
    if (prev.data?.body) return Response.json({ success: true, already: true });

    const nowIso = new Date().toISOString();
    let error;
    if (prev.data) {
      const patch = { mood, updated_at: nowIso };
      if (text) patch.body = text;
      // is(body, null): a note written by a parallel request in between is never overwritten.
      ({ error } = await admin.from("visit_feedback").update(patch).eq("appointment_id", appt.id).eq("tenant_id", appt.tenant_id).is("body", null));
    } else {
      ({ error } = await admin.from("visit_feedback").insert({
        tenant_id: appt.tenant_id, appointment_id: appt.id, client_id: appt.client_id || null,
        client_name: appt.name || "", mood, body: text || null,
      }));
      // Two taps at the same moment: the second insert meets the unique index. Retry as an update.
      if (error && error.code === "23505") {
        ({ error } = await admin.from("visit_feedback").update({ mood, updated_at: nowIso, ...(text ? { body: text } : {}) }).eq("appointment_id", appt.id).eq("tenant_id", appt.tenant_id).is("body", null));
      }
    }
    if (error) {
      console.error("[reviews/feedback] write failed:", error.message, error.code);
      return Response.json({ success: false, error: "לא הצלחנו לשמור, אפשר לנסות שוב" }, { status: 500 });
    }

    // Tell her, once per note: only when this request brought words that were not there before. In the app and as a push,
    // never a WhatsApp (it is about her client, read on her own screen).
    if (mood === "unhappy" && text && text !== String(prev.data?.body || "")) {
      const n = feedbackNotice({ clientName: appt.name || "", body: text });
      try {
        await notifyOwner({ tenantId: appt.tenant_id, kind: "visit_feedback", title: n.title, body: n.body, settingsRow: s, url: "/dashboard/feedback", whatsapp: false });
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
