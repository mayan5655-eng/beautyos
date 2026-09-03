// app/api/reviews/route.js
//
// Where a client's review is written, and the only place one can be.
//
// public.reviews has no insert policy for `authenticated`, deliberately: the
// cosmetician cannot write herself a five-star review through the app at all.
// This route holds the service key, which bypasses RLS, and is therefore the
// single writer - so everything that makes a review trustworthy has to be
// enforced here or in the table's own constraints, and nowhere else.
//
// GET  — what the form needs to render: whose business, which treatment, and
//        whether this visit has already been reviewed.
// POST — the review itself.
//
// Both require the signed token. The appointment id alone is not enough: it
// travels in the same WhatsApp thread as the confirm and cancel links, so
// without a signature anyone holding one of those could review on that client's
// behalf, and anyone could walk ids to post against a business at will.

import { createClient } from "@supabase/supabase-js";
import { verifyReview } from "../../../lib/reviewToken";
import { checkIpLimit } from "../../../lib/rateLimit";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The appointment behind a valid token, or a Response explaining why not. */
async function resolve(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const token = searchParams.get("t") || "";

  if (!UUID_RE.test(id) || !verifyReview(id, token)) {
    // One message for a bad id and a bad signature. Telling them apart would
    // let someone probe which appointment ids exist.
    return { error: Response.json({ success: false, error: "הקישור אינו תקין" }, { status: 400 }) };
  }

  const { data, error } = await admin
    .from("appointments")
    .select("id, tenant_id, client_id, name, service, date, confirmation_status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[reviews] appointment read failed:", error.message);
    return { error: Response.json({ success: false, error: "לא הצלחנו לטעון את הפרטים" }, { status: 500 }) };
  }
  if (!data) {
    return { error: Response.json({ success: false, error: "התור לא נמצא" }, { status: 404 }) };
  }
  return { appt: data };
}

export async function GET(request) {
  const limited = checkIpLimit(request, "reviews");
  if (limited) return limited;

  const { appt, error } = await resolve(request);
  if (error) return error;

  const { data: existing } = await admin
    .from("reviews")
    .select("id, rating, body")
    .eq("appointment_id", appt.id)
    .maybeSingle();

  // business_name and review_url only, and never more: this response goes to
  // an unauthenticated browser, so the column list is the enforcement.
  const { data: s } = await admin
    .from("settings")
    .select("business_name, review_url, branding")
    .eq("tenant_id", appt.tenant_id)
    .maybeSingle();

  return Response.json({
    success: true,
    businessName: s?.business_name || "",
    // The same public logo the booking page shows; nothing else from branding.
    logoUrl: (s?.branding && s.branding.logo_url) || "",
    // Offered AFTER she has written something here, and offered to everyone
    // regardless of what she wrote. Showing it only to people who left four or
    // five stars is review gating, which Google's policy prohibits outright.
    googleReviewUrl: String(s?.review_url || "").trim(),
    clientName: appt.name || "",
    service: appt.service || "",
    date: appt.date || "",
    // Not an error. She tapped a link she already used, which is a thing people
    // do, and the form should show her what she wrote rather than a failure.
    existing: existing ? { rating: existing.rating, body: existing.body } : null,
  });
}

export async function POST(request) {
  const limited = checkIpLimit(request, "reviews");
  if (limited) return limited;

  const { appt, error } = await resolve(request);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch { /* handled below */ }

  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ success: false, error: "נא לבחור דירוג" }, { status: 400 });
  }

  // A rating with no words is a perfectly good review; the text is optional.
  // Capped because this renders on her public page and nothing else limits it.
  const text = String(body?.text || "").trim().slice(0, 2000);

  // A CANCELLED VISIT DID NOT HAPPEN, so there is nothing to review. Checked
  // here rather than left to the client, because the link is live from the
  // moment it is sent and an appointment can be cancelled after it goes out.
  if (appt.confirmation_status === "cancelled") {
    return Response.json({ success: false, error: "התור בוטל, ולא ניתן להשאיר עליו ביקורת" }, { status: 409 });
  }

  const { error: insErr } = await admin.from("reviews").insert({
    tenant_id: appt.tenant_id,
    appointment_id: appt.id,
    client_id: appt.client_id || null,
    // The name she gave when she booked, frozen here on purpose: what the page
    // shows must not change later because a client row was edited.
    client_name: appt.name || "",
    rating,
    body: text,
  });

  if (insErr) {
    // 23505 is the unique index on appointment_id: this visit already has a
    // review. Two taps on the same link is ordinary, so it is not an error to
    // report as one - and it must not overwrite what she wrote the first time,
    // which is the same rule that makes a review immutable to the business.
    if (insErr.code === "23505") {
      return Response.json({ success: true, alreadyReviewed: true });
    }
    console.error("[reviews] insert failed:", insErr.message, insErr.code);
    return Response.json({ success: false, error: "לא הצלחנו לשמור את הביקורת" }, { status: 500 });
  }

  return Response.json({ success: true });
}
