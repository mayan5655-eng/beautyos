// lib/grow/repo.ts
//
// SERVER ONLY. The service-role implementation of GrowRepo (lib/grow/service.ts). Every statement names the
// tenant it acts for; the notify secret is the only way into a row from a callback.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GrowRepo, GrowPayment } from './service.ts';

const SELECT = 'id, tenant_id, status, amount, process_id, receipt_id, client_id, client_name, appointment_id, description, notify_token, updated_at';
const isMissingColumn = (e: { message?: string; code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column|schema cache/i.test(e.message || ''));

export function supabaseGrowRepo(db: SupabaseClient): GrowRepo {
  return {
    async insertPayment(row) {
      const { data, error } = await db.from('grow_payments').insert(row).select(SELECT).single();
      if (error || !data) throw new Error(error?.message || 'insert failed');
      return data as unknown as GrowPayment;
    },
    async updatePayment(id, patch) {
      const { error } = await db.from('grow_payments').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async markPaid(id, patch) {
      const { data, error } = await db.from('grow_payments').update(patch).eq('id', id).eq('status', 'created').select(SELECT);
      if (error) throw new Error(error.message);
      return (data && data[0] ? data[0] : null) as unknown as GrowPayment | null;
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
