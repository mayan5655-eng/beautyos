// lib/phoneVerify/service.ts
//
// SERVER ONLY. The three things the phone routes do - send a code, check a code, and answer "does this account need
// to verify" - written against a small store interface so the whole flow runs in tests on an in-memory store
// (test-phone-verify.ts) and in production on Supabase (lib/phoneVerify/store.ts). Rules and Hebrew live in
// policy.ts; sending lives in sms.ts.

import { normalizeIsraeliMobile, PHONE_ERROR_HE } from '../phone.ts';
import {
  CODE_TTL_MS, MAX_ATTEMPTS, WINDOWS, PHONE_COPY_HE, FLAGS_OFF,
  codeMatches, cleanCode, decidePhoneGate, hashCode, isCodeShape, newCode, platformDailyCap,
  refusalCopy, sendRefusal, signupNeedsPhone, signupTicket, signupTicketValid, smsText,
  type PhoneFlags, type PhoneGate, type SendCounts,
} from './policy.ts';
import { mockCode, sendSms, smsStatus } from './sms.ts';

export type Purpose = 'signup' | 'verify';
export type ClaimResult = 'claimed' | 'already_yours' | 'taken' | 'has_other';

export type OtpRow = { id: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null };

/** Every database touch the flow needs. Each method throws on a database error; the service decides what that means. */
export interface PhoneStore {
  /** null when the switches cannot be read (most likely: the migration has not run) */
  readFlags(): Promise<PhoneFlags | null>;
  /** Who holds this number: a user id, null for a held number whose account was deleted, undefined when nobody does. */
  phoneHolder(phone: string): Promise<string | null | undefined>;
  userPhone(userId: string): Promise<string | null>;
  sendCounts(q: { phone: string; ipHash: string; userId: string | null; nowMs: number }): Promise<Omit<SendCounts, never>>;
  insertOtp(row: { phone_e164: string; purpose: Purpose; user_id: string | null; ip_hash: string; code_hash: string; expires_at: string }): Promise<string>;
  markOtp(id: string, patch: { send_status: 'sent' | 'failed' | 'mock'; provider: string; provider_ref?: string | null }): Promise<void>;
  latestOtp(q: { phone: string; purpose: Purpose; userId: string | null }): Promise<OtpRow | null>;
  bumpAttempt(id: string): Promise<number | null>;
  consumeOtp(id: string): Promise<void>;
  claim(phone: string, userId: string, tenantId: string | null, source: 'signup' | 'login_prompt'): Promise<ClaimResult>;
}

type Env = Record<string, string | undefined>;

export type PhoneResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): PhoneResponse => ({ status, body: { ok: false, error, ...extra } });

/** The key codes and tickets are signed with. Falls back to the service key, like lib/linkSecret.ts, and says so once. */
let warned = false;
export function phoneSecret(env: Env = process.env): string {
  const own = (env.PHONE_OTP_SECRET || '').trim();
  if (own) return own;
  if (!warned) {
    warned = true;
    console.error('[phoneVerify] PHONE_OTP_SECRET is not set: codes and signup tickets are signed with SUPABASE_SERVICE_ROLE_KEY. Set PHONE_OTP_SECRET in Vercel.');
  }
  return env.SUPABASE_SERVICE_ROLE_KEY || '';
}

async function flagsOf(store: PhoneStore): Promise<PhoneFlags> {
  try { return (await store.readFlags()) || FLAGS_OFF; } catch { return FLAGS_OFF; }
}

/** What the signup page needs before it paints its form. */
export async function signupConfig(store: PhoneStore, env: Env = process.env): Promise<{ phoneRequired: boolean; mock: boolean }> {
  const sms = smsStatus(env);
  const flags = await flagsOf(store);
  return { phoneRequired: signupNeedsPhone(flags, sms.ready), mock: sms.ready && sms.mode === 'mock' };
}

