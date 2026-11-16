// lib/founder.ts
//
// "מנוי מייסדת": the first businesses she brings in personally get Kalmea free for life (owner decision 2026-11-16).
// No new column and no migration: a founder is a business the platform admin marked from /dashboard/admin with the
// "מייסדת" action, which writes plan_status = 'active' and plan_price = 0. 'active' never closes (lib/planState.ts), and a
// price of exactly 0 is what tells a founder apart from a paying business with no agreed price (plan_price null).
//
// Free for the PLAN, not for add-ons (owner decision 2026-11-16): a founder may save a card and buy add-on packs, each one
// charged only after she confirms it (lib/billing/service buyAddon). The monthly plan charge never touches her:
//   * saveCard gives her subscription price 0 and never charges on saving (lib/billing/service.ts);
//   * runDue skips a founder before anything else, so no renewal, retry or block ever runs for her;
//   * attempt() refuses a founder as a last line, in case a future caller forgets the two above;
//   * the card consent she ticks says add-ons only, no monthly charge (founderConsentTextHe, its own version).
// Why it has to be explicit: lib/billing/service priceOf treats 0 as "no price agreed" and falls back to the launch price.

import { BILLING_TERMS_SENTENCE_HE } from './billing/consent.ts'

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
export const FOUNDER_BILLING_HE = 'את במנוי מייסדת, חינם לכל החיים, בלי חיוב חודשי. תוספות אפשר לקנות כאן, וכל אחת נגבית רק אחרי שאישרת אותה.'

/** The consent a founder ticks before saving a card: add-ons she chooses, never the plan. Stored with its own version. */
export const FOUNDER_CONSENT_VERSION = 'billing-card-founder-v1'
export function founderConsentTextHe(): string {
  return `אני מאשרת לשמור את פרטי האשראי שלי עבור חיובים עתידיים של תוספות שאבחר בעצמי, דרך חברת הסליקה Grow. על המנוי עצמו אין חיוב, הוא חינם לכל החיים. כל תוספת נגבית רק אחרי שאאשר אותה, ועל כל חיוב תישלח קבלה. ${BILLING_TERMS_SENTENCE_HE}`
}
