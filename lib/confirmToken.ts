// lib/confirmToken.ts
//
// SERVER ONLY. Never import this into a client component - it reads a secret.
//
// Signs the appointment confirm/cancel links that go out over WhatsApp.
//
// Why this exists: /api/confirm runs on the service-role key, so RLS does not
// apply and the route is responsible for its own authorisation. It used to have
// none - an appointment id in the query string was enough to confirm or cancel
// that appointment in ANY tenant. The id is not a secret: it is mailed to the
// client in plaintext, so anyone a reminder is forwarded to could cancel the
// booking, and any appointment id that leaked anywhere else was a live handle
// on someone else's calendar.
//
// The signature binds the id to the action, so a "confirm" link cannot be
// edited into a "cancel" link, and neither can be pointed at a different
// appointment.

import { createHmac, timingSafeEqual } from 'crypto';

// Prefer a dedicated secret, but fall back to the service-role key rather than
// failing closed on a missing env var. Both are server-only and neither ever
// reaches the browser. The fallback is deliberate: the app cannot run at all
// without SUPABASE_SERVICE_ROLE_KEY, so links can never silently stop working
// because one extra variable was not set in Vercel. Setting CONFIRM_LINK_SECRET
// is still preferable - it lets the link signature be rotated on its own,
// without rotating database credentials.
function secret(): string {
  const s = process.env.CONFIRM_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('confirmToken: no signing secret available');
  return s;
}

export type ConfirmAction = 'confirm' | 'cancel';

/** Signature for one (appointment, action) pair. URL-safe, 32 chars. */
export function signConfirm(appointmentId: string, action: ConfirmAction): string {
  return createHmac('sha256', secret())
    .update(`${appointmentId}:${action}`)
    .digest('base64url')
    .slice(0, 32);
}

/** Constant-time check. Returns false rather than throwing on malformed input. */
export function verifyConfirm(appointmentId: string, action: string, token: string): boolean {
  if (!appointmentId || !token) return false;
  if (action !== 'confirm' && action !== 'cancel') return false;
  let expected: string;
  try {
    expected = signConfirm(appointmentId, action);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // timingSafeEqual throws on length mismatch; the length is not secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The two links for one appointment, already signed. */
export function confirmLinks(origin: string, appointmentId: string) {
  return {
    confirmUrl: `${origin}/confirm?id=${appointmentId}&action=confirm&t=${signConfirm(appointmentId, 'confirm')}`,
    cancelUrl: `${origin}/confirm?id=${appointmentId}&action=cancel&t=${signConfirm(appointmentId, 'cancel')}`,
  };
}
