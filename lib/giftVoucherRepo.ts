// lib/giftVoucherRepo.ts
//
// SERVER ONLY. The service-role implementation of VoucherRepo (lib/giftVoucherService.ts). Every statement names the tenant or the
// payment it acts for. The tables come with add_gift_vouchers_2026-11-08.sql; until it runs, every call answers 'missing'.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VoucherRepo, InsertResult } from './giftVoucherService.ts';
import type { VoucherRow } from './giftVouchers.ts';
import { isMissingVoucherSchema } from './giftVouchers.ts';

/** Every column the owner's screen and the till read. The public page never gets this row: it gets publicVoucherView of it. */
export const VOUCHER_COLS = 'id, tenant_id, code, token, kind, service_name, initial_amount, balance, status, expires_at, buyer_name, buyer_phone, recipient_name, message, sold_via, grow_payment_id, receipt_id, voided_at, void_reason, created_at';

const isMissingColumn = (e: { code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204');

export function supabaseVoucherRepo(db: SupabaseClient): VoucherRepo {
  return {
    async insertVoucher(row): Promise<InsertResult> {
      const { data, error } = await db.from('gift_vouchers').insert(row).select(VOUCHER_COLS).single();
      if (!error && data) return { status: 'inserted', row: data as unknown as VoucherRow };
      if (error && isMissingVoucherSchema(error)) return { status: 'missing' };
      if (error && error.code === '23505') {
        const m = `${error.message || ''} ${(error as { details?: string }).details || ''}`;
        return /code/i.test(m) && !/payment|sale_key/i.test(m) ? { status: 'duplicate-code' } : { status: 'already' };
      }
      throw new Error(error?.message || 'voucher insert failed');
    },
    async findByPayment(paymentId) {
      const { data, error } = await db.from('gift_vouchers').select(VOUCHER_COLS).eq('grow_payment_id', paymentId).maybeSingle();
      if (error && isMissingVoucherSchema(error)) return null;
      if (error) throw new Error(error.message);
      return (data || null) as unknown as VoucherRow | null;
    },
    async findBySaleKey(tenantId, saleKey) {
      const { data, error } = await db.from('gift_vouchers').select(VOUCHER_COLS).eq('tenant_id', tenantId).eq('sale_key', saleKey).maybeSingle();
      if (error && isMissingVoucherSchema(error)) return null;
      if (error) throw new Error(error.message);
      return (data || null) as unknown as VoucherRow | null;
    },
    async insertLedger(row) {
      const { error } = await db.from('gift_voucher_ledger').insert(row);
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    async receiptIdForPayment(paymentId) {
      const { data } = await db.from('grow_payments').select('receipt_id').eq('id', paymentId).maybeSingle();
      const rid = (data as { receipt_id?: unknown } | null)?.receipt_id;
      if (rid) return String(rid);
      const { data: r } = await db.from('receipts').select('id').eq('grow_payment_id', paymentId).limit(1).maybeSingle();
      return r ? String((r as { id: unknown }).id) : null;
    },
    async setReceiptItems(receiptId, items, service) {
      const { error } = await db.from('receipts').update({ items: JSON.stringify(items), service }).eq('id', receiptId);
      if (error) throw new Error(error.message);
    },
    async insertReceipt(row) {
      let { data, error } = await db.from('receipts').insert(row).select('*').single();
      if (error && isMissingColumn(error)) {
        // A column from a hand-run migration is not there yet: record the money with the columns every deployment has.
        const minimal: Record<string, unknown> = {};
        for (const k of ['tenant_id', 'client_id', 'client_name', 'appointment_id', 'service', 'amount', 'payment_method', 'note', 'items']) minimal[k] = row[k];
        ({ data, error } = await db.from('receipts').insert(minimal).select('*').single());
      }
      if (error || !data) throw new Error(error?.message || 'receipt insert failed');
      const out = data as Record<string, unknown>;
      return { id: String(out.id), row: out };
    },
    async setVoucherReceipt(voucherId, receiptId) {
      const { error } = await db.from('gift_vouchers').update({ receipt_id: receiptId, updated_at: new Date().toISOString() }).eq('id', voucherId).is('receipt_id', null);
      if (error) throw new Error(error.message);
    },
    async findSaleReceipt(tenantId, code) {
      if (!/^[0-9A-Z]{8}$/.test(code)) return null;
      const { data, error } = await db.from('receipts').select('id').eq('tenant_id', tenantId).like('note', `%קוד ${code}%`).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: String((data as { id: unknown }).id) } : null;
    },
    async voidVoucher(voucherId, reason, by) {
      const { error } = await db.from('gift_vouchers').update({ status: 'void', voided_at: new Date().toISOString(), voided_by: by, void_reason: reason.slice(0, 200), updated_at: new Date().toISOString() }).eq('id', voucherId).eq('status', 'active');
      if (error) throw new Error(error.message);
    },
  };
}
