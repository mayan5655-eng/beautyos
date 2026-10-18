// lib/billing/session.ts
//
// SERVER ONLY. A short-lived signed token that carries a tenant id through the MOCK hosted card page, so that page (public, no login) can only
// ever save a card for the business that asked for it. HMAC-SHA256 over "tenantId.expiry" with a key derived from the service-role key,
// which never leaves the server. A real provider has its own session mechanism; this exists for the mock page alone.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 30 * 60 * 1000;

const key = () => `kalmea-billing-session:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
const mac = (payload: string) => createHmac('sha256', key()).update(payload).digest('hex');

export function signCardSession(tenantId: string, now = Date.now()): string {
  const payload = `${tenantId}.${now + TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

/** The tenant id inside a valid, unexpired token; null for anything else. */
export function verifyCardSession(token: string, now = Date.now()): string | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [tenantId, exp, sig] = parts;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !/^[0-9a-f-]{36}$/i.test(tenantId) || !(Number(exp) > now)) return null;
  const a = Buffer.from(mac(`${tenantId}.${exp}`));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? tenantId : null;
}
