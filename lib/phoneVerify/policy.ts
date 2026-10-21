// lib/phoneVerify/policy.ts
//
// One verified mobile per account: the rules, the numbers and the Hebrew, in one reviewable place. Pure - no
// database, no network - so every decision here is tested directly (test-phone-verify.ts).
//
// ── Why this exists ──────────────────────────────────────────────────────────
// A free trial used to be one email away: a new address, a new 30-day trial, as many times as she liked. Now each
// account is tied to an Israeli mobile proven by an SMS code, and the DATABASE refuses a second account on the same
// number (owner_phones.phone_e164 is the primary key; supabase/migrations/add_owner_phone_verification.sql). This
// file decides when to ask, how often a code may be sent, and what she reads.
//
// ── Two switches, both off until she turns them on (platform_settings) ─────────
//   phone_verify_signup    a new signup verifies before the account is usable. Accounts created after the switch was
//                          first turned on (phone_verify_since) cannot skip it.
//   phone_verify_existing  an older account with no verified number is ASKED on her next login, with "later" always
//                          there. Nobody is locked out of her own calendar over this.
// And neither applies while SMS cannot actually be sent (lib/phoneVerify/sms.ts smsReady): asking for a code that
// can never arrive would lock out every new signup.

import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { signWithExpiry, verifyWithExpiry } from '../signedToken.ts';

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60_000;
/** Wrong guesses allowed on one code before a new code is needed. */
export const MAX_ATTEMPTS = 5;
/** How long a verified number is held for the signup that follows (she may confirm her email on another device). */
export const SIGNUP_TICKET_TTL_MS = 48 * 60 * 60_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How often a code may be sent. Set against a real person: she asks once, maybe once more when the first SMS is slow,
 * maybe a third time after a typo. Anything past that is a script - and every send costs money (SMS pumping is the
 * classic attack on exactly this kind of endpoint), which is why the platform-wide daily cap exists at all.
 */
export const SEND_LIMITS = {
  /** Seconds before the same number can be sent another code. */
  phoneCooldownMs: 60_000,
  phonePerHour: 5,
  phonePerDay: 8,
  ipPerHour: 10,
  ipPerDay: 25,
  userPerDay: 8,
  /** All codes, all numbers, one day. Overridable with SMS_DAILY_CAP. Bounds the bill if everything else fails. */
  platformPerDay: 300,
} as const;

export const WINDOWS = { MINUTE, HOUR, DAY };

export type SendCounts = {
  /** ms since the last code to this number, or null when none in the last day */
  sinceLastToPhoneMs: number | null;
  phoneLastHour: number;
  phoneLastDay: number;
  ipLastHour: number;
  ipLastDay: number;
  userLastDay: number;
  platformLastDay: number;
};

export type SendRefusal = 'cooldown' | 'phone_limit' | 'ip_limit' | 'user_limit' | 'platform_limit';

/** Which limit, if any, refuses this send. Checked from the most specific to the widest. */
export function sendRefusal(c: SendCounts, platformCap: number = SEND_LIMITS.platformPerDay): SendRefusal | null {
  if (c.sinceLastToPhoneMs !== null && c.sinceLastToPhoneMs < SEND_LIMITS.phoneCooldownMs) return 'cooldown';
  if (c.phoneLastHour >= SEND_LIMITS.phonePerHour || c.phoneLastDay >= SEND_LIMITS.phonePerDay) return 'phone_limit';
  if (c.ipLastHour >= SEND_LIMITS.ipPerHour || c.ipLastDay >= SEND_LIMITS.ipPerDay) return 'ip_limit';
  if (c.userLastDay >= SEND_LIMITS.userPerDay) return 'user_limit';
  if (c.platformLastDay >= platformCap) return 'platform_limit';
  return null;
}

/** Seconds left on the cooldown, for "אפשר לבקש קוד חדש בעוד 40 שניות". */
export function cooldownSecondsLeft(sinceLastMs: number | null): number {
  if (sinceLastMs === null) return 0;
  return Math.max(0, Math.ceil((SEND_LIMITS.phoneCooldownMs - sinceLastMs) / 1000));
}

export function platformDailyCap(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SMS_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : SEND_LIMITS.platformPerDay;
}

// ── codes ────────────────────────────────────────────────────────────────────

/** A uniformly random 6-digit code (leading zeros kept). */
export function newCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/** What is stored instead of the code: HMAC over the code AND the number, so a hash for one number proves nothing for another. */
export function hashCode(secret: string, phone: string, code: string): string {
  return createHmac('sha256', secret).update(`otp:${phone}:${code}`).digest('base64url');
}

