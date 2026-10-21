// lib/billing/consent.ts
//
// The required tick before she saves a card for her Kalmea subscription. Plain, warm, and exact about what she agrees to: a monthly charge
// of her price on this card until she cancels, through Grow, with a receipt each month. The exact words and the version are stored with the
// time she agreed (billing_card_consents), so what she saw is what we can show later.

export const BILLING_CONSENT_VERSION = 'billing-card-v2';

/** The closing sentence of the consent; the card shows its last words as a link to /terms. */
export const BILLING_TERMS_SENTENCE_HE = 'קראתי ואני מסכימה לתנאי השימוש של קלמיה.';

export function billingConsentTextHe(price: number): string {
  const p = `₪${Math.round(Number(price) * 100) / 100}`;
  return `אני מאשרת לשמור את כרטיס האשראי שלי באופן מאובטח אצל חברת הסליקה Grow, ולחייב אותו בכל חודש ב-${p} עבור המנוי שלי בקלמיה, עד שאבטל. על כל חיוב תישלח קבלה. אפשר לבטל בכל רגע בהגדרות. ${BILLING_TERMS_SENTENCE_HE}`;
}
