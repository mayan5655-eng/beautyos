// lib/facebook/signedRequest.ts
//
// SERVER ONLY. Meta's "signed_request" (Deauthorize Callback and Data Deletion Request Callback):
//   signed_request = base64url(signature) + '.' + base64url(payload)
//   signature      = HMAC-SHA256(base64url(payload), APP_SECRET)
//   payload        = { algorithm: 'HMAC-SHA256', user_id, issued_at }
// Verified in constant time, against FACEBOOK_APP_SECRET, before anything is read from the payload.
//
// The deletion "confirmation code" is stateless: a signed token over a hash of the user id and the request time, so
// the status page can say "this request was received on <date>" without a table, and nobody can forge a code for a
// request that never happened. The raw Facebook user id is never put in the code or in a URL.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const b64urlDecode = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const b64urlEncode = (b: Buffer | string): string => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

export type SignedPayload = { algorithm: string; user_id: string; issued_at?: number };

const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** The payload when the signature is valid for `secret`; null for anything else (never throws). */
export function parseSignedRequest(signed: unknown, secret: string | undefined): SignedPayload | null {
  if (typeof signed !== 'string' || !secret) return null;
  const parts = signed.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const sig = b64urlDecode(parts[0]);
    const expected = createHmac('sha256', secret).update(parts[1]).digest();
    if (!same(sig, expected)) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8')) as Record<string, unknown>;
    if (String(payload.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return null;
    const userId = payload.user_id != null ? String(payload.user_id) : '';
    if (!/^\d{1,30}$/.test(userId)) return null;
    return { algorithm: 'HMAC-SHA256', user_id: userId, issued_at: typeof payload.issued_at === 'number' ? payload.issued_at : undefined };
  } catch {
    return null;
  }
}

/** Test/support helper: build a signed_request the way Meta does. */
export function signRequest(payload: Record<string, unknown>, secret: string): string {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(createHmac('sha256', secret).update(body).digest());
  return `${sig}.${body}`;
}

/** A confirmation code for a deletion request: stateless, signed, carries only a hash and a time. */
export function makeDeletionCode(userId: string, secret: string, now: Date = new Date()): string {
  const ref = createHash('sha256').update(`fbdel:${userId}`).digest('hex').slice(0, 12);
  const body = b64urlEncode(JSON.stringify({ r: ref, t: Math.floor(now.getTime() / 1000) }));
  const sig = b64urlEncode(createHmac('sha256', secret).update('deletion:' + body).digest()).slice(0, 22);
  return `${body}.${sig}`;
}

export function readDeletionCode(code: unknown, secret: string | undefined): { ref: string; at: Date } | null {
  if (typeof code !== 'string' || !secret) return null;
  const parts = code.split('.');
  if (parts.length !== 2) return null;
  const expected = b64urlEncode(createHmac('sha256', secret).update('deletion:' + parts[0]).digest()).slice(0, 22);
  if (!same(Buffer.from(parts[1]), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(b64urlDecode(parts[0]).toString('utf8')) as { r?: unknown; t?: unknown };
    if (typeof p.r !== 'string' || typeof p.t !== 'number') return null;
    return { ref: p.r, at: new Date(p.t * 1000) };
  } catch {
    return null;
  }
}
