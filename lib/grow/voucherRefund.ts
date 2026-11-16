// lib/grow/voucherRefund.ts
//
// A gift voucher bought online is tied to its Grow payment (gift_vouchers.grow_payment_id). Refunding that payment used to
// leave the voucher live, so the buyer had the money back AND a code that still redeemed (competitor audit 2026-11-16).
// Now: a voucher already partly used blocks the automatic refund (refunding the full price would pay back what was
// already spent; she refunds the right amount from Grow's dashboard), and a successful refund voids the voucher.

export const VOUCHER_USED_HE = 'השובר שנקנה בתשלום הזה כבר מומש בחלקו, ולכן לא מחזירים מכאן את כל הסכום. את ההחזר המתאים עושים בלוח הבקרה של Grow, ואת השובר מבטלים בניהול השוברים.';

type Voucher = { id: string; status: string; balance: number; initial_amount: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function voucherOfPayment(db: any, tenantId: string, paymentId: string): Promise<Voucher | null> {
  const { data, error } = await db.from('gift_vouchers').select('id, status, balance, initial_amount')
    .eq('tenant_id', tenantId).eq('grow_payment_id', paymentId).maybeSingle();
  if (error || !data) return null; // no vouchers table yet, or not a voucher sale
  return { id: String(data.id), status: String(data.status), balance: Number(data.balance), initial_amount: Number(data.initial_amount) };
}

/** True when the voucher behind this payment is live and some of it was already redeemed. */
export function voucherPartlyUsed(v: Voucher | null): boolean {
  return !!v && v.status === 'active' && v.balance < v.initial_amount;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function voidVoucherOfPayment(db: any, tenantId: string, paymentId: string, at: string): Promise<void> {
  const { error } = await db.from('gift_vouchers')
    .update({ status: 'void', voided_at: at, void_reason: 'התשלום הוחזר לקונה', updated_at: at })
    .eq('tenant_id', tenantId).eq('grow_payment_id', paymentId).eq('status', 'active');
  if (error) console.error('[grow] refund: could not void the gift voucher of payment', paymentId, error.message);
}
