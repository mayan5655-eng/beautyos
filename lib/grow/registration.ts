// lib/grow/registration.ts
//
// "I don't have Grow yet": open a Grow account from inside Kalmea, through Grow's platform registration link ("GetLink").
//
//   1. She presses "פתיחת חשבון Grow". The server asks Grow for a registration link for HER (createLink), with a random
//      tracking code that is ours, and stores { tracking_code, encrypted_lead, link_url, status: 'waiting' } in
//      grow_onboarding_pending (server-only table, add_grow_onboarding.sql + add_grow_cashier.sql).
//   2. She fills Grow's form on Grow's page. Grow reviews the business.
//   3. Grow posts the registration result to /api/grow/webhook (lib/grow/webhook.ts applyOnboarding). It is matched to her
//      business ONLY by the tracking code we created; then:
//        approved  -> her userId is stored and clearing is switched ON, for her business only
//        rejected  -> the pending row says so, with Grow's reason; nothing is switched on
//        anything else -> still waiting
//
// THE LIVE CALL IS NOT IN GROW'S PUBLIC DOCS. developers.grow.business only says an approved platform "can implement Grow's
// registration form directly within their system" and that it "requires coordination with Grow" (read 2026-10-20). So:
//   - mock mode (the default) works end to end: the link opens /api/grow/mock-register, a stand-in for Grow's form with
//     approve / reject buttons that feed the same webhook logic;
//   - live mode calls `${apiBase}/${GROW_REGISTRATION_PATH}` with the fields below, ONLY when GROW_REGISTRATION_PATH is set.
//     Every field name is marked TODO(grow-docs): replace them with Grow's when they send the spec. Until then live answers
//     'not-available' and the card keeps the old "leave your details" request.

export type RegistrationStatus = 'waiting' | 'approved' | 'rejected';

export type RegisterInput = {
  trackingCode: string;
  businessName: string;
  fullName: string;
  phone: string;
  email?: string;
  /** Where Grow sends the registration result (our platform webhook). */
  notifyUrl: string;
  /** Where Grow's form sends her when she is done. */
  returnUrl: string;
};

export type RegisterResult =
  | { ok: true; url: string; encryptedLead: string | null }
  | { ok: false; code: 'not-available' | 'refused' | 'unreachable'; error: string };

export interface RegistrationOps {
  createLink(i: RegisterInput): Promise<RegisterResult>;
}

const rid = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/** A tracking code only we know: 24 hex characters from the caller's random source. */
export function newTrackingCode(randomHex: () => string): string {
  const s = String(randomHex() || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (s.length < 24) throw new Error('tracking code needs 24 hex characters');
  return s.slice(0, 24);
}

export function createMockRegistration(origin: string): RegistrationOps {
  const base = origin.replace(/\/+$/, '');
  return {
    async createLink(i) {
      if (!/^[0-9a-f]{24}$/.test(i.trackingCode)) return { ok: false, code: 'refused', error: 'mock: bad tracking code' };
      return { ok: true, url: `${base}/api/grow/mock-register?c=${i.trackingCode}`, encryptedLead: `mocklead_${rid()}` };
    },
  };
}

type LiveCfg = { apiKey: string; apiBase: string; path: string };

/** TODO(grow-docs): field names and the response shape are placeholders until Grow sends the registration spec. */
export function createLiveRegistration(cfg: LiveCfg, fetchImpl: typeof fetch = fetch): RegistrationOps {
  return {
    async createLink(i) {
      const form = new FormData();
      form.append('apiKey', cfg.apiKey); // a body field, like every Grow call (a header is refused, error 701)
      form.append('trackingCode', i.trackingCode); // TODO(grow-docs)
      form.append('businessName', i.businessName); // TODO(grow-docs)
      form.append('fullName', i.fullName); // TODO(grow-docs)
      form.append('phone', i.phone); // TODO(grow-docs)
      if (i.email) form.append('email', i.email); // TODO(grow-docs)
      form.append('notifyUrl', i.notifyUrl); // TODO(grow-docs)
      form.append('returnUrl', i.returnUrl); // TODO(grow-docs)
      let json: unknown = null;
      try {
        const res = await fetchImpl(`${cfg.apiBase}/${cfg.path.replace(/^\/+/, '')}`, { method: 'POST', body: form });
        json = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, code: 'refused', error: `http ${res.status}` };
      } catch {
        return { ok: false, code: 'unreachable', error: 'unreachable' };
      }
      return readRegisterResponse(json);
    },
  };
}

/** Grow's usual envelope { status: 1, data: {...} }; the link and the lead id under a few likely names. TODO(grow-docs). */
export function readRegisterResponse(json: unknown): RegisterResult {
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  if (Number(o.status) !== 1) {
    const e = o.err && typeof o.err === 'object' ? String((o.err as Record<string, unknown>).message || '') : String(o.err || '');
    return { ok: false, code: 'refused', error: e.slice(0, 200) || 'refused' };
  }
  const d = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : {};
  const url = String(d.url || d.link || d.registrationUrl || '');
  if (!/^https:\/\//i.test(url)) return { ok: false, code: 'refused', error: 'no https link in the answer' };
  const lead = d.encrypted_lead ?? d.encryptedLead ?? d.lead ?? null;
  return { ok: true, url, encryptedLead: lead == null ? null : String(lead).slice(0, 500) };
}

/** Which registration this deployment can open: mock, live (only with GROW_REGISTRATION_PATH), or none. */
export function registrationOps(
  env: Record<string, string | undefined>,
  mode: 'mock' | 'live',
  configured: boolean,
  creds: { apiKey: string; apiBase: string } | null,
  origin: string,
): RegistrationOps | null {
  if (!configured) return null;
  if (mode === 'mock') return createMockRegistration(origin);
  const path = String(env.GROW_REGISTRATION_PATH || '').trim();
  if (!path || !creds) return null;
  return createLiveRegistration({ apiKey: creds.apiKey, apiBase: creds.apiBase, path });
}

/**
 * The status an onboarding update means. Grow's wording is not documented (TODO(grow-docs)), so it is read defensively:
 *   an explicit refusal in the status or the tracking message -> rejected
 *   a userId arrived (Grow only issues one to an open business) -> approved
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