export async function sendCode(input: {
  store: PhoneStore; env?: Env; phone: unknown; purpose: Purpose; userId: string | null; ipHash: string; nowMs?: number;
}): Promise<PhoneResponse> {
  const { store, purpose, userId, ipHash } = input;
  const env = input.env || process.env;
  const nowMs = input.nowMs ?? Date.now();

  const norm = normalizeIsraeliMobile(typeof input.phone === 'string' ? input.phone : '');
  if (!norm.ok) return fail(400, PHONE_ERROR_HE[norm.reason], { field: 'phone' });
  const phone = norm.e164;

  const sms = smsStatus(env);
  if (!sms.ready) return fail(503, PHONE_COPY_HE.unavailable);
  if (purpose === 'verify' && !userId) return fail(401, PHONE_COPY_HE.notReady);

  // Spending money is gated on a switch being on: with both off, this endpoint sends nothing at all.
  const flags = await flagsOf(store);
  if (purpose === 'signup' ? !flags.signup : !(flags.signup || flags.existing)) return fail(503, PHONE_COPY_HE.unavailable);

  try {
    if (purpose === 'verify') {
      const mine = await store.userPhone(userId as string);
      if (mine === phone) return { status: 200, body: { ok: true, alreadyVerified: true } };
      if (mine) return fail(409, PHONE_COPY_HE.hasOther, { code: 'has_other' });
    }
    // Answered BEFORE any SMS is sent: no money spent on a number that cannot be used, and she learns at once where
    // her account is.
    const holder = await store.phoneHolder(phone);
    // A number held by a deleted account (holder null) stays taken: deleting an account is not a way to a new trial.
    if (holder !== undefined && !(userId && holder === userId)) return fail(409, PHONE_COPY_HE.taken, { code: 'taken' });

    const counts = await store.sendCounts({ phone, ipHash, userId, nowMs });
    const refused = sendRefusal(counts, platformDailyCap(env));
    if (refused) {
      if (refused === 'platform_limit') console.error('[phoneVerify] platform daily SMS cap reached:', counts.platformLastDay);
      return fail(429, refusalCopy(refused, counts.sinceLastToPhoneMs), { code: refused });
    }

    const code = sms.mode === 'mock' ? mockCode(env) : newCode();
    const id = await store.insertOtp({
      phone_e164: phone, purpose, user_id: userId, ip_hash: ipHash,
      code_hash: hashCode(phoneSecret(env), phone, code),
      expires_at: new Date(nowMs + CODE_TTL_MS).toISOString(),
    });
    const sent = await sendSms(phone, smsText(code), env);
    await store.markOtp(id, sent.ok ? { send_status: sent.status, provider: sent.provider, provider_ref: sent.ref ?? null } : { send_status: 'failed', provider: sent.provider });
    if (!sent.ok) {
      console.error('[phoneVerify] SMS send failed:', sent.provider, sent.error);
      return fail(502, PHONE_COPY_HE.sendFailed);
    }
    return { status: 200, body: { ok: true, expiresInSec: CODE_TTL_MS / 1000, resendInSec: 60, mock: sent.status === 'mock' } };
  } catch (e) {
    console.error('[phoneVerify] send failed:', e instanceof Error ? e.message : String(e));
    return fail(503, PHONE_COPY_HE.notReady);
  }
}

