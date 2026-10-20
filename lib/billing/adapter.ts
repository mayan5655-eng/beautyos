// lib/billing/adapter.ts
//
// SERVER ONLY. Kalmea's OWN subscription billing (a cosmetician paying Kalmea each month), behind two small provider-neutral interfaces, so
// the whole flow can be built and tested before any provider is chosen:
//
//   PaymentsAdapter   save a card through the provider's HOSTED page (we only ever receive a token reference, never a card number),
//                     and charge that token.
//   InvoicingAdapter  issue the tax document for one successful charge.
//
//   BILLING_MODE=mock   (default)  no network. The hosted page is /api/billing/mock-card on our own origin with success / failure buttons,
//                                  charges succeed or fail by the token that was saved, and invoices are sample pages.
//   BILLING_MODE=live              placeholder: every call answers "not configured". Wire a real provider into lib/billing/live.ts.
//
// Mock mode is refused on the Vercel PRODUCTION deployment (VERCEL_ENV=production): a fake "card saved" button must never run next to real
// customers. There the answer is "not configured", exactly as for live mode without keys.
//
// BILLING_UI_ENABLED gates every billing screen and every signed-in billing route (default OFF). The cron and the provider callbacks are not
// behind it, but the cron does nothing while the flag is off.
import { createLiveAdapters } from './live.ts';

export type Env = Record<string, string | undefined>;
export type BillingMode = 'mock' | 'live';

export const CURRENCY = 'ILS';

export function billingMode(env: Env = process.env): BillingMode {
  return (env.BILLING_MODE || '').trim().toLowerCase() === 'live' ? 'live' : 'mock';
}

export function billingUiEnabled(env: Env = process.env): boolean {
  return /^(1|true|on|yes)$/i.test((env.BILLING_UI_ENABLED || '').trim());
}

// ── the two interfaces ───────────────────────────────────────────────────────

export type CardSessionInput = {
  tenantId: string; businessName: string; email?: string; returnUrl: string;
  /** The payer as Grow's page asks for her: full name (two words) and an Israeli mobile. */
  fullName?: string; phone?: string;
  /** Where the provider posts the saved card (Grow: /api/billing/grow-notify, signed per tenant). */
  notifyUrl?: string;
};
export type CardSession = { url: string };

/** What the provider hands back once the client has saved a card on its hosted page. Never a card number. */
export type SavedCard = { tokenRef: string; last4?: string; brand?: string };

export type ChargeInput = {
  tokenRef: string;
  amount: number;
  currency: string;
  description: string;
  /** The same key for the same billing period: a provider that honours it cannot charge twice. */
  idempotencyKey: string;
  /**
   * Grow's transactionUniqueIdentifier: a whole number drawn on our server, SAVED in billing_payments before this call, never reused
   * (not even after a refusal). The same rules as the client token flow (lib/grow/tokenFlow.ts newUniqueIdentifier).
   */
  uniqueIdentifier?: number;
  /** Not unique: one per subscription, for looking charges up later. */
  groupIdentifier?: number;
  /** The payer, as Grow wants her on every token charge. */
  fullName?: string;
  phone?: string;
};
export type ChargeResult =
  | { ok: true; providerPaymentId: string; invoiceNumber?: string; invoiceUrl?: string }
  | { ok: false; error: string; code: 'declined' | 'not-configured' | 'unreachable' | 'duplicate'; final?: boolean };

/** What the provider knows about one charge, by its unique identifier (after a duplicate answer or a lost reply). */
export type LookupResult =
  | { ok: true; found: boolean; status: 'paid' | 'failed' | 'pending' | 'unknown'; providerPaymentId?: string }
  | { ok: false; error: string };

export interface PaymentsAdapter {
  createCardSession(i: CardSessionInput): Promise<CardSession>;
  charge(i: ChargeInput): Promise<ChargeResult>;
  /** Optional: a provider that can be asked "did charge N go through?" (Grow: getTokenTransactionsByExternalIdentifiers). */
  lookup?(tokenRef: string, uniqueIdentifier: number): Promise<LookupResult>;
}

