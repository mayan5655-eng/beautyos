// lib/grow/ops.ts
//
// The Grow operations that saved cards need, behind one interface with a mock and a live implementation:
//   createTokenSession  open Grow's HOSTED credit-card page where the client types the card. save_only: NO charge, only a token. charge_and_save:
//                       a real payment AND a token. We only ever receive a token reference, never a card number.
//   chargeToken         charge a saved token (createTransactionWithToken) on the merchant's OWN Grow account, with a numeric
//                       transactionUniqueIdentifier that is never reused. Error 1010 (identifier already seen) comes back as code 'duplicate'.
//   lookupToken         look a token transaction up by its unique identifier (getTokenTransactionsByExternalIdentifiers, ONE identifier only).
//   refund              return all or part of a payment to the client's card.
//
// mock  no network. The token page is /api/grow/mock-token on our own origin; tokens say how they behave when charged (ok / decline); an
//       identifier used twice answers 1010 like Grow; every refund succeeds. Never reachable on Vercel production (lib/grow/adapter.ts).
// live  the real API, following developers.grow.business ("Work with Token"), checked against Grow's SANDBOX with the test credentials.
//       Production values (GROW_TOKEN_*, GROW_API_BASE) come from Grow when the live account is issued.
import { buildSessionFields, buildTokenChargeFields, buildLookupFields, readEnvelope, GROW_ERR_DUPLICATE, GROW_FINAL_CARD_ERRORS } from './tokenFlow.ts';
import type { TokenCreds } from './tokenFlow.ts';
import { growFullName, growPhone } from './payload.ts';

export type OpsFail = { ok: false; code: 'declined' | 'not-confirmed' | 'unreachable' | 'duplicate'; error: string; errId?: number | null; final?: boolean };

export type TokenSessionInput = {
  tenantId: string; userId: string; appointmentId: string; returnUrl: string;
  /** save_only (default): no charge. charge_and_save: pay `amount` now and keep the card. */
  mode?: 'save_only' | 'charge_and_save';
  amount?: number;
  fullName?: string;
  phone?: string;
  /** Where Grow posts the token (our /api/grow/webhook). */
  notifyUrl?: string;
};
export type TokenSessionResult = { ok: true; url: string; processId?: string; processToken?: string } | OpsFail;

export type ChargeTokenInput = {
  userId: string; tokenRef: string; amount: number; description: string;
  /** Numeric, generated on our server, saved BEFORE this call, never reused (not even after a refusal). */
  uniqueIdentifier: number;
  /** Not unique, for looking things up later (one per appointment). */
  groupIdentifier?: number;
  fullName?: string;
  phone?: string;
};
export type ChargeTokenResult =
  | { ok: true; transactionId: string; transactionToken?: string; asmachta?: string; invoiceUrl?: string; invoiceNumber?: string }
  | OpsFail;

export type LookupInput = { userId: string; tokenRef: string; uniqueIdentifier: number };
export type LookupResult =
  | { ok: true; found: boolean; status: 'paid' | 'failed' | 'pending' | 'unknown'; transactionId?: string; transactionToken?: string; asmachta?: string }
  | OpsFail;

export type RefundInput = { userId: string; transactionId: string; transactionToken?: string; amount: number; idempotencyKey: string };
export type RefundResult = { ok: true; refundId: string } | OpsFail;

export interface GrowOps {
  createTokenSession(i: TokenSessionInput): Promise<TokenSessionResult>;
  chargeToken(i: ChargeTokenInput): Promise<ChargeTokenResult>;
  lookupToken(i: LookupInput): Promise<LookupResult>;
  refund(i: RefundInput): Promise<RefundResult>;
}

const rid = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export const MOCK_TOKEN_OK = 'mocktokcard_ok_';
export const MOCK_TOKEN_DECLINE = 'mocktokcard_decline_';
export const newMockCardToken = (kind: 'ok' | 'decline') => (kind === 'ok' ? MOCK_TOKEN_OK : MOCK_TOKEN_DECLINE) + rid();

// ── mock ─────────────────────────────────────────────────────────────────────