export async function verifyCode(input: {
  store: PhoneStore; env?: Env; phone: unknown; code: unknown; purpose: Purpose; userId: string | null; tenantId: string | null; nowMs?: number;
}): Promise<PhoneResponse> {
  const { store, purpose, userId, tenantId } = input;
  const env = input.env || process.env;
  const nowMs = input.nowMs ?? Date.now();

  const norm = normalizeIsraeliMobile(typeof input.phone === 'string' ? input.phone : '');
  if (!norm.ok) return fail(400, PHONE_ERROR_HE[norm.reason], { field: 'phone' });
  const phone = norm.e164;
  if (!isCodeShape(input.code)) return fail(400, PHONE_COPY_HE.codeShape, { field: 'code' });
  if (purpose === 'verify' && !userId) return fail(401, PHONE_COPY_HE.notReady);

  try {
    const otp = await store.latestOtp({ phone, purpose, userId: purpose === 'verify' ? userId : null });
    if (!otp || otp.consumed_at || Date.parse(otp.expires_at) <= nowMs) return fail(400, PHONE_COPY_HE.noCode, { code: 'no_code' });
    // Counted before comparing, atomically (bump_phone_otp_attempt), so parallel guesses cannot share one attempt.
    const attempts = await store.bumpAttempt(otp.id);
    if (attempts === null) return fail(400, PHONE_COPY_HE.noCode, { code: 'no_code' });
    if (attempts > MAX_ATTEMPTS) return fail(400, PHONE_COPY_HE.wrongCode(0), { code: 'too_many' });
    if (!codeMatches(phoneSecret(env), phone, cleanCode(input.code), otp.code_hash)) {
      return fail(400, PHONE_COPY_HE.wrongCode(MAX_ATTEMPTS - attempts), { code: 'wrong_code' });
    }
    await store.consumeOtp(otp.id);

    if (purpose === 'signup') {
      // The number may have been taken in the ten minutes since the code went out.
      const holder = await store.phoneHolder(phone);
      if (holder !== undefined) return fail(409, PHONE_COPY_HE.taken, { code: 'taken' });
      return { status: 200, body: { ok: true, phone, ticket: signupTicket(phoneSecret(env), phone, nowMs) } };
    }

    const res = await store.claim(phone, userId as string, tenantId, 'login_prompt');
    if (res === 'taken') return fail(409, PHONE_COPY_HE.taken, { code: 'taken' });
    if (res === 'has_other') return fail(409, PHONE_COPY_HE.hasOther, { code: 'has_other' });
    return { status: 200, body: { ok: true, verified: true } };
  } catch (e) {
    console.error('[phoneVerify] verify failed:', e instanceof Error ? e.message : String(e));
    return fail(503, PHONE_COPY_HE.notReady);
  }
}

export type PhoneStatus = { gate: PhoneGate; verified: boolean; note?: 'ticket_taken' | 'ticket_invalid' };

/**
 * "Does this signed-in account need to verify?" - and, on the first signed-in request after a phone-first signup,
 * the moment the number verified at signup is claimed for her (from the ticket the signup form stored in her
 * account's metadata).
 */
export async function phoneStatus(input: {
  store: PhoneStore; env?: Env;
  user: { id: string; created_at?: string | null; user_metadata?: Record<string, unknown> | null };
  tenantId: string | null; isDemoTenant: boolean; nowMs?: number;
}): Promise<PhoneStatus> {
  const { store, user, tenantId, isDemoTenant } = input;
  const env = input.env || process.env;
  const flags = await flagsOf(store);
  const sms = smsStatus(env);

  let verified = false;
  let note: PhoneStatus['note'];
  try {
    verified = !!(await store.userPhone(user.id));
    const meta = user.user_metadata || {};
    const phone = typeof meta.phone_e164 === 'string' ? meta.phone_e164 : '';
    if (!verified && phone) {
      if (signupTicketValid(phoneSecret(env), phone, meta.phone_ticket, input.nowMs ?? Date.now())) {
        const res = await store.claim(phone, user.id, tenantId, 'signup');
        if (res === 'claimed' || res === 'already_yours') verified = true;
        else note = 'ticket_taken';
      } else {
        note = 'ticket_invalid';
      }
    }
  } catch (e) {
    // Unreadable (the migration has not run, or a blip): never block on what we could not read.
    console.error('[phoneVerify] status read failed:', e instanceof Error ? e.message : String(e));
    return { gate: 'none', verified: false };
  }

  const gate = decidePhoneGate({ flags, smsReady: sms.ready, hasVerifiedPhone: verified, isDemoTenant, userCreatedAt: user.created_at });
  return { gate, verified, ...(note ? { note } : {}) };
}
