// lib/founder.ts
//
// "מנוי מייסדת": the first businesses she brings in personally get Kalmea free for life (owner decision 2026-11-16).
// No new column and no migration: a founder is a business the platform admin marked from /dashboard/admin with the
// "מייסדת" action, which writes plan_status = 'active' and plan_price = 0. 'active' never closes (lib/planState.ts), and a
// price of exactly 0 is what tells a founder apart from a paying business with no agreed price (plan_price null).
//
// Why the price matters beyond display: lib/billing/service priceOf treats 0 as "no price agreed" and falls back to the
// launch price, so a founder who added a card would be charged 349 a month later. The billing card route and the billing
// status route check isFounder first, so that can never happen.

export const FOUNDER_PRICE = 0

type Row = { plan_status?: string | null; plan_price?: number | string | null } | null | undefined

/** Is this business a founder (free for life)? Exactly: active, and an agreed price of 0. null / '' / missing is NOT 0. */
export function isFounder(row: Row): boolean {
  if (!row || row.plan_status !== 'active') return false
  const raw = row.plan_price
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return false
  return Number(raw) === FOUNDER_PRICE
}

export const FOUNDER_LABEL_HE = 'מייסדת'
export const FOUNDER_BILLING_HE = 'את במנוי מייסדת, חינם לכל החיים. אין צורך בכרטיס ולא יהיה חיוב.'
