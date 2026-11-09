// lib/grow/repo.ts
//
// SERVER ONLY. The service-role implementation of GrowRepo (lib/grow/service.ts). Every statement names the
// tenant it acts for; the notify secret is the only way into a row from a callback.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GrowRepo, GrowPayment } from './service.ts';
import { isMissingLoyaltyTable } from '../loyalty.js';
import { missingColumnName } from '../pgError.ts';

/** grow_payments columns that come from hand-run migrations and may be dropped from an insert until they exist. */
const OPTIONAL_INSERT_COLUMNS: readonly string[] = ['loyalty_redemption', 'origin'];

const SELECT = 'id, tenant_id, status, amount, process_id, receipt_id, client_id, client_name, appointment_id, description, notify_token, updated_at, payer_phone, created_at, transaction_id, invoice_url';
// Codes only: a NOT NULL violation (23502, "null value in column ...") also says "column" and must not take the reduced-insert path.
const isMissingColumn = (e: { message?: string; code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || (!e.code && /could not find the .* column|schema cache/i.test(e.message || '')));

export function supabaseGrowRepo(db: SupabaseClient): GrowRepo {
  return {
    async insertPayment(row) {
      let { data, error } = await db.from('grow_payments').insert(row).select(SELECT).single();
      // Optional columns from hand-run migrations. Until one runs the charge is still created without it, dropping ONLY the column the
      // error names (lib/pgError.ts missingColumnName), or, when the error names none, the first optional one present:
      //   loyalty_redemption  add_loyalty_2026-11-05.sql. Without it the server cannot consume the reward when the link is paid, so the
      //                       receipt gets no 🎁 mark and the till's onPaid remains its only record.
      //   origin              add_grow_payment_origin_2026-11-09.sql: which page opened the payment. Without it the panel infers it
      //                       from kind and description (lib/grow/paymentOrigin.ts), so nothing is lost but the exact label.
      let rest: Record<string, unknown> = row;
      for (let i = 0; i < OPTIONAL_INSERT_COLUMNS.length && error && isMissingColumn(error); i++) {
        const named = missingColumnName(error);
        // A named column that is not optional is never worked around (and never costs an optional column instead).
        const drop = named ? (OPTIONAL_INSERT_COLUMNS.includes(named) ? named : null) : OPTIONAL_INSERT_COLUMNS.find((c) => c in rest);
        if (!drop || !(drop in rest)) break;
        const { [drop]: _dropped, ...next } = rest;
        rest = next;
        ({ data, error } = await db.from('grow_payments').insert(rest).select(SELECT).single());
      }
      if (error || !data) throw new Error(error?.message || 'insert failed');
      return data as unknown as GrowPayment;
    },
    async updatePayment(id, patch) {
      const { error } = await db.from('grow_payments').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async markPaid(id, patch) {
      let { data, error } = await db.from('grow_payments').update(patch).eq('id', id).eq('status', 'created').select(SELECT);
      if (error && isMissingColumn(error) && 'transaction_token' in patch) {
        // transaction_token is a column of add_grow_wallet.sql (what a refund needs): until it runs, the payment is still recorded without it.
        const { transaction_token: _t, ...rest } = patch;
        ({ data, error } = await db.from('grow_payments').update(rest).eq('id', id).eq('status', 'created').select(SELECT));
      }
      if (error) throw new Error(error.message);
      if (data && data[0]) return data[0] as unknown as GrowPayment;
      // A deposit page whose 30-minute hold ran out is marked cancelled (lib/grow/cancelFees.ts releaseExpiredHolds), but Grow's page
      // stays open: a client who pays late HAS paid. Flip that row too, once, so the payment and its receipt are recorded and
      // onDepositPaid restores the booking or refunds the deposit. Nothing else that was cancelled is ever reopened.
      const late = await db.from('grow_payments').update(patch).eq('id', id).eq('status', 'cancelled').eq('error', 'deposit hold expired').select(SELECT);
      if (late.error) throw new Error(late.error.message);
      return (late.data && late.data[0] ? late.data[0] : null) as unknown as GrowPayment | null;
    },
    async findByToken(token) {
      const { data, error } = await db.from('grow_payments').select(SELECT).eq('notify_token', token).maybeSingle();
      if (error) throw new Error(error.message);
      return (data || null) as unknown as GrowPayment | null;
    },
    async findByProcessId(processId) {
      // Exactly one row or nothing: an id shared by two payments is never guessed at.
      const { data, error } = await db.from('grow_payments').select(SELECT).eq('process_id', processId).limit(2);
      if (error) throw new Error(error.message);
      return (data && data.length === 1 ? data[0] : null) as unknown as GrowPayment | null;
    },
    async insertReceipt(row) {
      let { data, error } = await db.from('receipts').insert(row).select('id').single();
      if (error && error.code === '23505' && row.grow_payment_id) {
        // Two callbacks raced and the other one already wrote this payment's receipt: hand back that one instead of failing or doubling.
        const { data: existing } = await db.from('receipts').select('id').eq('grow_payment_id', row.grow_payment_id as string).limit(1).maybeSingle();
        if (existing) return { id: String((existing as { id: unknown }).id) };
      }
      if (error && isMissingColumn(error)) {
        // A column from a hand-run migration is not there yet (legal_provider, tip, discount): record the
        // payment with the columns every deployment has rather than lose it.
        const minimal: Record<string, unknown> = {};
        for (const k of ['tenant_id', 'client_id', 'client_name', 'appointment_id', 'service', 'amount', 'payment_method', 'note', 'items']) minimal[k] = row[k];
        ({ data, error } = await db.from('receipts').insert(minimal).select('id').single());
      }
      if (error || !data) throw new Error(error?.message || 'receipt insert failed');
      return { id: String((data as { id: unknown }).id) };
    },
    async loyaltyIntentOf(paymentId) {
      const { data, error } = await db.from('grow_payments').select('loyalty_redemption').eq('id', paymentId).maybeSingle();
      if (error && isMissingColumn(error)) return null; // the migration has not run: no payment can carry a reward yet
      if (error) throw new Error(error.message);
      return (data as { loyalty_redemption?: unknown } | null)?.loyalty_redemption ?? null;
    },
    async insertLoyaltyRedemption(row) {
      // source: the column does not exist; a Grow redemption is told apart by its receipt (written by the server, legal_provider grow).
      const { error } = await db.from('loyalty_redemptions').insert(row);
      if (!error) return 'inserted';
      if (error.code === '23505') return 'already'; // loyalty_redemptions_one_per_receipt: this receipt's reward is recorded
      if (isMissingLoyaltyTable(error) || isMissingColumn(error)) return 'missing';
      throw new Error(error.message);
    },
    async setReceiptDocument(receiptId, url, number) {
      const patch: Record<string, unknown> = { legal_status: 'issued', legal_provider: 'grow', legal_doc_url: url, legal_issued_at: new Date().toISOString() };
      if (number) patch.legal_doc_number = number;
      let { error } = await db.from('receipts').update(patch).eq('id', receiptId);
      if (error && number && isMissingColumn(error)) {
        // legal_doc_number is a column from a hand-run migration: keep the link even if only the number has nowhere to go.
        delete patch.legal_doc_number;
        ({ error } = await db.from('receipts').update(patch).eq('id', receiptId));
      }
      if (error && !isMissingColumn(error)) throw new Error(error.message);
    },
  };
}
