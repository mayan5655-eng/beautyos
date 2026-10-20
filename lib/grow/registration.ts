// lib/grow/registration.ts
//
// "I don't have Grow yet": open a Grow account from inside Kalmea, through Grow's lead registration ("GetLink").
//
//   1. She types her ID / business number and her mobile and presses "פתיחת חשבון Grow". The server calls GetLink for HER
//      (createLink). Grow answers { status: 1, data: { url, encrypted_lead } } and texts the form link to that mobile.
//      We store { tracking_code: encrypted_lead, encrypted_lead, link_url, status: 'waiting' } in grow_onboarding_pending
//      (server-only table). Grow's registration webhook later carries the same value as data.tracking_code.
//   2. She fills Grow's form (from the SMS on that phone, or inside the card in an iframe). Grow reviews the business.
//   3. Grow posts the result to /api/grow/webhook (lib/grow/webhook.ts applyOnboarding). It is matched to her business ONLY
//      by that tracking code; approved -> her user_id (and her api_key, encrypted) are stored and clearing is switched ON for
//      her business only; rejected -> the card says so; anything else -> still waiting.
//
// Wrong mobile: calling GetLink again with the same business number and the right mobile updates the same lead. A lead is
// valid for three months.
//
// GetLink, from Grow's "lead registration" spec:
//   POST <GROW_REGISTER_URL>   (test: https://devregisterapi.meshulam.co.il/GetLink)
//   headers  x-api-key (GROW_REGISTER_API_KEY_TEST / _LIVE), User-Agent (REQUIRED), Content-Type: application/json
//   body     { marketer, business_number, phone (05 + 8 digits), price_quote, is_direct_debit (1 test / 0 live), website: '',
//              is_send_sms: 1 }
// Error ids are mapped to plain Hebrew in GETLINK_ERRORS below.
//
// Mock mode (GROW_MODE=mock, no registration key) still works end to end: the link opens /api/grow/mock-register.

export type RegistrationStatus = 'waiting' | 'approved' | 'rejected';

export type RegisterInput = {
  /** Ours, random; the mock form uses it as its lead id. GetLink does not take it: Grow's encrypted_lead is the match key. */
  trackingCode: string;
  /** Her ID / business number, 9 digits (growBusinessNumber). */
  businessNumber: string;
  /** Her Israeli mobile, 05XXXXXXXX: the SMS with the form goes there, and she must fill the form from that phone. */
  phone: string;
};

export type RegisterErrorKind = 'open-lead' | 'not-approved' | 'exists' | 'bad-phone' | 'bad-business-number' | 'platform' | 'general';

export type RegisterResult =
  | { ok: true; url: string; encryptedLead: string }
  | { ok: false; code: 'not-available' | 'refused' | 'unreachable'; kind: RegisterErrorKind; growId: string; error: string; messageHe: string };

export interface RegistrationOps {
  readonly kind: 'mock' | 'live';
  createLink(i: RegisterInput): Promise<RegisterResult>;
}

// ── Grow's error ids, in her words ───────────────────────────────────────────

const PLATFORM_HE = 'יש תקלה בהגדרות ההרשמה אצלנו מול Grow. אנחנו על זה. אפשר לנסות שוב מאוחר יותר, או להשאיר פרטים ונחזור אלייך.';
const GENERAL_HE = 'Grow לא הצליחה לפתוח את ההרשמה כרגע. אפשר לנסות שוב בעוד כמה דקות.';

