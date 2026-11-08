// lib/giftVoucherService.ts
//
// The server half of gift vouchers, with the database injected as a small repo (lib/giftVoucherRepo.ts is the service-role one), so
// "a callback arrives twice", "a code collides" and "the sale was tapped twice" are proven in test-gift-vouchers.ts without a database.
//
//   issueFromPayment  an online purchase. Called after Grow's verified callback flipped the payment to paid (app/api/grow/_cancel.ts
//                     afterPaidHook), and again, as a safety net, whenever the buyer's page or her list sees a paid payment that has
//                     no voucher yet. Idempotent: the voucher row names the payment (unique gift_vouchers_payment_uniq).
//   sellAtTill        a sale in person: the voucher first, then its receipt, then the link between them. Idempotent by the till's
//                     sale key (unique gift_vouchers_sale_key_uniq).
//
// The balance itself never changes here: redemption is the database's gift_voucher_redeem (one conditional UPDATE).

import {
  parseVoucherIntent, newVoucherCode, newVoucherToken, expiryFrom, voucherItem, voucherTitle, cleanName, cleanMessage,
  VOUCHER_SERVICE_PREFIX, type VoucherRow,
} from './giftVouchers.ts';

export type InsertResult = { status: 'inserted'; row: VoucherRow } | { status: 'duplicate-code' } | { status: 'already' } | { status: 'missing' };

export type VoucherRepo = {
  /** Insert a voucher. 'duplicate-code': the (tenant, code) unique index refused it (try another code). 'already': the payment or sale key already has one. 'missing': the table is not there yet. */
  insertVoucher(row: Record<string, unknown>): Promise<InsertResult>;
  findByPayment(paymentId: string): Promise<VoucherRow | null>;
  findBySaleKey(tenantId: string, saleKey: string): Promise<VoucherRow | null>;
  /** One ledger row; a repeated idem_key is ignored (the unique index says it is there). */
  insertLedger(row: Record<string, unknown>): Promise<void>;
  /** The receipt the Grow callback wrote for this payment, if any yet. */
  receiptIdForPayment(paymentId: string): Promise<string | null>;
  /** Mark a receipt as a voucher sale (its item kind: 'voucher'), so it is never counted as a visit. */
  setReceiptItems(receiptId: string, items: unknown[], service: string): Promise<void>;
  insertReceipt(row: Record<string, unknown>): Promise<{ id: string; row: Record<string, unknown> }>;
  setVoucherReceipt(voucherId: string, receiptId: string): Promise<void>;
  voidVoucher(voucherId: string, reason: string, by: string | null): Promise<void>;
};

type Deps = { repo: VoucherRepo; randomBytes: (n: number) => Uint8Array; now?: () => Date };

export type PaidPayment = { id: string; tenant_id: string; status: string; amount: number | string; payer_phone?: string | null };

export type IssueResult =
  | { status: 'issued' | 'already'; voucher: VoucherRow }
  | { status: 'not-paid' | 'no-intent' | 'amount-mismatch' | 'missing' | 'failed' };

/** Insert with a fresh code, retrying a collision a few times (one in a trillion per business, but never assumed away). */
async function insertWithCode(row: Record<string, unknown>, d: Deps): Promise<InsertResult> {
  for (let i = 0; i < 5; i++) {
    const r = await d.repo.insertVoucher({ ...row, code: newVoucherCode(d.randomBytes) });
    if (r.status !== 'duplicate-code') return r;
  }
  return { status: 'duplicate-code' };
}

export async function issueFromPayment(p: PaidPayment, intentRaw: unknown, d: Deps): Promise<IssueResult> {
  if (!p || p.status !== 'paid') return { status: 'not-paid' };
  const intent = parseVoucherIntent(intentRaw);
  if (!intent) return { status: 'no-intent' };
  // The voucher is worth what Grow confirmed was paid. A stored intent that disagrees with the paid amount is not trusted.
  const paid = Math.round((Number(p.amount) || 0) * 100) / 100;
  if (Math.abs(paid - intent.amount) > 0.005) return { status: 'amount-mismatch' };

  const existing = await d.repo.findByPayment(p.id);
  if (existing) return { status: 'already', voucher: existing };

  const now = (d.now || (() => new Date()))();
  const r = await insertWithCode({
    tenant_id: p.tenant_id,
    token: intent.token,
    kind: intent.kind,
    service_name: intent.service_name,
    initial_amount: paid,
    balance: paid,
    status: 'active',
    expires_at: expiryFrom(now, intent.validity_months),
    buyer_name: intent.buyer_name || null,
    buyer_phone: p.payer_phone || null,
    recipient_name: intent.recipient_name || null,
    message: intent.message || null,
    sold_via: 'online',
    grow_payment_id: p.id,
  }, d);
  if (r.status === 'missing') return { status: 'missing' };
  if (r.status === 'already') {
    // A second callback raced this one to the insert: hand back the voucher it wrote.
    const v = await d.repo.findByPayment(p.id);
    return v ? { status: 'already', voucher: v } : { status: 'failed' };
  }
  if (r.status !== 'inserted') return { status: 'failed' };
  const v = r.row;
  try { await d.repo.insertLedger({ tenant_id: p.tenant_id, voucher_id: v.id, kind: 'issue', amount: paid, balance_after: paid, idem_key: 'issue', note: 'נקנה אונליין' }); } catch { /* the balance is on the voucher; the ledger line is a record */ }
  try {
    const rid = await d.repo.receiptIdForPayment(p.id);
    if (rid) {
      await d.repo.setReceiptItems(rid, [voucherItem({ title: voucherTitle(v), amount: paid, code: String(v.code || '') })], `${VOUCHER_SERVICE_PREFIX}: ${voucherTitle(v)}`);
      await d.repo.setVoucherReceipt(String(v.id), rid);
    }
  } catch { /* the receipt still counts the money; only its "not a visit" mark is missing, and the service text still says שובר מתנה */ }
  return { status: 'issued', voucher: v };
}

