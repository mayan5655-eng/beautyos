// lib/grow/mockSession.ts
//
// SERVER ONLY. A short-lived signed token that carries a tenant id and an appointment id through the MOCK hosted card page, so that public page
// (no login) can only ever save a card for the booking it was opened for. HMAC-SHA256 over "tenantId.appointmentId.expiry" with a key derived
// from the service-role key, which never leaves the server. The real Grow has its own hosted page; this exists for the mock page alone.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 60 * 60 * 1000;
const key = () => `kalmea-grow-session:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
const mac = (payload: string) => createHmac('sha256', key()).update(payload).digest('hex');

export function signGrowSession(tenantId: string, appointmentId: string, now = Date.now()): string {
  const payload = `${tenantId}.${encodeURIComponent(appointmentId)}.${now + TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

/** The tenant and appointment inside a valid, unexpired token; null for anything else. */
export function verifyGrowSession(token: string, now = Date.now()): { tenantId: string; appointmentId: string } | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [tenantId, appt, exp, sig] = parts;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !/^[0-9a-f-]{36}$/i.test(tenantId) || !(Number(exp) > now)) return null;
  const a = Buffer.from(mac(`${tenantId}.${appt}.${exp}`));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? { tenantId, appointmentId: decodeURIComponent(appt) } : null;
}
