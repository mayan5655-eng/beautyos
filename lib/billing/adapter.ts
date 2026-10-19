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

export type CardSessionInput = { tenantId: string; businessName: string; email?: string; returnUrl: string };
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
};
export type ChargeResult =
  | { ok: true; providerPaymentId: string }
  | { ok: false; error: string; code: 'declined' | 'not-configured' | 'unreachable' };

export interface PaymentsAdapter {
  createCardSession(i: CardSessionInput): Promise<CardSession>;
  charge(i: ChargeInput): Promise<ChargeResult>;
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
  const payments: PaymentsAdapter = {
    async createCardSession(i) {
      return { url: `${base}/api/billing/mock-card?s=${encodeURIComponent(signSession(i.tenantId))}` };
    },
    async charge(i) {
      if (i.tokenRef.startsWith(MOCK_TOKEN_OK)) return { ok: true, providerPaymentId: `mockpay_${rid()}` };
      if (i.tokenRef.startsWith(MOCK_TOKEN_DECLINE)) return { ok: false, code: 'declined', error: 'mock: card declined' };
      return { ok: false, code: 'declined', error: 'mock: unknown token' };
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
