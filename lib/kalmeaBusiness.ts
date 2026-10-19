// lib/kalmeaBusiness.ts
//
// Who Kalmea itself is, as a seller: the ONE place to change when the business moves from an exempt dealer (osek patur) to a licensed
// dealer (osek murshe). It covers Kalmea's own subscription billing and the legal footer; it has nothing to do with a cosmetician's own
// registration (settings.business_tax_status, lib/legalReceipts), which stays hers.
//
//   exempt    a receipt (kabala), NO VAT line, the price is final: 349 charged is 349 received, nothing is added on top
//   licensed  a tax invoice-receipt (heshbonit mas kabala): the price INCLUDES VAT, the VAT portion is shown on the document
//
// To switch later: change KALMEA_TAX_STATUS below to 'licensed' (and set the real VAT rate here if it changed). Nothing else.
export type KalmeaTaxStatus = 'exempt' | 'licensed';

export const KALMEA_TAX_STATUS: KalmeaTaxStatus = 'exempt';

/** Israeli VAT since 1 January 2025. Only used while KALMEA_TAX_STATUS is 'licensed'. */
export const VAT_RATE = 0.18;

/** Shown in the public Kalmea footer (landing, terms, privacy). */
export const KALMEA_BUSINESS_NUMBER = '308577139';
export const KALMEA_ADDRESS = 'רמת גן';

export type SubscriptionDoc = {
  docType: 'receipt' | 'tax_invoice_receipt';
  labelHe: 'קבלה' | 'חשבונית מס קבלה';
  /** The amount charged; also the total on the document. Never changed by VAT. */
  amount: number;
  /** The VAT portion contained in the amount: 0 for an exempt dealer, and then the document has no VAT line at all. */
  vatAmount: number;
  netAmount: number;
  showVatLine: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What document a subscription charge of `amount` gets. The charged amount is final in both modes; only the document differs. */
export function subscriptionDoc(amount: number, status: KalmeaTaxStatus = KALMEA_TAX_STATUS): SubscriptionDoc {
  if (status === 'licensed') {
    const net = r2(amount / (1 + VAT_RATE));
    return { docType: 'tax_invoice_receipt', labelHe: 'חשבונית מס קבלה', amount, vatAmount: r2(amount - net), netAmount: net, showVatLine: true };
  }
  return { docType: 'receipt', labelHe: 'קבלה', amount, vatAmount: 0, netAmount: amount, showVatLine: false };
}

/** The line under every public Kalmea footer. */
export function footerBusinessLine(status: KalmeaTaxStatus = KALMEA_TAX_STATUS): string {
  return status === 'licensed'
    ? `קלמיה · עוסק מורשה ${KALMEA_BUSINESS_NUMBER} · ${KALMEA_ADDRESS}`
    : `קלמיה · עוסק פטור ${KALMEA_BUSINESS_NUMBER} · ${KALMEA_ADDRESS}`;
}