export type TillSaleInput = {
  tenantId: string;
  userId: string | null;
  saleKey: string;
  kind: 'amount' | 'service';
  serviceName: string | null;
  amount: number;
  validityMonths: number;
  paymentMethod: string;
  buyerName: string;
  buyerPhone: string | null;
  recipientName: string;
  message: string;
  clientId: string | null;
};

export type TillSaleResult =
  | { status: 'sold' | 'already'; voucher: VoucherRow; receipt: Record<string, unknown> | null }
  | { status: 'missing' | 'failed'; error?: string };

/**
 * A voucher sold in person. The voucher is written FIRST (unused, not yet handed over), then its receipt. If the receipt cannot be
 * written the voucher is voided at once, with the reason, so there is never a voucher whose money was not recorded. Never deleted.
 */
export async function sellAtTill(i: TillSaleInput, d: Deps): Promise<TillSaleResult> {
  const existing = await d.repo.findBySaleKey(i.tenantId, i.saleKey);
  if (existing) return { status: 'already', voucher: existing, receipt: null };
  const now = (d.now || (() => new Date()))();
  const amount = Math.round(i.amount * 100) / 100;
  const r = await insertWithCode({
    tenant_id: i.tenantId,
    token: newVoucherToken(d.randomBytes),
    kind: i.kind,
    service_name: i.kind === 'service' ? i.serviceName : null,
    initial_amount: amount,
    balance: amount,
    status: 'active',
    expires_at: expiryFrom(now, i.validityMonths),
    buyer_name: cleanName(i.buyerName) || null,
    buyer_phone: i.buyerPhone || null,
    recipient_name: cleanName(i.recipientName) || null,
    message: cleanMessage(i.message) || null,
    sold_via: 'till',
    sale_key: i.saleKey,
    created_by: i.userId,
  }, d);
  if (r.status === 'missing') return { status: 'missing' };
  if (r.status === 'already') {
    const v = await d.repo.findBySaleKey(i.tenantId, i.saleKey);
    return v ? { status: 'already', voucher: v, receipt: null } : { status: 'failed' };
  }
  if (r.status !== 'inserted') return { status: 'failed' };
  const v = r.row;
  const title = voucherTitle(v);
  let receipt: { id: string; row: Record<string, unknown> };
  try {
    receipt = await d.repo.insertReceipt({
      tenant_id: i.tenantId,
      client_id: i.clientId,
      client_name: cleanName(i.buyerName) || 'לקוחה',
      appointment_id: null,                       // paid in advance, against no visit (like a package sale)
      service: `${VOUCHER_SERVICE_PREFIX}: ${title}`,
      amount,
      payment_method: i.paymentMethod,
      note: `שובר מתנה${i.recipientName ? ` ל${cleanName(i.recipientName)}` : ''}, קוד ${String(v.code || '')}`,
      items: JSON.stringify([voucherItem({ title, amount, code: String(v.code || '') })]),
      discount: 0,
    });
  } catch (e) {
    try { await d.repo.voidVoucher(String(v.id), 'התשלום לא נרשם, השובר לא נמסר', i.userId); } catch { /* logged by the caller */ }
    return { status: 'failed', error: (e as Error)?.message };
  }
  try { await d.repo.setVoucherReceipt(String(v.id), receipt.id); } catch { /* the receipt names the code in its note */ }
  try { await d.repo.insertLedger({ tenant_id: i.tenantId, voucher_id: v.id, kind: 'issue', amount, balance_after: amount, idem_key: 'issue', receipt_id: receipt.id, note: 'נמכר בקופה', created_by: i.userId }); } catch { /* a record only */ }
  return { status: 'sold', voucher: { ...v, receipt_id: receipt.id } as VoucherRow, receipt: receipt.row };
}

export type RedeemOutcome = { result: string; ledgerId: string | null; balance: number | null };

/** The database's answer from gift_voucher_redeem / gift_voucher_reverse, normalised. */
export function readRpcOutcome(data: unknown): RedeemOutcome {
  const row = Array.isArray(data) ? data[0] : data;
  const o = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    result: String(o.result ?? 'failed'),
    ledgerId: o.ledger_id ? String(o.ledger_id) : null,
    balance: o.balance == null ? null : Number(o.balance),
  };
}
