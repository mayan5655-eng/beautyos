// lib/grow/paymentOrigin.ts
//
// Which page opened a Grow payment (grow_payments.origin, supabase/migrations/add_grow_payment_origin_2026-11-09.sql). Written once,
// by the code that creates the payment (lib/grow/service.ts createCharge and the cancellation-fee insert in lib/grow/cancelFees.ts),
// and shown next to each payment in her Grow lists (app/GrowCard.jsx, app/GrowPaymentRequests.jsx).
//
//   booking_deposit  the client paid a deposit on the public booking page
//   owner_deposit    she asked for a deposit herself, from the calendar
//   booking_visit    the client paid for her visit on the public booking page
//   gift_voucher     a gift voucher bought on her public page
//   till             a payment link from the till, after a treatment
//   client_link      a payment request she sent a client (deposit or full amount)
//   cancel_fee       a late-cancellation / no-show fee charged to a saved card
//
// Until the migration runs, and for every payment made before it, there is no stored origin: originLabelHe then infers it from
// kind and description, which every deployment has. An inferred deposit cannot tell her booking page from her calendar, so it reads
// just "מקדמה". Pure; no imports beyond the description helpers, so the browser can use it.

import { isPaymentRequest } from './paymentRequest.ts';

export const PAYMENT_ORIGINS = ['booking_deposit', 'owner_deposit', 'booking_visit', 'gift_voucher', 'till', 'client_link', 'cancel_fee'] as const;
export type PaymentOrigin = (typeof PAYMENT_ORIGINS)[number];

export const ORIGIN_HE: Record<PaymentOrigin, string> = {
  booking_deposit: 'מקדמה מדף ההזמנה',
  owner_deposit: 'מקדמה שביקשת מהיומן',
  booking_visit: 'תשלום על תור מדף ההזמנה',
  gift_voucher: 'שובר מתנה',
  till: 'קישור מהקופה',
  client_link: 'בקשת תשלום ללקוחה',
  cancel_fee: 'דמי ביטול',
};

export function isPaymentOrigin(v: unknown): v is PaymentOrigin {
  return typeof v === 'string' && (PAYMENT_ORIGINS as readonly string[]).includes(v);
}

// Descriptions are stored through growText (lib/grow/payload.ts), which turns "·" and other signs into spaces: compare in that form.
const asStored = (s: unknown) => String(s ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
// The same words as lib/giftVouchers.ts VOUCHER_SERVICE_PREFIX and app/api/grow/booking-pay (test-grow-ops-admin.ts holds them equal).
export const VOUCHER_PREFIX = 'שובר מתנה';
export const BOOKING_VISIT_PREFIX = 'תשלום על תור';

type PaymentLike = { origin?: unknown; kind?: unknown; description?: unknown };

/** The stored origin, or the best inference for a payment that has none. null when nothing can be said. */
export function paymentOriginOf(p: PaymentLike): PaymentOrigin | 'deposit' | null {
  if (isPaymentOrigin(p.origin)) return p.origin;
  const d = asStored(p.description);
  if (d.startsWith(asStored(VOUCHER_PREFIX))) return 'gift_voucher';
  if (isPaymentRequest(String(p.description ?? ''))) return 'client_link';
  if (d.startsWith(asStored(BOOKING_VISIT_PREFIX))) return 'booking_visit';
  if (p.kind === 'fee') return 'cancel_fee';
  if (p.kind === 'deposit' || d.startsWith('מקדמה')) return 'deposit';
  if (p.kind === 'charge') return 'till';
  return null;
}

/** The short Hebrew label shown next to a payment, or '' when the origin is unknown. */
export function originLabelHe(p: PaymentLike): string {
  const o = paymentOriginOf(p);
  if (!o) return '';
  return o === 'deposit' ? 'מקדמה' : ORIGIN_HE[o];
}