export function createMockOps(origin: string, sign: (tenantId: string, appointmentId: string) => string): GrowOps {
  const base = origin.replace(/\/+$/, '');
  const docUrl = (id: string) => (/^https:\/\//i.test(base) ? `${base}/api/grow/mock-pay?doc=${encodeURIComponent(id)}` : `https://mock.grow.invalid/doc/${id}`);
  // What this mock business has already seen: a repeated identifier is refused outright, like Grow does.
  const seen = new Map<string, { status: 'paid' | 'failed'; transactionId?: string; asmachta?: string }>();
  return {
    async createTokenSession(i) {
      return { ok: true, url: `${base}/api/grow/mock-token?s=${encodeURIComponent(sign(i.tenantId, i.appointmentId))}`, processId: `mockproc_${rid()}` };
    },
    async chargeToken(i) {
      if (!Number.isFinite(i.uniqueIdentifier)) return { ok: false, code: 'declined', error: 'mock: no identifier' };
      const key = `${i.userId}:${i.uniqueIdentifier}`;
      if (seen.has(key)) return { ok: false, code: 'duplicate', errId: GROW_ERR_DUPLICATE, error: 'mock: identifier already used' };
      if (!(i.amount > 0)) { seen.set(key, { status: 'failed' }); return { ok: false, code: 'declined', error: 'mock: bad amount' }; }
      if (i.tokenRef.startsWith(MOCK_TOKEN_OK)) {
        const transactionId = `mocktx_${rid()}`;
        const asmachta = String(Math.floor(Math.random() * 9e6) + 1e6);
        seen.set(key, { status: 'paid', transactionId, asmachta });
        return { ok: true, transactionId, transactionToken: `mocktt_${rid()}`, asmachta, invoiceUrl: docUrl(transactionId), invoiceNumber: String(Math.floor(Math.random() * 90000) + 10000) };
      }
      seen.set(key, { status: 'failed' });
      return { ok: false, code: 'declined', error: 'mock: card declined', errId: 103, final: true };
    },
    async lookupToken(i) {
      const r = seen.get(`${i.userId}:${i.uniqueIdentifier}`);
      if (!r) return { ok: true, found: false, status: 'unknown' };
      return { ok: true, found: true, status: r.status, transactionId: r.transactionId, asmachta: r.asmachta };
    },
    async refund(i) {
      if (!i.transactionId || !(i.amount > 0)) return { ok: false, code: 'declined', error: 'mock: nothing to refund' };
      return { ok: true, refundId: `mockrf_${rid()}` };
    },
  };
}

// ── live ─────────────────────────────────────────────────────────────────────

/** Grow wants multipart form fields from the server, apiKey included as a field (a header is refused with error 701). */
async function post(creds: TokenCreds, path: string, fields: [string, string][]): Promise<{ ok: boolean; json: unknown }> {
  const form = new FormData();
  for (const [k, v] of fields) form.append(k, v);
  try {
    const res = await fetch(`${creds.apiBase}/${path}`, { method: 'POST', body: form });
    return { ok: res.ok, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, json: null };
  }
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** Sandbox uses the single test business; production uses the cosmetician's own userId. */
const userFor = (creds: TokenCreds, userId: string) => creds.userIdOverride || userId;

/** The transactions in getTokenTransactionsByExternalIdentifiers' answer: an array, an object keyed by id, or a single record. */
function transactionsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.flatMap(transactionsOf);
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if ('transactionId' in o || 'statusCode' in o) return [o];
    return Object.values(o).flatMap(transactionsOf);
  }
  return [];
}

