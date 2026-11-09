// lib/reviewVisit.js
//
// SERVER ONLY (reads the review signing secret through lib/reviewToken). The visit behind a signed /review link, for the two
// small routes the two-step page calls: /api/reviews/feedback (the answer) and /api/reviews/go (the tap to Google).
// /api/reviews keeps its own copy of the same check, written before this file.
//
// One answer for a bad id and a bad signature: telling them apart would let someone probe which appointment ids exist.

import { verifyReview } from "./reviewToken.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { appt } or { status, error } for the link's id and t. */
export async function resolveReviewVisit(admin, id, token) {
  if (!UUID_RE.test(String(id || "")) || !verifyReview(String(id), String(token || ""))) {
    return { status: 400, error: "הקישור אינו תקין" };
  }
  const { data, error } = await admin
    .from("appointments")
    .select("id, tenant_id, client_id, name, service, date, confirmation_status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[review-visit] appointment read failed:", error.message);
    return { status: 500, error: "לא הצלחנו לטעון את הפרטים" };
  }
  if (!data) return { status: 404, error: "התור לא נמצא" };
  return { appt: data };
}
