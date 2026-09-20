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
//
// ── Expiry ─────────────────────────────────────────────────────────────────
// A review link dies 30 days after it is minted. It goes out two days after
// the visit; a month is long enough for anyone who meant to answer. Un-dated
// tokens from messages already sent keep verifying until the legacy window
// in lib/signedToken.ts closes.
//
// The secret comes from lib/linkSecret.ts: REVIEW_LINK_SECRET, else the
// service-role key with a loud warning once per process.

import { signingSecret, legacySecrets } from './linkSecret.ts';
import { signWithExpiry, verifyWithExpiry } from './signedToken.ts';

const ENV = 'REVIEW_LINK_SECRET';
export const REVIEW_TTL_MS = 30 * 86_400_000;

const message = (appointmentId: string) => `${appointmentId}:review`;

/** Signature for one appointment's review link. */
export function signReview(appointmentId: string, expiresAtMs: number = Date.now() + REVIEW_TTL_MS): string {
  return signWithExpiry(signingSecret(ENV), message(appointmentId), expiresAtMs);
}

/** Constant-time check. Returns false rather than throwing on malformed input. */
export function verifyReview(appointmentId: string, token: string, nowMs: number = Date.now()): boolean {
  if (!appointmentId || !token) return false;
  try {
    return verifyWithExpiry(token, message(appointmentId), signingSecret(ENV), legacySecrets(ENV), nowMs);
  } catch {
    return false;
  }
}

/** The review link for one appointment, already signed. */
export function reviewLink(origin: string, appointmentId: string, nowMs: number = Date.now()): string {
  return `${origin}/review?id=${appointmentId}&t=${signReview(appointmentId, nowMs + REVIEW_TTL_MS)}`;
}