export const GETLINK_ERRORS: Record<string, { kind: RegisterErrorKind; he: string }> = {
  '17': { kind: 'open-lead', he: 'כבר יש ב-Grow בקשת הרשמה פתוחה לעסק הזה. כדי להמשיך צריך לפנות לשירות הלקוחות של Grow.' },
  '145': { kind: 'not-approved', he: 'Grow לא מאשרת פתיחת חשבון לעסק הזה. לבירור אפשר לפנות לשירות הלקוחות של Grow.' },
  '149': { kind: 'exists', he: 'לעסק הזה כבר יש חשבון ב-Grow. אפשר לחבר אותו כאן, ב"יש לי חשבון Grow".' },
  '115': { kind: 'platform', he: PLATFORM_HE },
  '143': { kind: 'platform', he: PLATFORM_HE },
  '117': { kind: 'platform', he: PLATFORM_HE },
  '142': { kind: 'platform', he: PLATFORM_HE },
  '121': { kind: 'platform', he: PLATFORM_HE },
  '13': { kind: 'bad-phone', he: 'מספר הנייד לא תקין. צריך נייד ישראלי שמתחיל ב-05, 10 ספרות.' },
  '120': { kind: 'bad-business-number', he: 'מספר תעודת הזהות או העוסק לא תקין. כדאי לבדוק את הספרות ולנסות שוב.' },
  '165': { kind: 'general', he: GENERAL_HE },
};

export function getLinkError(growId: string, message: string): Extract<RegisterResult, { ok: false }> {
  const m = GETLINK_ERRORS[growId] || { kind: 'general' as const, he: GENERAL_HE };
  return { ok: false, code: 'refused', kind: m.kind, growId, error: message.slice(0, 200) || 'refused', messageHe: m.he };
}

// ── input ──────────────────────────────────────────────────────────────────

/** Israeli ID / business number check digit (the same rule for ת.ז., עוסק and ח.פ.). */
export function israeliIdValid(nine: string): boolean {
  if (!/^\d{9}$/.test(nine)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let x = Number(nine[i]) * (i % 2 === 0 ? 1 : 2);
    if (x > 9) x -= 9;
    sum += x;
  }
  return sum % 10 === 0;
}

/** Her ID / business number as Grow wants it: digits only, padded to 9, with a valid check digit; else null. */
export function growBusinessNumber(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D+/g, '');
  if (d.length < 5 || d.length > 9) return null;
  const nine = d.padStart(9, '0');
  return israeliIdValid(nine) ? nine : null;
}

