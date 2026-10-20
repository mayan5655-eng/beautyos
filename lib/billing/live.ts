// lib/billing/live.ts
//
// SERVER ONLY. The real provider for Kalmea's own subscription: Kalmea's own Grow account (lib/billing/growBilling.ts), configured ONLY by
// the GROW_BILLING_* variables. With any of them missing every call answers "not configured", so BILLING_MODE=live can never charge anyone
// by accident, only show an honest message. Secrets live in environment variables read here; never in the database, never in the browser.
//
// Keep BILLING_MODE=mock until Grow confirms that a Grow Light account may use the token APIs (docs/BILLING_SETUP.md).
import type { Env, PaymentsAdapter, InvoicingAdapter } from './adapter.ts';
import { growBillingCreds, createGrowBillingAdapters } from './growBilling.ts';

export function createLiveAdapters(env: Env): { configured: boolean; payments: PaymentsAdapter | null; invoicing: InvoicingAdapter | null; missing?: string[] } {
  const { creds, missing } = growBillingCreds(env);
  if (!creds) return { configured: false, payments: null, invoicing: null, missing };
  const a = createGrowBillingAdapters(creds);
  return { configured: true, payments: a.payments, invoicing: a.invoicing };
}
