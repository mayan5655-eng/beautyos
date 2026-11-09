// app/api/reviews/go/route.js
//
// GET ?id=<appointment>&t=<signature>  ->  302 to the business's Google review link.
//
// The Google button on the two-step review page goes through here so the tap can be counted (visit_feedback.google_clicked_at),
// which is what lets her see "3 עברו לגוגל". A tap is not a review: Google does not tell anyone who wrote one, and the count is
// worded as a tap everywhere it is shown.
//
// Counting never stands between the client and Google: a missing table or a failed write still redirects. A bad link goes back
// to the review page; a business without a valid Google link goes to her own booking page.
//
// NOT AN OPEN REDIRECT: the target never comes from the query. It is her saved settings.review_url, looked up server side for
// the tenant of the appointment the signed token names, and only when lib/reviewRequests googleReviewUrlOf accepts it (https on
// a Google host). The same check runs when she saves the link (/api/settings/save), so a stored non-Google link never leaves.

import { createClient } from "@supabase/supabase-js";
import { checkIpLimit } from "@/lib/rateLimit";
import { resolveReviewVisit } from "@/lib/reviewVisit";
import { googleReviewUrlOf, isMissingFeedbackTable } from "@/lib/reviewRequests";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request) {
  const limited = checkIpLimit(request, "reviews");
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const t = searchParams.get("t") || "";
  // Back to the review page on the same host the link was opened on.
  const back = new URL(`/review?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`, request.url).toString();
  try {
    const r = await resolveReviewVisit(admin, id, t);
    if (!r.appt) return Response.redirect(new URL("/review", request.url).toString(), 302);
    const appt = r.appt;
    const { data: s } = await admin.from("settings").select("review_url").eq("tenant_id", appt.tenant_id).maybeSingle();
    const url = googleReviewUrlOf(s?.review_url);
    // No valid Google link: her booking page on our own host, never the stored value.
    if (!url) return Response.redirect(new URL(`/book?t=${encodeURIComponent(appt.tenant_id)}`, request.url).toString(), 302);

    if (appt.confirmation_status !== "cancelled" && appt.confirmation_status !== "no_show") {
      try {
        const nowIso = new Date().toISOString();
        const upd = await admin.from("visit_feedback").update({ google_clicked_at: nowIso, updated_at: nowIso })
          .eq("appointment_id", appt.id).eq("tenant_id", appt.tenant_id).is("google_clicked_at", null).select("id");
        if (upd.error && !isMissingFeedbackTable(upd.error)) console.error("[reviews/go] count failed:", upd.error.message);
        // No row yet (she went straight to the button): the tap itself says she was happy enough to review publicly.
        if (!upd.error && (upd.data || []).length === 0) {
          const exists = await admin.from("visit_feedback").select("id").eq("appointment_id", appt.id).maybeSingle();
          if (!exists.error && !exists.data) {
            await admin.from("visit_feedback").insert({
              tenant_id: appt.tenant_id, appointment_id: appt.id, client_id: appt.client_id || null,
              client_name: appt.name || "", mood: "happy", google_clicked_at: nowIso,
            });
          }
        }
      } catch (e) {
        console.error("[reviews/go] count threw:", e?.message || String(e));
      }
    }
    return Response.redirect(url, 302);
  } catch (e) {
    console.error("[reviews/go] failed:", e?.message || String(e));
    return Response.redirect(back, 302);
  }
}
