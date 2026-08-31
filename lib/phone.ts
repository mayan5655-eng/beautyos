// lib/phone.ts
//
// One definition of "is this a phone number we can actually reach".
//
// ── Why there are TWO functions here, not one ────────────────────────────────
//
// They answer different questions and must not be merged:
//
//   normalizeIsraeliMobile()  STRICT. For a number a human is typing RIGHT NOW.
//                             Israeli mobiles only. Refuses landlines, refuses
//                             anything malformed, and gives a reason the UI can
//                             show her. This is the front door.
//
//   toWhatsAppNumber()        LENIENT. For a number ALREADY IN THE DATABASE
//                             that we are about to message. Accepts any
//                             plausible international number and refuses only
//                             what cannot be a phone at all.
//
// The split exists because the two failure costs are opposite. At the front
// door, accepting "abc" costs a booking nobody can confirm. At the send path,
// refusing an unusual-but-real number costs a client her reminder - and the
// stored data includes imported rows in several shapes ("0542845655" typed in
// the app, "972526666306" from an export) plus the occasional tourist with a
// non-Israeli number that GreenAPI can genuinely deliver to.
//
// So: strict about what we accept, lenient about what we send. Applying the
// strict rule to sends would silently stop messaging real clients whose numbers
// have worked for a year.
//
// The strict half was written for the leads importer, where the normalised
// value becomes the upsert key. It lives here now because the booking flow
// needs exactly the same rule; lib/leads/csvImport.ts re-exports it so every
// existing importer is untouched.

// ── STRICT: new input ────────────────────────────────────────────────────────

export type PhoneReason =
  | 'empty'
  | 'no_digits'
  | 'not_israeli_mobile';

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: PhoneReason };

/** 972 + 5 + 8 more digits. Israeli mobiles only; landlines are refused. */
const ISRAELI_MOBILE = /^9725\d{8}$/;

export function normalizeIsraeliMobile(raw: string | null | undefined): PhoneResult {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, reason: 'empty' };

  // Strip everything that is not a digit. This also removes a leading +, any
  // Hebrew text, and the (0) some exports write inside international numbers.
  const digits = input.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'no_digits' };

  let candidate = digits;
  if (candidate.startsWith('00972')) candidate = candidate.slice(2);
  if (candidate.startsWith('0')) candidate = '972' + candidate.slice(1);
  else if (candidate.startsWith('5') && candidate.length === 9) candidate = '972' + candidate;

  if (!ISRAELI_MOBILE.test(candidate)) return { ok: false, reason: 'not_israeli_mobile' };
  return { ok: true, e164: candidate };
}

/** True for a well-formed Israeli mobile, in any of the shapes people type. */
export function isValidIsraeliMobile(raw: string | null | undefined): boolean {
  return normalizeIsraeliMobile(raw).ok;
}

/**
 * What to show her when it is refused.
 *
 * Every message names the fix rather than the fault, and the example is a real
 * shape so she can see what is expected instead of guessing at a format.
 */
export const PHONE_ERROR_HE: Record<PhoneReason, string> = {
  empty: 'נא להזין מספר טלפון',
  no_digits: 'מספר הטלפון אינו תקין — נא להזין ספרות בלבד, למשל 0501234567',
  not_israeli_mobile: 'נא להזין מספר נייד ישראלי תקין, למשל 0501234567',
};

/** The message for a raw value, or null when it is fine. */
export function phoneErrorHe(raw: string | null | undefined): string | null {
  const res = normalizeIsraeliMobile(raw);
  return res.ok ? null : PHONE_ERROR_HE[res.reason];
}

// ── LENIENT: sending to a number already on file ─────────────────────────────

/**
 * Digits for a GreenAPI chat id, or null when the value cannot be a phone.
 *
 * A leading 0 is Israeli-local and becomes 972. Anything else is passed through
 * as typed, because it may legitimately be a foreign number.
 *
 * The length window is E.164's own: a national number is at most 15 digits, and
 * nothing shorter than 7 reaches a person. That is deliberately wide - the job
 * here is to catch "abc", "לא ידוע", "05" and an empty string, not to police
 * dialling plans we do not know.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  let out = digits;
  if (out.startsWith('00')) out = out.slice(2);
  if (out.startsWith('0')) out = '972' + out.slice(1);

  if (out.length < 7 || out.length > 15) return null;
  return out;
}
