// lib/phoneVerify/store.ts
//
// SERVER ONLY. The Supabase side of lib/phoneVerify/service.ts's PhoneStore, on the service-role key: owner_phones and
// phone_otp have no client write access at all (supabase/migrations/add_owner_phone_verification.sql). Every method
// throws on a database error; the service decides whether that blocks (sending, checking) or not (status).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhoneStore, ClaimResult } from './service.ts';
import { WINDOWS } from './policy.ts';

const CLAIMS: ClaimResult[] = ['claimed', 'already_yours', 'taken', 'has_other'];

export function supabasePhoneStore(db: SupabaseClient): PhoneStore {
  const must = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count || 0;
  };

  return {
    async readFlags() {
      const r = await db.from('platform_settings').select('phone_verify_signup, phone_verify_existing, phone_verify_since').eq('id', true).maybeSingle();
      if (r.error || !r.data) return null;
      const d = r.data as { phone_verify_signup?: boolean; phone_verify_existing?: boolean; phone_verify_since?: string | null };
      return { signup: d.phone_verify_signup === true, existing: d.phone_verify_existing === true, since: d.phone_verify_since || null };
    },

    async phoneHolder(phone) {
      const row = must(await db.from('owner_phones').select('user_id').eq('phone_e164', phone).maybeSingle()) as { user_id: string | null } | null;
      return row ? row.user_id : undefined;
    },

    async userPhone(userId) {
      const row = must(await db.from('owner_phones').select('phone_e164').eq('user_id', userId).maybeSingle()) as { phone_e164: string } | null;
      return row?.phone_e164 || null;
    },

    async sendCounts({ phone, ipHash, userId, nowMs }) {
      const dayAgo = new Date(nowMs - WINDOWS.DAY).toISOString();
      const hourAgo = nowMs - WINDOWS.HOUR;
      const head = { count: 'exact' as const, head: true };
      const phoneRows = must(await db.from('phone_otp').select('created_at').eq('phone_e164', phone).gte('created_at', dayAgo).order('created_at', { ascending: false }).limit(50)) as { created_at: string }[];
      const ipRows = must(await db.from('phone_otp').select('created_at').eq('ip_hash', ipHash).gte('created_at', dayAgo).limit(100)) as { created_at: string }[];
      const userLastDay = userId ? await count(db.from('phone_otp').select('id', head).eq('user_id', userId).gte('created_at', dayAgo)) : 0;
      const platformLastDay = await count(db.from('phone_otp').select('id', head).gte('created_at', dayAgo).neq('send_status', 'mock'));
      const inHour = (rows: { created_at: string }[]) => rows.filter((r) => Date.parse(r.created_at) >= hourAgo).length;
      return {
        sinceLastToPhoneMs: phoneRows[0] ? nowMs - Date.parse(phoneRows[0].created_at) : null,
        phoneLastHour: inHour(phoneRows),
        phoneLastDay: phoneRows.length,
        ipLastHour: inHour(ipRows),
        ipLastDay: ipRows.length,
        userLastDay,
        platformLastDay,
      };
    },

    async insertOtp(row) {
      const d = must(await db.from('phone_otp').insert(row).select('id').single()) as { id: string };
      return d.id;
    },

    async markOtp(id, patch) {
      must(await db.from('phone_otp').update(patch).eq('id', id));
    },

    async latestOtp({ phone, purpose, userId }) {
      let q = db.from('phone_otp').select('id, code_hash, attempts, expires_at, consumed_at')
        .eq('phone_e164', phone).eq('purpose', purpose).neq('send_status', 'failed');
      q = userId ? q.eq('user_id', userId) : q.is('user_id', null);
      const rows = must(await q.order('created_at', { ascending: false }).limit(1)) as { id: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null }[];
      return rows[0] || null;
    },

    async bumpAttempt(id) {
      const n = must(await db.rpc('bump_phone_otp_attempt', { p_id: id })) as number | null;
      return typeof n === 'number' ? n : null;
    },

    async consumeOtp(id) {
      must(await db.from('phone_otp').update({ consumed_at: new Date().toISOString() }).eq('id', id));
    },

    async claim(phone, userId, tenantId, source) {
      const r = must(await db.rpc('claim_owner_phone', { p_phone: phone, p_user: userId, p_tenant: tenantId, p_source: source })) as string;
      if (!CLAIMS.includes(r as ClaimResult)) throw new Error(`claim_owner_phone answered ${r}`);
      return r as ClaimResult;
    },
  };
}
