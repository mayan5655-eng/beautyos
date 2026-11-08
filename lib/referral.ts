// lib/referral.ts
//
// "חברה מביאה חברה" for Kalmea's OWN subscription: a business invites another business with a personal link, and when the new business
// makes her FIRST successful paid charge, both get one free month. Not the client-to-client referral (app/ClientReferral.jsx), which is
// a cosmetician's own clients inviting friends.
//
// How it fits together (supabase/migrations/add_referrals_annual_2026-11-08.sql):
//   referral_codes    one unguessable code per business (10 characters from a 32-letter alphabet, 50 random bits), made on the server.
//   referrals         who brought whom. Written ONLY by a database trigger on the new tenant's insert, from the code she signed up
//                     with (auth metadata kl_ref, present at that moment). After the tenant exists nothing the browser does can add or
//                     change it: no browser role may write the table, and the trigger runs once, at the insert.
//   referral_rewards  the free months. One per side per referral, EVER (unique (referral_id, role)): granted by the billing run when the
//                     referred business's first paid subscription charge succeeds, consumed by the billing run in place of a charge.
//
// THE REWARD RULE (safe and simple):
//   1. Only a referral the trigger marked 'joined' counts: the same owner, the same email (ignoring +tags and Gmail dots) or the same
//      verified mobile is marked 'ineligible' at signup and never earns anything. A business can never refer itself (a check constraint).
//   2. The trigger is the referred business's FIRST successful subscription charge with real money (a free month is not a charge, a
//      manual payment is not a card charge). If she had paid before the feature was switched on, there is no "first" any more: nothing.
//   3. Both months are held for REFERRAL_HOLD_DAYS after that charge (the consumer cancellation window), and when a month is about to
//      be used the charge that earned it must still be 'succeeded' and the referral not voided. A refund or a void (the admin panel's
//      "ביטול התגמול", or the payment row no longer succeeded) means the month is voided, never used.
//   4. The referrer earns at most REFERRAL_MAX_PER_YEAR months in any 365 days. The referred business always gets hers.
//   5. A month is one month whatever her plan: the next due charge is skipped and her paid period moves forward by one calendar month.
//
// OFF until the owner switches it on: NEXT_PUBLIC_REFERRALS=1 in Vercel (read by the server for billing and the routes, and by the app
// for the card and the signup banner; a redeploy is needed). While off, no card, no lookup, no reward, no credit: billing is exactly as before.

export const REFERRAL_HOLD_DAYS = 14;
/** The referrer's cap: free months earned in any 365 days. */
export const REFERRAL_MAX_PER_YEAR = 12;

/** No 0/O and no 1/I: a code read aloud or copied by hand stays right. 32 characters, so a random byte maps evenly (256 = 8 x 32).
 *  The migration's check (^[A-HJ-NP-Z2-9]{10}$) is the same set. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 10;
const CODE_RE = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

export function referralsEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_REFERRALS: process.env.NEXT_PUBLIC_REFERRALS }): boolean {
  return String(env.NEXT_PUBLIC_REFERRALS || '').trim() === '1';
}

// Web Crypto (Node 22 and every browser), so this file can also be imported by the app for the flag and the code shape.
export function newReferralCode(rand: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = rand(REFERRAL_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) out += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  return out;
}

/** A code as typed or carried in a link, normalised; null for anything that is not a code shape. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

export function referralLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, '')}/signup?ref=${encodeURIComponent(code)}`;
}

/** The message she shares herself (wa.me opens her own WhatsApp with it; nothing is sent by Kalmea). */
export function referralShareTextHe(link: string): string {
  return `היי! אני עובדת עם קלמיה, מערכת לניהול העסק שלי (יומן, לקוחות, תזכורות ושיווק). אם תצטרפי דרך הקישור שלי, אחרי התשלום הראשון שלך שתינו מקבלות חודש במתנה 🌸\n${link}`;
}

export function referralWhatsAppHref(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(referralShareTextHe(link))}`;
}

// The billing run uses the patterns below; the shapes are shared with lib/billing/referralRepo.ts.
export type ReferralRow = { id: string; referrer_tenant_id: string; referred_tenant_id: string; status: 'joined' | 'ineligible' | 'rewarded' | 'voided' };
export type RewardRow = { id: string; referral_id: string; tenant_id: string; role: 'referrer' | 'referred'; trigger_payment_id: string | null; available_at: string; consumed_at: string | null; voided_at: string | null };
/** A month that may be used now, with what decides whether it still stands. */
export type CreditCandidate = { id: string; referral_status: string | null; payment_status: string | null };

/** What the referrer reads in Settings: counts only, never another business's name. */
export type ReferralStats = { joined: number; paid: number; earned: number; used: number; waiting: number; available: number };

export function referralStats(referrals: Pick<ReferralRow, 'status'>[], rewards: Pick<RewardRow, 'available_at' | 'consumed_at' | 'voided_at'>[], now: Date): ReferralStats {
  const live = rewards.filter((r) => !r.voided_at);
  return {
    joined: referrals.filter((r) => r.status === 'joined' || r.status === 'rewarded').length,
    paid: referrals.filter((r) => r.status === 'rewarded').length,
    earned: live.length,
    used: live.filter((r) => r.consumed_at).length,
    waiting: live.filter((r) => !r.consumed_at && Date.parse(r.available_at) > now.getTime()).length,
    available: live.filter((r) => !r.consumed_at && Date.parse(r.available_at) <= now.getTime()).length,
  };
}

/** The admin panel's word for one side's month. */
export function rewardStatusHe(r: Pick<RewardRow, 'available_at' | 'consumed_at' | 'voided_at'> | null, now: Date): string {
  if (!r) return 'ממתין לתשלום ראשון';
  if (r.voided_at) return 'בוטל';
  if (r.consumed_at) return 'נוצל';
  return Date.parse(r.available_at) > now.getTime() ? 'בהמתנה' : 'זמין';
}
