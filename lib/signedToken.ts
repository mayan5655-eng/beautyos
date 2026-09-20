// lib/signedToken.ts
//
// SERVER ONLY. The one construction behind every expiring link token.
//
// ── Format ─────────────────────────────────────────────────────────────────
//   <exp>.<sig>     exp = unix seconds the token dies; sig = first 32 chars of
//                   base64url HMAC-SHA256 over `<message>:<exp>`
//
// A token without a dot is the OLD format: HMAC over `<message>` alone, no
// expiry. Those are still in WhatsApp threads that went out before this
// change - a booking confirmation for an appointment six weeks away carries
// one - so they verify until LEGACY_ACCEPTED_UNTIL, against every key they
// might have been signed with (lib/linkSecret.ts). After that date only
// dated tokens verify, and "forever" is finally over.
//
// The date is chosen so that every legacy link is for an appointment that
// has passed: the public booking window is 60 days and the review link goes
// out two days after a visit, so 100 days from the deploy covers both with
// room.
//
// Constant-time comparison; a length mismatch is refused without comparing.

import { createHmac, timingSafeEqual } from 'crypto';

export const LEGACY_ACCEPTED_UNTIL = Date.UTC(2026, 11, 31); // 2026-12-31T00:00Z

const SIG_LEN = 32;

function hmac(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url').slice(0, SIG_LEN);
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/** A dated token for `message`, dying at `expiresAtMs`. */
export function signWithExpiry(secret: string, message: string, expiresAtMs: number): string {
  const exp = Math.floor(expiresAtMs / 1000);
  if (!Number.isFinite(exp) || exp <= 0) throw new Error('signWithExpiry: bad expiry');
  return `${exp}.${hmac(secret, `${message}:${exp}`)}`;
}

/**
 * Verify a token for `message`. `secret` signs new tokens; `legacySecrets`
 * are every key an un-dated token may carry. Never throws on bad input.
 */
export function verifyWithExpiry(
  token: string | null | undefined,
  message: string,
  secret: string,
  legacySecrets: string[],
  nowMs: number = Date.now()
): boolean {
  const t = String(token || '').trim();
  if (!t || !message) return false;

  const dot = t.indexOf('.');
  if (dot === -1) {
    // Legacy, un-dated. Accepted only inside the window, against every
    // key it could have been signed with.
    if (nowMs >= LEGACY_ACCEPTED_UNTIL) return false;
    return legacySecrets.some((s) => safeEq(hmac(s, message), t));
  }

  const expStr = t.slice(0, dot);
  const sig = t.slice(dot + 1);
  if (!/^\d{1,12}$/.test(expStr) || !sig) return false;
  const exp = Number(expStr);
  if (exp * 1000 <= nowMs) return false;
  return safeEq(hmac(secret, `${message}:${exp}`), sig);
}

/** Midnight at the END of a YYYY-MM-DD day in Israel, plus `graceDays`. */
export function expiryAfterDate(dateStr: string, graceDays: number, fallbackMs: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return fallbackMs;
  // Israel is UTC+2 or +3; end of the local day is at most 03:00Z the next
  // day. Using 00:00Z of the following day plus grace is within an hour of
  // the local midnight and errs on the side of the link living longer.
  const endOfDayUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
  return endOfDayUtc + graceDays * 86_400_000;
}