/** A tracking code only we know: 24 hex characters from the caller's random source. */
export function newTrackingCode(randomHex: () => string): string {
  const s = String(randomHex() || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (s.length < 24) throw new Error('tracking code needs 24 hex characters');
  return s.slice(0, 24);
}

export function createMockRegistration(origin: string): RegistrationOps {
  const base = origin.replace(/\/+$/, '');
  return {
    kind: 'mock',
    async createLink(i) {
      if (!/^[0-9a-f]{24}$/.test(i.trackingCode)) return getLinkError('', 'mock: bad tracking code');
      // The mock lead id is our tracking code, so the stand-in form finds the pending row by it (as Grow's tracking_code does).
      return { ok: true, url: `${base}/api/grow/mock-register?c=${i.trackingCode}`, encryptedLead: i.trackingCode };
    },
  };
}

// ── live ───────────────────────────────────────────────────────────────────

export const GROW_REGISTER_TEST_URL = 'https://devregisterapi.meshulam.co.il/GetLink';
export const GROW_REGISTER_USER_AGENT = 'Kalmea/1.0 (+https://kalmea.app)';

export type RegisterCfg = {
  url: string;
  apiKey: string;
  marketer: string;
  priceQuote: string;
  /** 1 in the test environment, 0 live (Grow's rule). */
  isDirectDebit: 0 | 1;
};

type Env = Record<string, string | undefined>;

/**
 * The registration settings for this deployment, or null when the key is missing. Test is the default; live needs
 * GROW_REGISTER_ENV=live plus GROW_REGISTER_API_KEY_LIVE and GROW_REGISTER_URL_LIVE (Grow gives the live address separately).
 */
export function registerConfig(env: Env = process.env): RegisterCfg | null {
  const live = (env.GROW_REGISTER_ENV || '').trim().toLowerCase() === 'live';
  const apiKey = String((live ? env.GROW_REGISTER_API_KEY_LIVE : env.GROW_REGISTER_API_KEY_TEST) || '').trim();
  const url = String((live ? env.GROW_REGISTER_URL_LIVE : env.GROW_REGISTER_URL_TEST || GROW_REGISTER_TEST_URL) || '').trim();
  if (!apiKey || !/^https:\/\//i.test(url)) return null;
  return {
    url,
    apiKey,
    marketer: String(env.GROW_REGISTER_MARKETER || 'b4f38969f705').trim(),
    priceQuote: String(env.GROW_REGISTER_PRICE_QUOTE || '1997').trim(),
    isDirectDebit: live ? 0 : 1,
  };
}

export function getLinkBody(cfg: RegisterCfg, i: RegisterInput): Record<string, string | number> {
  return {
    marketer: cfg.marketer,
    business_number: i.businessNumber,
    phone: i.phone,
    price_quote: cfg.priceQuote,
    is_direct_debit: cfg.isDirectDebit,
    website: '',
    is_send_sms: 1,
  };
}

export function createLiveRegistration(cfg: RegisterCfg, fetchImpl: typeof fetch = fetch): RegistrationOps {
  return {
    kind: 'live',
    async createLink(i) {
      let json: unknown = null;
      let httpStatus = 0;
      try {
        const res = await fetchImpl(cfg.url, {
          method: 'POST',
          headers: { 'x-api-key': cfg.apiKey, 'User-Agent': GROW_REGISTER_USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(getLinkBody(cfg, i)),
          signal: AbortSignal.timeout(20_000),
        });
        httpStatus = res.status;
        json = await res.json().catch(() => null);
      } catch {
        return { ok: false, code: 'unreachable', kind: 'general', growId: '', error: 'unreachable', messageHe: GENERAL_HE };
      }
      if (json == null) return getLinkError('', `http ${httpStatus}, no JSON`);
      return readRegisterResponse(json);
    },
  };
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Grow's answer: { status: 1, err: '', data: { url, encrypted_lead } }, or an error with an id and a message. */
export function readRegisterResponse(json: unknown): RegisterResult {
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const d = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : {};
  if (Number(o.status) !== 1) {
    const e = o.err;
    let id = '';
    let msg = '';
    if (e && typeof e === 'object') {
      const eo = e as Record<string, unknown>;
      id = str(eo.id ?? eo.code ?? eo.error_code);
      msg = str(eo.message ?? eo.msg);
    } else {
      msg = str(e);
      if (/^\d+$/.test(msg)) { id = msg; msg = ''; }
    }
    if (!id) id = str(d.error_code ?? d.id ?? o.error_code ?? o.code);
    if (!msg) msg = str(o.message ?? d.message);
    return getLinkError(id, msg);
  }
  const url = str(d.url);
  const lead = str(d.encrypted_lead);
  if (!/^https:\/\//i.test(url)) return getLinkError('', 'no https link in the answer');
  if (!lead) return getLinkError('', 'no encrypted_lead in the answer');
  return { ok: true, url, encryptedLead: lead.slice(0, 500) };
}

/** Which registration this deployment can open: live when its key is set, else the mock form in mock mode, else none. */
export function registrationOps(env: Env, mode: 'mock' | 'live', configured: boolean, origin: string, fetchImpl?: typeof fetch): RegistrationOps | null {
  const cfg = registerConfig(env);
  if (cfg) return createLiveRegistration(cfg, fetchImpl);
  if (mode === 'mock' && configured) return createMockRegistration(origin);
  return null;
}

/**
 * The status an onboarding update means. Read defensively (Grow's tracking_status ids are not in the spec):
 *   an explicit refusal in the status or the tracking message -> rejected
 *   a user_id arrived (Grow only issues one to an open business) -> approved
 *   otherwise -> waiting
 */
export function registrationStatusOf(u: { userId: string | null; status: string; trackingStatusMessage: string; trackingStatusId: string; err: string }): RegistrationStatus {
  const words = `${u.status} ${u.trackingStatusMessage} ${u.err}`.toLowerCase();
  if (/reject|declin|denied|נדח|לא אושר|סירוב/.test(words)) return 'rejected';
  if (u.userId) return 'approved';
  return 'waiting';
}

export const REGISTRATION_STATUS_HE: Record<RegistrationStatus, string> = {
  waiting: 'הבקשה אצל Grow, מחכים לאישור',
  approved: 'החשבון אושר והסליקה הופעלה',
  rejected: 'Grow לא אישרה את החשבון',
};
