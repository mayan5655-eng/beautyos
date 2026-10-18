// lib/billing/live.ts
//
// SERVER ONLY. The placeholder for the real provider. Nothing here talks to a network: every call says "not configured", so choosing
// BILLING_MODE=live before a provider is wired can never charge anyone, only show an honest message.
//
// To go live, implement the two interfaces from ./adapter.ts against the chosen provider (a Grow-style hosted page, or a card provider
// plus an invoicing service) and return configured: true when its keys are present:
//   TODO(provider) createCardSession  open the provider's hosted card page; its webhook (or return call) must end in saveCard() in ./service.ts
//   TODO(provider) charge             charge the saved token for `amount`; honour idempotencyKey; map a refusal to code 'declined'
//   TODO(provider) issueInvoice       issue the tax invoice for providerPaymentId (or let the provider issue it and return its number and link)
// Keep secrets in environment variables read here; never in the database and never in the browser.
import type { Env, PaymentsAdapter, InvoicingAdapter } from './adapter.ts';

export function createLiveAdapters(_env: Env): { configured: boolean; payments: PaymentsAdapter | null; invoicing: InvoicingAdapter | null } {
  // Not wired yet: report "not configured" so no route offers a card form that leads nowhere.
  return { configured: false, payments: null, invoicing: null };
}
