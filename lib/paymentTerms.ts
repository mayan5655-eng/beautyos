// lib/paymentTerms.ts
//
// The terms tick every payment page shows before money moves (Grow's site check: "a checkbox to accept the terms on the payment page, with a
// link to the terms"). One place for the words and the link, so the client payment page, the booking page and Kalmea's own billing card agree.
// The section the link opens is app/terms/page.tsx, id="payments" (paying a business through Kalmea) or the page top (Kalmea's own subscription).

export const PAYMENT_TERMS_HREF = '/terms#payments';
export const KALMEA_TERMS_HREF = '/terms';

/** The words around the link on a client payment page: "קראתי ואני מסכימה ל<link>תנאי התשלום והביטול</link>, ואני מעל גיל 18." */
export const PAY_TERMS_BEFORE_HE = 'קראתי ואני מסכימה ל';
export const PAY_TERMS_LINK_HE = 'תנאי התשלום והביטול';
export const PAY_TERMS_AFTER_HE = ', ואני מעל גיל 18.';
