// lib/reviewToken.ts
//
// SERVER ONLY. Never import this into a client component - it reads a secret.
//
// The signature on a review link. Same construction as lib/confirmToken, and
// deliberately a separate action string rather than a reuse of that one: a
// token that lets someone leave a review must not also confirm or cancel their
// appointment, and the only thing keeping those apart is what goes into the
// HMAC.
//
// The appointment id is not a secret - it is already in the confirm and cancel
// links in the same WhatsApp thread. The signature is what makes the id
// unguessable AS A REVIEW LINK, so a stranger cannot post reviews against a
// business by walking appointment ids.
//
// The one-review-per-appointment rule is NOT here. It lives in the unique index
// on reviews.appointment_id, because a signature can be replayed and a database
// constraint cannot.

import { createHmac, timingSafeEqual } from 'crypto';

// Mirrors confirmToken's reasoning exactly: prefer a dedicated secret, fall
// back to the service-role key rather than failing closed on a missing env var.
// The app cannot run without SUPABASE_SERVICE_ROLE_KEY, so a review link can
// never silently stop working because one more variable was not set in Vercel.
function secret(): string {
  const s = process.env.REVIEW_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('reviewToken: no signing secret available');
  return s;
}

/** Signature for one appointment's review link. URL-safe, 32 chars. */
export function signReview(appointmentId: string): string {
  return createHmac('sha256', secret())
    .update(`${appointmentId}:review`)
    .digest('base64url')
    .slice(0, 32);
}

/** Constant-time check. Returns false rather than throwing on malformed input. */
export function verifyReview(appointmentId: string, token: string): boolean {
  if (!appointmentId || !token) return false;
  let expected: string;
  try {
    expected = signReview(appointmentId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // timingSafeEqual throws on a length mismatch; the length is not secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The review link for one appointment, already signed. */
export function reviewLink(origin: string, appointmentId: string): string {
  return `${origin}/review?id=${appointmentId}&t=${signReview(appointmentId)}`;
}
