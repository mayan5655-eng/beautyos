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
//
// ── Expiry ─────────────────────────────────────────────────────────────────
// A link now dies three days after the appointment's date, or 90 days after
// it was minted when the date is not to hand. Before this, a cancel link in
// a forwarded message worked forever. Tokens are `<exp>.<sig>`; un-dated
// tokens from messages already sent keep verifying until the legacy window
// in lib/signedToken.ts closes.
//
// The secret comes from lib/linkSecret.ts: CONFIRM_LINK_SECRET, else the
// service-role key with a loud warning once per process.

import { signingSecret, legacySecrets } from './linkSecret.ts';
import { signWithExpiry, verifyWithExpiry, expiryAfterDate } from './signedToken.ts';

const ENV = 'CONFIRM_LINK_SECRET';
export const CONFIRM_GRACE_DAYS = 3;
export const CONFIRM_DEFAULT_TTL_MS = 90 * 86_400_000;

export type ConfirmAction = 'confirm' | 'cancel';

const message = (appointmentId: string, action: ConfirmAction) => `${appointmentId}:${action}`;

/** The expiry for an appointment's links: end of its day plus grace, else 90 days out. */
export function confirmExpiry(date?: string | null, nowMs: number = Date.now()): number {
  return expiryAfterDate(date || '', CONFIRM_GRACE_DAYS, nowMs + CONFIRM_DEFAULT_TTL_MS);
}

/** Signature for one (appointment, action) pair, dying at `expiresAtMs`. */
export function signConfirm(appointmentId: string, action: ConfirmAction, expiresAtMs: number = confirmExpiry()): string {
  return signWithExpiry(signingSecret(ENV), message(appointmentId, action), expiresAtMs);
}

/** Constant-time check. Returns false rather than throwing on malformed input. */
export function verifyConfirm(appointmentId: string, action: string, token: string, nowMs: number = Date.now()): boolean {
  if (!appointmentId || !token) return false;
  if (action !== 'confirm' && action !== 'cancel') return false;
  try {
    return verifyWithExpiry(token, message(appointmentId, action), signingSecret(ENV), legacySecrets(ENV), nowMs);
  } catch {
    return false;
  }
}

/**
 * The two links for one appointment, already signed. Pass the appointment's
 * date whenever it is to hand, so the links die three days after the visit
 * rather than 90 days after minting.
 */
export function confirmLinks(origin: string, appointmentId: string, opts: { date?: string | null; nowMs?: number } = {}) {
  const exp = confirmExpiry(opts.date, opts.nowMs);
  return {
    confirmUrl: `${origin}/confirm?id=${appointmentId}&action=confirm&t=${signConfirm(appointmentId, 'confirm', exp)}`,
    cancelUrl: `${origin}/confirm?id=${appointmentId}&action=cancel&t=${signConfirm(appointmentId, 'cancel', exp)}`,
  };
}
