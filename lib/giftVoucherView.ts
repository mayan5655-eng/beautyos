// lib/giftVoucherView.ts
//
// SERVER ONLY. What the public voucher page /v/<token> may know, read with the service role and scoped by the token alone:
//   ready      the voucher, as display fields only (lib/giftVouchers.ts publicVoucherView) plus her business's name and colours;
//   pending    a purchase whose payment Grow has not confirmed yet (the buyer just came back from the payment page);
//   cancelled  that payment failed or was cancelled: no voucher, nothing was taken;
//   unknown    no such token (or the migration has not run): indistinguishable on purpose.
// A paid purchase with no voucher yet (the first issue attempt failed half way) is issued here: the payment's status comes from the
// database, which only Grow's verified callback sets to 'paid'.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBranding } from './branding.js';
import { publicVoucherView, voucherConfig, isVoucherToken, isMissingVoucherSchema, type PublicVoucher, type VoucherRow } from './giftVouchers.ts';
import { ensureVoucherForPayment, paymentForToken } from './giftVoucherIssue.ts';
import { VOUCHER_COLS } from './giftVoucherRepo.ts';
import { storageHostOf, type VoucherDesign } from './giftVoucherDesign.ts';

export type PublicBrand = { name: string; primary: string; deep: string; onPrimary: string; secondary: string; logoUrl: string; slug: string | null };

export type PublicVoucherState =
  | { state: 'ready'; voucher: PublicVoucher; brand: PublicBrand; design: VoucherDesign }
  | { state: 'pending' | 'cancelled'; brand: PublicBrand | null; design: VoucherDesign | null }
  | { state: 'unknown' };

async function brandOf(db: SupabaseClient, tenantId: string): Promise<{ brand: PublicBrand; note: string; design: VoucherDesign }> {
  const [{ data: st }, { data: tn }] = await Promise.all([
    db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    db.from('tenants').select('name, slug').eq('id', tenantId).maybeSingle(),
  ]);
  const b = resolveBranding(st || {});
  const t = (tn || {}) as { name?: string; slug?: string };
  return {
    brand: { name: b.businessName || String(t.name || ''), primary: b.primary, deep: b.deep, onPrimary: b.onPrimary, secondary: b.secondary, logoUrl: b.logoUrl, slug: t.slug || null },
    // Her design, validated on the way out (lib/giftVoucherDesign.ts sanitizeDesign): only her own upload survives as an image.
    ...(() => { const c = voucherConfig(st as never, tenantId, storageHostOf(process.env.NEXT_PUBLIC_SUPABASE_URL)); return { note: c.note, design: c.design }; })(),
  };
}

export async function loadPublicVoucher(db: SupabaseClient, token: string, now: Date = new Date()): Promise<PublicVoucherState> {
  if (!isVoucherToken(token)) return { state: 'unknown' };
  const read = async () => {
    const { data, error } = await db.from('gift_vouchers').select(VOUCHER_COLS).eq('token', token).maybeSingle();
    if (error && isMissingVoucherSchema(error)) return { missing: true as const, row: null };
    if (error) throw new Error(error.message);
    return { missing: false as const, row: (data || null) as VoucherRow | null };
  };
  let r = await read();
  if (r.missing) return { state: 'unknown' };
  if (!r.row) {
    const p = await paymentForToken(db, token);
    if (!p) return { state: 'unknown' };
    if (p.status === 'paid') {
      await ensureVoucherForPayment(db, p.id).catch((e) => console.error('[vouchers] issue on view failed', p.id, (e as Error)?.message));
      r = await read();
    }
    if (!r.row) {
      const { brand, design } = await brandOf(db, p.tenant_id);
      return { state: p.status === 'failed' || p.status === 'cancelled' ? 'cancelled' : 'pending', brand, design };
    }
  }
  const row = r.row as VoucherRow;
  const { brand, note, design } = await brandOf(db, String(row.tenant_id));
  return { state: 'ready', voucher: publicVoucherView(row, note, now), brand, design };
}
