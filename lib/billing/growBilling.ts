// lib/billing/growBilling.ts
//
// SERVER ONLY. Kalmea's OWN subscription billing on Kalmea's OWN Grow account (Grow Light, under Maayan's osek patur: receipts with no
// VAT line, lib/kalmeaBusiness.ts). Completely separate from the platform clearing the cosmeticians use with their clients:
//
//   GROW_BILLING_USER_ID     Kalmea's own Grow business id (every call is for this one business)
//   GROW_BILLING_API_KEY     the key Grow gives for API calls on that account (a body field, like every Grow call)
//   GROW_BILLING_PAGE_CODE   the credit-card TOKEN page code of that account
//   GROW_BILLING_ENV         'production' | anything else (= sandbox)
//   GROW_BILLING_API_BASE    optional; defaults to Grow's documented sandbox / production bases
//
// None of the platform variables (GROW_API_KEY, GROW_TOKEN_*, GROW_PAGE_CODE...) is ever read here, and this file is never read by the
// platform code: two accounts, two sets of keys.
//
// The calls are the token calls already checked against Grow's sandbox for the client flow (lib/grow/ops.ts createLiveOps): save a card
// on Grow's hosted page (chargeType 3, saveCardToken 1, no charge), charge it with createTransactionWithToken and a numeric
// transactionUniqueIdentifier, look a charge up by that identifier. What Grow must still confirm (docs/BILLING_SETUP.md): that a Grow
// LIGHT account may use these token APIs at all, and whether the token-charge answer carries the receipt's number and link. Until then
// BILLING_MODE stays 'mock' and none of this runs.
import type { Env, PaymentsAdapter, InvoicingAdapter, CardSessionInput, ChargeInput, ChargeResult, LookupResult } from './adapter.ts';
import { createLiveOps } from '../grow/ops.ts';
import type { GrowOps } from '../grow/ops.ts';
import type { TokenCreds } from '../grow/tokenFlow.ts';
import { decryptToken } from '../facebook/encryption.ts';

/** A token saved by /api/billing/grow-notify is sealed (iv:tag:data, hex); an older plain one passes through unchanged. */
export function openToken(ref: string, open: (s: string) => string = decryptToken): string {
  return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(ref) ? open(ref) : ref;
}

export const GROW_BILLING_SANDBOX_BASE = 'https://sandbox.meshulam.co.il/api/light/server/1.0';
export const GROW_BILLING_PRODUCTION_BASE = 'https://secure.meshulam.co.il/api/light/server/1.0';

export type GrowBillingCreds = TokenCreds & { userId: string };

/** The billing account's credentials, or null with the missing names (for the operator's logs). */
export function growBillingCreds(env: Env): { creds: GrowBillingCreds | null; missing: string[] } {
  const t = (k: string) => String(env[k] || '').trim();
  const missing = ['GROW_BILLING_USER_ID', 'GROW_BILLING_API_KEY', 'GROW_BILLING_PAGE_CODE'].filter((k) => !t(k));
  const production = t('GROW_BILLING_ENV').toLowerCase() === 'production';
  const apiBase = (t('GROW_BILLING_API_BASE') || (production ? GROW_BILLING_PRODUCTION_BASE : GROW_BILLING_SANDBOX_BASE)).replace(/\/+$/, '');
  if (!/^https:\/\//i.test(apiBase)) missing.push('GROW_BILLING_API_BASE (https)');
  if (missing.length) return { creds: null, missing };
  const userId = t('GROW_BILLING_USER_ID');
  // userIdOverride: every call is for Kalmea's own business, whoever the payer is.
  return { creds: { apiKey: t('GROW_BILLING_API_KEY'), pageCode: t('GROW_BILLING_PAGE_CODE'), apiBase, env: production ? 'production' : 'sandbox', userIdOverride: userId, userId }, missing: [] };
}

/** Grow's page and token charges ask for the payer by name (two words) and Israeli mobile. */
const payerName = (s?: string) => {
  const parts = String(s || '').replace(/[^\p{L}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 4).join(' ') : parts.length === 1 ? `${parts[0]} ${parts[0]}` : 'לקוחת קלמיה';
};

export function createGrowBillingAdapters(creds: GrowBillingCreds, ops: GrowOps = createLiveOps(creds), open: (s: string) => string = decryptToken): { payments: PaymentsAdapter; invoicing: InvoicingAdapter } {
  const payments: PaymentsAdapter = {
    async createCardSession(i: CardSessionInput) {
      const r = await ops.createTokenSession({
        tenantId: i.tenantId, userId: creds.userId, appointmentId: 'billing', returnUrl: i.returnUrl, mode: 'save_only',
        fullName: payerName(i.fullName || i.businessName), phone: i.phone || '', notifyUrl: i.notifyUrl,
      });
      if (!r.ok) throw new Error(`grow card page: ${r.code} ${r.error}`);
      return { url: r.url };
    },
    async charge(i: ChargeInput): Promise<ChargeResult> {
      if (!Number.isFinite(i.uniqueIdentifier)) return { ok: false, code: 'declined', error: 'no unique identifier' };
      const r = await ops.chargeToken({
        userId: creds.userId, tokenRef: openToken(i.tokenRef, open), amount: i.amount, description: i.description,
        uniqueIdentifier: Number(i.uniqueIdentifier), groupIdentifier: i.groupIdentifier, fullName: payerName(i.fullName), phone: i.phone || '',
      });
      if (r.ok) return { ok: true, providerPaymentId: r.transactionId, invoiceNumber: r.invoiceNumber, invoiceUrl: r.invoiceUrl };
      if (r.code === 'duplicate') return { ok: false, code: 'duplicate', error: r.error };
      if (r.code === 'unreachable' || r.code === 'not-confirmed') return { ok: false, code: 'unreachable', error: r.error };
      return { ok: false, code: 'declined', error: r.error, final: r.final };
    },
    async lookup(tokenRef: string, uniqueIdentifier: number): Promise<LookupResult> {
      const r = await ops.lookupToken({ userId: creds.userId, tokenRef: openToken(tokenRef, open), uniqueIdentifier });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, found: r.found, status: r.status, providerPaymentId: r.transactionId };
    },
  };
  const invoicing: InvoicingAdapter = {
    // Grow issues the receipt on its own for every charge on the account (the kabala of an osek patur). When the charge's answer carries
    // it, the service stores it at once (lib/billing/service.ts succeed). There is no separate call to issue one: say so, and the payment
    // shows "the receipt will come from Grow" until a document link is known. TODO(grow-docs): the invoice webhook for token charges.
    async issueInvoice() {
      return { ok: false, error: 'issued by Grow with the charge' };
    },
  };
  return { payments, invoicing };
}