export type InvoiceInput = {
  /** 'receipt' for an exempt dealer (no VAT line, the amount is final); 'tax_invoice_receipt' for a licensed dealer (VAT contained in the amount). From lib/kalmeaBusiness.ts. */
  docType: 'receipt' | 'tax_invoice_receipt';
  /** VAT contained in `amount`: always 0 for a receipt. The amount is never increased by it. */
  vatAmount: number;
  tenantId: string;
  businessName: string;
  email?: string;
  amount: number;
  currency: string;
  description: string;
  providerPaymentId: string;
};
export type InvoiceResult = { ok: true; number: string; url: string } | { ok: false; error: string };

export interface InvoicingAdapter {
  issueInvoice(i: InvoiceInput): Promise<InvoiceResult>;
}

export type Billing = {
  mode: BillingMode;
  configured: boolean;
  payments: PaymentsAdapter | null;
  invoicing: InvoicingAdapter | null;
  /** Why it is not configured, for the operator's logs (never shown to her). */
  reason?: string;
};

// ── mock ─────────────────────────────────────────────────────────────────────

const rid = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/** A mock token reference states how it will behave, so tests and a tester can choose: ok (charges succeed), decline (charges fail). */
export const MOCK_TOKEN_OK = 'mocktok_ok_';
export const MOCK_TOKEN_DECLINE = 'mocktok_decline_';
export const newMockToken = (kind: 'ok' | 'decline') => (kind === 'ok' ? MOCK_TOKEN_OK : MOCK_TOKEN_DECLINE) + rid();

export function createMockAdapters(origin: string, signSession: (tenantId: string) => string): { payments: PaymentsAdapter; invoicing: InvoicingAdapter } {
  const base = origin.replace(/\/+$/, '');
  const seen = new Map<number, { status: 'paid' | 'failed'; id?: string }>();
  const payments: PaymentsAdapter = {
    async createCardSession(i) {
      return { url: `${base}/api/billing/mock-card?s=${encodeURIComponent(signSession(i.tenantId))}` };
    },
    async charge(i) {
      // Like Grow: an identifier seen before is refused outright (error 1010), whatever happened the first time.
      if (i.uniqueIdentifier !== undefined) {
        if (seen.has(i.uniqueIdentifier)) return { ok: false, code: 'duplicate', error: 'mock: identifier already used' };
      }
      let out: ChargeResult;
      if (i.tokenRef.startsWith(MOCK_TOKEN_OK)) out = { ok: true, providerPaymentId: `mockpay_${rid()}` };
      else if (i.tokenRef.startsWith(MOCK_TOKEN_DECLINE)) out = { ok: false, code: 'declined', error: 'mock: card declined' };
      else out = { ok: false, code: 'declined', error: 'mock: unknown token' };
      if (i.uniqueIdentifier !== undefined) seen.set(i.uniqueIdentifier, out.ok ? { status: 'paid', id: out.providerPaymentId } : { status: 'failed' });
      return out;
    },
    async lookup(_tokenRef, uniqueIdentifier) {
      const r = seen.get(uniqueIdentifier);
      return r ? { ok: true, found: true, status: r.status, providerPaymentId: r.id } : { ok: true, found: false, status: 'unknown' };
    },
  };
  const invoicing: InvoicingAdapter = {
    async issueInvoice(i) {
      const number = String(Math.floor(Math.random() * 90000) + 10000);
      const url = /^https:\/\//i.test(base) ? `${base}/api/billing/mock-card?doc=${encodeURIComponent(i.providerPaymentId)}&n=${number}&t=${i.docType === 'receipt' ? 'r' : 'i'}` : `https://mock.billing.invalid/invoice/${number}`;
      return { ok: true, number, url };
    },
  };
  return { payments, invoicing };
}

export function resolveBilling(env: Env = process.env, origin = '', signSession: (tenantId: string) => string = () => ''): Billing {
  if (billingMode(env) === 'live') {
    const live = createLiveAdapters(env);
    return { mode: 'live', configured: live.configured, payments: live.payments, invoicing: live.invoicing, reason: live.configured ? undefined : 'live provider is not wired yet' };
  }
  if ((env.VERCEL_ENV || '') === 'production') {
    return { mode: 'mock', configured: false, payments: null, invoicing: null, reason: 'mock mode is not allowed on the production deployment' };
  }
  const m = createMockAdapters(origin, signSession);
  return { mode: 'mock', configured: true, payments: m.payments, invoicing: m.invoicing };
}
