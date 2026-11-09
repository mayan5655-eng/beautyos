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

// The annual plan (lib/pricing.ts, behind NEXT_PUBLIC_ANNUAL_PLAN). Asked when she switches to yearly, stored like the card consent.
export const BILLING_ANNUAL_CONSENT_VERSION = 'billing-annual-v1';

export function billingAnnualConsentTextHe(yearly: number, fromDateHe: string): string {
  const p = `₪${Math.round(Number(yearly) * 100) / 100}`;
  return `אני מאשרת לעבור לתשלום שנתי: חיוב אחד של ${p} לשנה בכרטיס השמור, דרך חברת הסליקה Grow, החל מהחידוש הבא${fromDateHe ? ` (${fromDateHe})` : ''} ובכל שנה אחריו, עד שאבטל. עד אז לא משתנה דבר. אפשר לבטל בכל רגע בהגדרות, והמנוי ממשיך עד סוף השנה ששולמה. ${BILLING_TERMS_SENTENCE_HE}`;
}

/** Back to monthly: no charge now, the monthly price from the end of the paid period. */
export function billingMonthlyConsentTextHe(monthly: number, fromDateHe: string): string {
  return `${billingConsentTextHe(monthly).replace(' עד שאבטל.', `, החל מסוף התקופה ששולמה${fromDateHe ? ` (${fromDateHe})` : ''}, עד שאבטל.`)}`;
}