export function createLiveOps(creds: TokenCreds): GrowOps {
  const unreachable: OpsFail = { ok: false, code: 'unreachable', error: 'could not reach Grow' };
  return {
    async createTokenSession(i) {
      const phone = growPhone(i.phone);
      if (!phone) return { ok: false, code: 'declined', error: 'client phone is not an Israeli mobile' };
      const mode = i.mode || 'save_only';
      if (mode === 'charge_and_save' && !(Number(i.amount) > 0)) return { ok: false, code: 'declined', error: 'amount missing' };
      const r = await post(creds, 'createPaymentProcess', buildSessionFields(creds, {
        mode, userId: userFor(creds, i.userId), amount: i.amount, description: mode === 'save_only' ? 'שמירת כרטיס לחיוב עתידי' : 'תשלום ושמירת כרטיס',
        fullName: growFullName(i.fullName || ''), phone, successUrl: i.returnUrl, cancelUrl: i.returnUrl, notifyUrl: i.notifyUrl || i.returnUrl,
        appointmentRef: i.appointmentId, tenantId: i.tenantId,
      }));
      if (!r.ok && r.json === null) return unreachable;
      const env = readEnvelope(r.json);
      const url = str(env.data.url);
      if (!env.ok || !/^https:\/\//i.test(url)) return { ok: false, code: 'not-confirmed', error: `Grow did not return a card page (${env.errId ?? 'no id'})`, errId: env.errId };
      return { ok: true, url, processId: str(env.data.processId) || undefined, processToken: str(env.data.processToken) || undefined };
    },
    async chargeToken(i) {
      const phone = growPhone(i.phone);
      if (!phone) return { ok: false, code: 'declined', error: 'client phone is not an Israeli mobile' };
      const r = await post(creds, 'createTransactionWithToken', buildTokenChargeFields(creds, {
        userId: userFor(creds, i.userId), cardToken: i.tokenRef, amount: i.amount, description: i.description,
        fullName: growFullName(i.fullName || ''), phone, uniqueIdentifier: i.uniqueIdentifier, groupIdentifier: i.groupIdentifier,
      }));
      if (!r.ok && r.json === null) return unreachable;
      const env = readEnvelope(r.json);
      if (!env.ok) {
        if (env.errId === GROW_ERR_DUPLICATE) return { ok: false, code: 'duplicate', error: 'identifier already used', errId: env.errId };
        return { ok: false, code: 'declined', error: env.errMessage || 'declined', errId: env.errId, final: env.errId !== null && GROW_FINAL_CARD_ERRORS.has(env.errId) };
      }
      const transactionId = str(env.data.transactionId);
      if (!transactionId) return { ok: false, code: 'not-confirmed', error: 'no transaction id in the answer', errId: env.errId };
      const invoiceUrl = typeof env.data.invoiceUrl === 'string' && /^https:\/\//i.test(env.data.invoiceUrl) ? env.data.invoiceUrl : undefined;
      return { ok: true, transactionId, transactionToken: str(env.data.transactionToken) || undefined, asmachta: str(env.data.asmachta) || undefined, invoiceUrl, invoiceNumber: str(env.data.invoiceNumber) || undefined };
    },
    async lookupToken(i) {
      const r = await post(creds, 'getTokenTransactionsByExternalIdentifiers', buildLookupFields(creds, { userId: userFor(creds, i.userId), cardToken: i.tokenRef, uniqueIdentifier: i.uniqueIdentifier }));
      if (!r.ok && r.json === null) return unreachable;
      const env = readEnvelope(r.json);
      if (!env.ok) return { ok: false, code: 'not-confirmed', error: env.errMessage || 'lookup refused', errId: env.errId };
      const tx = transactionsOf(env.data);
      if (!tx.length) return { ok: true, found: false, status: 'unknown' };
      const t0 = tx[0];
      const code = str(t0.statusCode);
      // Grow's statusCode 2 is paid; a transaction that never completed carries only received_time / complete_time.
      const status = code === '2' ? 'paid' : t0.transactionId ? (code === '3' ? 'failed' : 'pending') : 'pending';
      return { ok: true, found: true, status, transactionId: str(t0.transactionId) || undefined, transactionToken: str(t0.transactionToken) || undefined, asmachta: str(t0.asmachta) || undefined };
    },
    async refund(i) {
      const fields: [string, string][] = [['apiKey', creds.apiKey], ['userId', userFor(creds, i.userId)], ['transactionId', i.transactionId], ['refundSum', i.amount.toFixed(2)]];
      if (i.transactionToken) fields.push(['transactionToken', i.transactionToken]);
      const r = await post(creds, 'refundTransaction', fields);
      if (!r.ok && r.json === null) return unreachable;
      const env = readEnvelope(r.json);
      if (!env.ok) return { ok: false, code: 'declined', error: env.errMessage || 'refund refused', errId: env.errId };
      return { ok: true, refundId: str(env.data.refundId) || str(env.data.transactionId) || i.transactionId };
    },
  };
}
