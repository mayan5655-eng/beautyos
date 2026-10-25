// lib/billing/consent.ts
//
// The required tick before she saves a card for her Kalmea subscription. Plain, warm, and exact about what she agrees to: a monthly charge
// of her price on this card until she cancels, through Grow, with a receipt each month. The exact words and the version are stored with the
// time she agreed (billing_card_consents), so what she saw is what we can show later.

// v3 (2026-10-25, Grow's review): no longer says the card is kept at Grow; Grow's wording "for future charges".
export const BILLING_CONSENT_VERSION = 'billing-card-v3';

/** The closing sentence of the consent; the card shows its last words as a link to /terms. */
export const BILLING_TERMS_SENTENCE_HE = 'קראתי ואני מסכימה לתנאי השימוש של קלמיה.';

export function billingConsentTextHe(price: number): string {
  const p = `₪${Math.round(Number(price) * 100) / 100}`;
  return `אני מאשרת לשמור את פרטי האשראי שלי עבור חיובים עתידיים: חיוב של ${p} בכל חודש דרך חברת הסליקה Grow עבור המנוי שלי בקלמיה, עד שאבטל. על כל חיוב תישלח קבלה. אפשר לבטל בכל רגע בהגדרות. ${BILLING_TERMS_SENTENCE_HE}`;
}