export function codeMatches(secret: string, phone: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(secret, phone, cleanCode(code)));
  const b = Buffer.from(String(storedHash || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Digits only - she may paste "123 456" or a code with Hebrew around it from the SMS. */
export function cleanCode(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export function isCodeShape(raw: unknown): boolean {
  return cleanCode(raw).length === CODE_LENGTH;
}

/** The SMS text. Short (one Hebrew SMS segment is 70 characters), the code first so the phone can offer to autofill it. */
export function smsText(code: string): string {
  return `${code} הוא קוד האימות שלך לקלמיה. הקוד בתוקף ל-10 דקות.`;
}

// ── the signup ticket ────────────────────────────────────────────────────────
// At signup the number is verified BEFORE the account exists, so there is nobody to attach it to yet. The server
// answers a correct code with a signed ticket for that number; the signup form stores number + ticket in the new
// account's metadata, and the first signed-in request (POST /api/phone/status) checks the signature and claims the
// number for her. The metadata is hers to edit, which is fine: without the server's secret a ticket cannot be made,
// and a ticket reused on a second account is refused by the database (the number is already held).

const ticketMessage = (phone: string) => `phone-signup:${phone}`;

export function signupTicket(secret: string, phone: string, nowMs: number = Date.now()): string {
  return signWithExpiry(secret, ticketMessage(phone), nowMs + SIGNUP_TICKET_TTL_MS);
}

export function signupTicketValid(secret: string, phone: string, ticket: unknown, nowMs: number = Date.now()): boolean {
  if (typeof ticket !== 'string' || !ticket.includes('.')) return false; // dated tokens only; no legacy format here
  return verifyWithExpiry(ticket, ticketMessage(phone), secret, [], nowMs);
}

// ── who is asked, and how firmly ─────────────────────────────────────────────

export type PhoneFlags = { signup: boolean; existing: boolean; since: string | null };

export const FLAGS_OFF: PhoneFlags = { signup: false, existing: false, since: null };

/**
 *   none      say nothing
 *   prompt    ask, with "later" (an account that existed before the rule)
 *   required  no way into the app without it (an account created after the rule)
 */
export type PhoneGate = 'none' | 'prompt' | 'required';

export function decidePhoneGate(input: {
  flags: PhoneFlags;
  smsReady: boolean;
  hasVerifiedPhone: boolean;
  isDemoTenant: boolean;
  userCreatedAt: string | null | undefined;
}): PhoneGate {
  const { flags, smsReady, hasVerifiedPhone, isDemoTenant, userCreatedAt } = input;
  if (hasVerifiedPhone || isDemoTenant) return 'none';
  // A code that cannot be sent must never stand between her and her calendar.
  if (!smsReady) return 'none';
  const created = Date.parse(String(userCreatedAt || ''));
  const since = Date.parse(String(flags.since || ''));
  if (flags.signup && Number.isFinite(created) && Number.isFinite(since) && created >= since) return 'required';
  // Older accounts: only when the "ask existing accounts" switch is on. The signup switch alone never nags them.
  return flags.existing ? 'prompt' : 'none';
}

/** Does the signup form ask for the mobile first? */
export function signupNeedsPhone(flags: PhoneFlags, smsReady: boolean): boolean {
  return flags.signup && smsReady;
}

// ── Hebrew ───────────────────────────────────────────────────────────────────
// Feminine, warm, and every refusal names the way forward.

export const PHONE_COPY_HE = {
  // The one this whole feature is for. Points to login and to password recovery, never a dead end.
  taken: 'למספר הזה כבר יש חשבון בקלמיה. אפשר להתחבר אליו, ואם הסיסמה נשכחה, לאפס אותה בעמוד הכניסה.',
  hasOther: 'לחשבון שלך כבר מחובר מספר נייד אחר. כדי להחליף אותו, כתבי לנו ונעזור.',
  cooldown: (s: number) => `שלחנו קוד ממש עכשיו. אפשר לבקש קוד חדש בעוד ${s} שניות.`,
  phoneLimit: 'ביקשת כבר כמה קודים למספר הזה. נסי שוב בעוד שעה, ואם הקוד לא מגיע, כתבי לנו.',
  ipLimit: 'נשלחו יותר מדי קודים מהמכשיר הזה. נסי שוב בעוד שעה.',
  platformLimit: 'שליחת הקודים עמוסה כרגע. נסי שוב בעוד כמה שעות, או כתבי לנו ונעזור.',
  wrongCode: (left: number) => left > 0 ? `הקוד לא תואם. נשארו עוד ${left} ניסיונות.` : 'הקוד לא תואם. בקשי קוד חדש ונסי שוב.',
  noCode: 'הקוד פג או שכבר השתמשת בו. בקשי קוד חדש.',
  codeShape: 'הקוד הוא 6 ספרות, כפי שהגיע בהודעה.',
  sendFailed: 'לא הצלחנו לשלוח SMS כרגע. נסי שוב בעוד דקה.',
  unavailable: 'אימות בטלפון עוד לא זמין. אפשר להמשיך בלי זה בינתיים.',
  notReady: 'משהו נתקע אצלנו. נסי שוב בעוד רגע.',
  ticketLost: 'האימות של המספר לא נשמר עם החשבון. נאמת אותו שוב, זה לוקח רגע.',
} as const;

export function refusalCopy(r: SendRefusal, sinceLastMs: number | null): string {
  switch (r) {
    case 'cooldown': return PHONE_COPY_HE.cooldown(cooldownSecondsLeft(sinceLastMs) || 60);
    case 'phone_limit': return PHONE_COPY_HE.phoneLimit;
    case 'ip_limit': return PHONE_COPY_HE.ipLimit;
    case 'user_limit': return PHONE_COPY_HE.phoneLimit;
    case 'platform_limit': return PHONE_COPY_HE.platformLimit;
  }
}
