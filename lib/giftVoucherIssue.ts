// lib/giftVoucherIssue.ts
//
// SERVER ONLY. "This Grow payment was a gift voucher purchase: make sure its voucher exists." One function, three callers:
//   * the Grow paid callback (app/api/grow/_cancel.ts afterPaidHook), right after the payment flipped to paid and its receipt was written;
//   * the buyer's own page polling for her voucher (app/api/vouchers/public), in case that first attempt failed half way;
//   * her vouchers list (app/api/vouchers), the same safety net from her side.
// Every one of them reads the payment's status from the database: only a payment that Grow's verified callback marked 'paid' issues
// anything, and the unique index on gift_vouchers.grow_payment_id makes the second, third and hundredth call a no-op.
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { issueFromPayment, type IssueResult } from './giftVoucherService.ts';
import { supabaseVoucherRepo } from './giftVoucherRepo.ts';
import { isMissingVoucherSchema } from './giftVouchers.ts';

const rnd = (n: number) => new Uint8Array(randomBytes(n));

/** null: not a voucher purchase (or the migration has not run, so no payment can carry one). */
export async function ensureVoucherForPayment(db: SupabaseClient, paymentId: string): Promise<IssueResult | null> {
  const { data, error } = await db.from('grow_payments').select('id, tenant_id, status, amount, payer_phone, gift_voucher').eq('id', paymentId).maybeSingle();
  if (error && isMissingVoucherSchema(error)) return null;
  if (error) throw new Error(error.message);
  const p = data as { id: string; tenant_id: string; status: string; amount: number; payer_phone: string | null; gift_voucher: unknown } | null;
  if (!p || !p.gift_voucher) return null;
  return issueFromPayment(p, p.gift_voucher, { repo: supabaseVoucherRepo(db), randomBytes: rnd });
}

/** The payment that carries this voucher token, for the buyer's page before (or while) the voucher is issued. */
export async function paymentForToken(db: SupabaseClient, token: string): Promise<{ id: string; tenant_id: string; status: string } | null> {
  const { data, error } = await db.from('grow_payments').select('id, tenant_id, status').eq('gift_voucher->>token', token).limit(1).maybeSingle();
  if (error) return null;
  return (data || null) as { id: string; tenant_id: string; status: string } | null;
}
