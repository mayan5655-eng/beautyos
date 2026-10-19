// lib/grow/paymentRequest.ts
//
// A payment request: she sends a client a Grow payment link, for a DEPOSIT before the visit or for the FULL amount, and
// sends it herself from her own WhatsApp (a wa.me link; nothing is sent by Kalmea). The link is an ordinary Grow payment
// page on HER account (lib/grow/service.ts createCharge), so its status moves to "paid" the same way a cashier charge does,
// through Grow's callback, and the receipt is created the same way.
//
//   full     kind 'charge', description "בקשת תשלום · <note>". When paid: a receipt, nothing else.
//   deposit  kind 'deposit', description "מקדמה · בקשת תשלום · <note>". When paid: a receipt (the money came in, so it
//            is income now) AND the same amount as client credit (client_credits, source 'deposit_request'), which the
//            cashier deducts at the visit (app/GrowCashierCredit.jsx). So a ₪300 visit with a ₪100 deposit records ₪100 +
//            ₪200, never ₪400. The receipt is not tied to an appointment (the "מקדמה" prefix, see createReceiptFor).
//
// Pure helpers; the route is app/api/grow/payment-request.

export type RequestKind = 'full' | 'deposit';

export const REQUEST_FULL_PREFIX = 'בקשת תשלום';
export const REQUEST_DEPOSIT_PREFIX = 'מקדמה · בקשת תשלום';

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f<>"'`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function isRequestKind(v: unknown): v is RequestKind {
  return v === 'full' || v === 'deposit';
}

/** What Grow's page and her payment list show. Grow refuses special characters, so the note is cleaned. */
export function requestDescription(kind: RequestKind, note?: string | null): string {
  const n = clean(note, 40);
  const head = kind === 'deposit' ? REQUEST_DEPOSIT_PREFIX : REQUEST_FULL_PREFIX;
  return n ? `${head} · ${n}` : head;
}

export function isDepositRequest(description: string | null | undefined): boolean {
  return String(description || '').startsWith(REQUEST_DEPOSIT_PREFIX);
}

export function isPaymentRequest(description: string | null | undefined): boolean {
  const d = String(description || '');
  return d.startsWith(REQUEST_FULL_PREFIX) || d.startsWith(REQUEST_DEPOSIT_PREFIX);
}

/** The message she sends from her own WhatsApp: warm, short, the amount glued to the shekel sign. */
export function requestMessageHe(i: { clientName?: string | null; businessName?: string | null; amount: number; kind: RequestKind; url: string }): string {
  const first = clean(i.clientName, 40).split(' ')[0];
  const biz = clean(i.businessName, 60);
  const sum = `₪${Math.round(i.amount * 100) / 100}`;
  const what = i.kind === 'deposit' ? `מקדמה של ${sum} לשמירת התור` : `תשלום של ${sum}`;
  return [
    `היי${first ? ` ${first}` : ''} 🌸`,
    `${biz ? `כאן ${biz}. ` : ''}הנה קישור מאובטח ל${what}:`,
    i.url,
    'התשלום דרך Grow, ופרטי הכרטיס לא עוברים אליי.',
  ].join('\n');
}

/** The wa.me link to her client, or null when the phone is not usable. */
export function requestWaLink(phone: string | null | undefined, message: string): string | null {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 9) return null;
  const intl = d.startsWith('0') ? `972${d.slice(1)}` : d;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export const REQUEST_STATUS_HE: Record<string, string> = {
  created: 'ממתינה לתשלום',
  paid: 'שולמה',
  failed: 'לא הושלמה',
  cancelled: 'בוטלה',
  refunded: 'הוחזרה',
};
