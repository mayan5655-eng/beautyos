// lib/phoneVerify/memoryStore.ts
//
// The PhoneStore with the database's semantics, in memory. Used by test-phone-verify.ts, and by a LOCAL server
// (PHONE_VERIFY_DEV_STORE=memory, refused on any Vercel deployment - see lib/phoneVerify/route.ts) to walk the signup
// screens without a database. claim() mirrors public.claim_owner_phone in add_owner_phone_verification.sql; the SQL
// itself is dry-run by scripts/smoke/owner-phone-sql.mjs.

import type { ClaimResult, PhoneStore, Purpose } from './service.ts';
import type { PhoneFlags } from './policy.ts';

type Otp = {
  id: string; phone_e164: string; purpose: Purpose; user_id: string | null; ip_hash: string; code_hash: string;
  expires_at: string; created_at: number; attempts: number; consumed_at: string | null; send_status: string;
};

export type MemoryStore = PhoneStore & { owners: Map<string, string | null>; otps: Otp[] };

export function memoryPhoneStore(opts: { flags?: PhoneFlags | null; now?: () => number } = {}): MemoryStore {
  const owners = new Map<string, string | null>(); // phone -> user: the primary key
  const otps: Otp[] = [];
  const now = opts.now || (() => Date.now());
  const flags = opts.flags === undefined ? { signup: true, existing: true, since: new Date(0).toISOString() } : opts.flags;
  let seq = 0;
  return {
    owners, otps,
    async readFlags() { return flags; },
    async phoneHolder(phone) { return owners.has(phone) ? owners.get(phone)! : undefined; },
    async userPhone(userId) { for (const [p, u] of owners) if (u === userId) return p; return null; },
    async sendCounts({ phone, ipHash, userId, nowMs }) {
      const day = otps.filter((o) => o.created_at > nowMs - 86_400_000);
      const hour = (rows: Otp[]) => rows.filter((o) => o.created_at > nowMs - 3_600_000).length;
      const byPhone = day.filter((o) => o.phone_e164 === phone).sort((a, b) => b.created_at - a.created_at);
      const byIp = day.filter((o) => o.ip_hash === ipHash);
      return {
        sinceLastToPhoneMs: byPhone[0] ? nowMs - byPhone[0].created_at : null,
        phoneLastHour: hour(byPhone), phoneLastDay: byPhone.length,
        ipLastHour: hour(byIp), ipLastDay: byIp.length,
        userLastDay: userId ? day.filter((o) => o.user_id === userId).length : 0,
        platformLastDay: day.filter((o) => o.send_status !== 'mock').length,
      };
    },
    async insertOtp(row) {
      const id = `otp${++seq}`;
      otps.push({ ...row, id, created_at: now(), attempts: 0, consumed_at: null, send_status: 'pending' });
      return id;
    },
    async markOtp(id, patch) { Object.assign(otps.find((o) => o.id === id)!, patch); },
    async latestOtp({ phone, purpose, userId }) {
      const rows = otps
        .filter((o) => o.phone_e164 === phone && o.purpose === purpose && o.send_status !== 'failed' && o.user_id === userId)
        .sort((a, b) => b.created_at - a.created_at);
      return rows[0] || null;
    },
    async bumpAttempt(id) {
      const o = otps.find((x) => x.id === id);
      if (!o || o.consumed_at || Date.parse(o.expires_at) <= now()) return null;
      return ++o.attempts;
    },
    async consumeOtp(id) { otps.find((o) => o.id === id)!.consumed_at = new Date(now()).toISOString(); },
    async claim(phone, userId): Promise<ClaimResult> {
      for (const [p, u] of owners) if (u === userId) return p === phone ? 'already_yours' : 'has_other';
      if (owners.has(phone)) return owners.get(phone) === userId ? 'already_yours' : 'taken';
      owners.set(phone, userId);
      return 'claimed';
    },
  };
}
