// lib/grow/ops.ts
//
// The three Grow operations that cancellation fees and deposits need, behind one interface with a mock and a live implementation:
//   createTokenSession  open Grow's HOSTED page where the client saves a card for later. NO CHARGE. We only ever receive a token reference.
//   chargeToken         charge a saved token for an amount, on the merchant's OWN Grow account (money never passes through Kalmea).
//   refund              return all or part of a payment to the client's card.
//
// mock  no network. The token page is /api/grow/mock-token on our own origin; tokens say how they behave when charged (ok / decline); every
//       refund succeeds. Never reachable on Vercel production (see lib/grow/adapter.ts).
// live  the real API. EVERYTHING BELOW THAT IS NOT MARKED VERIFIED IS A GUESS: the public Grow docs do not describe card tokens for merchants
//       under a platform. Each guessed field carries TODO(grow-docs). Until Grow confirms them, do not switch live fees on for a real client.
import type { Creds } from './service.ts';

export type OpsFail = { ok: false; code: 'declined' | 'not-confirmed' | 'unreachable'; error: string };

export type TokenSessionInput = { tenantId: string; userId: string; appointmentId: string; returnUrl: string };
export type TokenSessionResult = { ok: true; url: string } | OpsFail;

export type ChargeTokenInput = { userId: string; tokenRef: string; amount: number; description: string; idempotencyKey: string };
export type ChargeTokenResult =
  | { ok: true; transactionId: string; asmachta?: string; invoiceUrl?: string; invoiceNumber?: string }
  | OpsFail;

export type RefundInput = { userId: string; transactionId: string; amount: number; idempotencyKey: string };
export type RefundResult = { ok: true; refundId: string } | OpsFail;

export interface GrowOps {
  createTokenSession(i: TokenSessionInput): Promise<TokenSessionResult>;
  chargeToken(i: ChargeTokenInput): Promise<ChargeTokenResult>;
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
  return {
    async createTokenSession(i) {
      return { ok: true, url: `${base}/api/grow/mock-token?s=${encodeURIComponent(sign(i.tenantId, i.appointmentId))}` };
    },
    async chargeToken(i) {
      if (!(i.amount > 0)) return { ok: false, code: 'declined', error: 'mock: bad amount' };
      if (i.tokenRef.startsWith(MOCK_TOKEN_OK)) {
        const transactionId = `mocktx_${rid()}`;
        return { ok: true, transactionId, asmachta: String(Math.floor(Math.random() * 9e6) + 1e6), invoiceUrl: docUrl(transactionId), invoiceNumber: String(Math.floor(Math.random() * 90000) + 10000) };
      }
      return { ok: false, code: 'declined', error: 'mock: card declined' };
    },
    async refund(i) {
      if (!i.transactionId || !(i.amount > 0)) return { ok: false, code: 'declined', error: 'mock: nothing to refund' };
      return { ok: true, refundId: `mockrf_${rid()}` };
    },
  };
}

// ── live (unverified) ────────────────────────────────────────────────────────

async function post(creds: Creds, path: string, fields: [string, string][]): Promise<{ ok: boolean; json: unknown }> {
  const form = new FormData();
  for (const [k, v] of fields) form.append(k, v);
  try {
    const res = await fetch(`${creds.apiBase}/${path}`, { method: 'POST', headers: { 'x-api-key': creds.apiKey }, body: form });
    return { ok: res.ok, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, json: null };
  }
}

const data = (j: unknown): Record<string, unknown> => ((j as { data?: unknown } | null)?.data && typeof (j as { data: unknown }).data === 'object' ? (j as { data: Record<string, unknown> }).data : {});
const statusOk = (j: unknown) => String((j as { status?: unknown } | null)?.status ?? '') === '1';

export function createLiveOps(creds: Creds): GrowOps {
  const unreachable: OpsFail = { ok: false, code: 'unreachable', error: 'could not reach Grow' };
  return {
    async createTokenSession(i) {
      // TODO(grow-docs): the way to save a card WITHOUT charging for a merchant under a platform is not in the public docs. Guess: the same
      // createPaymentProcess page with a "save token" flag and a zero or minimal authorisation. Field names below are unverified.
      const r = await post(creds, 'createPaymentProcess', [
        ['pageCode', creds.pageCode],
        ['userId', i.userId],                       // the merchant (the cosmetician's own Grow account)
        ['saveCardToken', '1'],                     // TODO(grow-docs): real name of the "save card for later" switch
        ['sum', '0'],                               // TODO(grow-docs): is a zero-sum token page allowed, or is a J5 authorisation needed?
        ['successUrl', i.returnUrl],
        ['cancelUrl', i.returnUrl],
        ['cField1', i.appointmentId],
      ]);
      if (!r.ok && r.json === null) return unreachable;
      const d = data(r.json);
      const url = typeof d.url === 'string' ? d.url : '';
      if (!statusOk(r.json) || !/^https:\/\//i.test(url)) return { ok: false, code: 'not-confirmed', error: 'Grow did not return a card page (TODO(grow-docs))' };
      return { ok: true, url };
    },
    async chargeToken(i) {
      // TODO(grow-docs): endpoint and fields for charging a saved token are unverified. Meshulam's light API lists createTransactionWithToken;
      // whether a platform key may use it for a merchant's userId, and what it returns, is a question for Grow.
      const r = await post(creds, 'createTransactionWithToken', [
        ['pageCode', creds.pageCode],
        ['userId', i.userId],
        ['token', i.tokenRef],                      // TODO(grow-docs): field name of the token reference
        ['sum', String(i.amount)],
        ['description', i.description],
        ['cField1', i.idempotencyKey],              // TODO(grow-docs): is there a real idempotency field?
      ]);
      if (!r.ok && r.json === null) return unreachable;
      const d = data(r.json);
      if (!statusOk(r.json)) return { ok: false, code: 'declined', error: String((r.json as { err?: { message?: string } } | null)?.err?.message || 'declined').slice(0, 160) };
      const transactionId = String(d.transactionId ?? '');
      if (!transactionId) return { ok: false, code: 'not-confirmed', error: 'no transaction id (TODO(grow-docs))' };
      const invoiceUrl = typeof d.invoiceUrl === 'string' && /^https:\/\//i.test(d.invoiceUrl) ? d.invoiceUrl : undefined; // TODO(grow-docs)
      return { ok: true, transactionId, asmachta: d.asmachta != null ? String(d.asmachta) : undefined, invoiceUrl, invoiceNumber: d.invoiceNumber != null ? String(d.invoiceNumber) : undefined };
    },
    async refund(i) {
      // TODO(grow-docs): refund endpoint and fields are unverified (refundTransaction / cancelTransaction in the light API?).
      const r = await post(creds, 'refundTransaction', [
        ['pageCode', creds.pageCode],
        ['userId', i.userId],
        ['transactionId', i.transactionId],
        ['refundSum', String(i.amount)],            // TODO(grow-docs): partial refunds?
      ]);
      if (!r.ok && r.json === null) return unreachable;
      if (!statusOk(r.json)) return { ok: false, code: 'declined', error: String((r.json as { err?: { message?: string } } | null)?.err?.message || 'refund refused').slice(0, 160) };
      return { ok: true, refundId: String(data(r.json).refundId ?? data(r.json).transactionId ?? i.transactionId) };
    },
  };
}
