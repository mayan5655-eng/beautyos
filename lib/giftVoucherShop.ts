// lib/giftVoucherShop.ts
//
// SERVER ONLY. Can a visitor buy a gift voucher from this business online, and for what? One answer for the public purchase page
// (app/[slug]/gift), the small link on her public page (app/api/vouchers/public?shop=) and the purchase route itself
// (app/api/vouchers/buy), so the page never offers what the route would refuse.
//
// Online purchase needs ALL of: the platform flag, her own "selling on" switch, the voucher tables (the migration), her business not
// closed, and Grow switched on, connected and enabled for her business. Without Grow the page says to buy at the business instead.
import type { SupabaseClient } from '@supabase/supabase-js';
import { growUiEnabled, resolveGrow } from './grow/adapter.ts';
import { giftVouchersVisible, voucherConfig, voucherOptions, isMissingVoucherSchema, type VoucherConfig, type VoucherOption } from './giftVouchers.ts';
import { ACTIVE_OR_NULL } from './serviceActive.js';
import { tenantIsBlocked } from './tenantActive.ts';
import { isDemoTenantId } from './demoTenants.ts';

export type VoucherShop = {
  /** The platform flag and her switch are both on: there is something to show. */
  visible: boolean;
  /** visible, AND it can be paid for online right now. */
  online: boolean;
  /** Why not online, for the page's honest sentence. */
  reason: 'off' | 'closed' | 'no-migration' | 'no-grow' | 'no-options' | null;
  cfg: VoucherConfig;
  options: VoucherOption[];
  slug: string | null;
  settings: Record<string, unknown> | null;
};

export async function loadVoucherShop(db: SupabaseClient, tenantId: string, env: Record<string, string | undefined> = process.env, appUrl = ''): Promise<VoucherShop> {
  // Settings first and alone: for almost every business the flag is off, and that answer needs nothing else.
  const st = await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  const settings = (st.data || null) as Record<string, unknown> | null;
  const cfg = voucherConfig(settings as never);
  if (!settings || !giftVouchersVisible(settings as never) || !cfg.enabled) return { cfg, options: [], slug: null, settings, visible: false, online: false, reason: 'off' };
  const [sv, tn] = await Promise.all([
    db.from('service_prices').select('id, name, price, active').eq('tenant_id', tenantId).or(ACTIVE_OR_NULL),
    db.from('tenants').select('slug').eq('id', tenantId).maybeSingle(),
  ]);
  const base = { cfg, options: [] as VoucherOption[], slug: ((tn.data as { slug?: string } | null)?.slug) || null, settings };
  const options = voucherOptions(cfg, (sv.data || []) as never);
  const withOptions = { ...base, options, visible: true };
  if (await tenantIsBlocked(db, tenantId).catch(() => false)) return { ...withOptions, visible: false, online: false, reason: 'closed' };
  const probe = await db.from('gift_vouchers').select('id', { head: true, count: 'exact' }).eq('tenant_id', tenantId).limit(1);
  if (probe.error && isMissingVoucherSchema(probe.error)) return { ...withOptions, online: false, reason: 'no-migration' };
  if (!options.length) return { ...withOptions, online: false, reason: 'no-options' };
  // The demo businesses never take a real payment.
  if (isDemoTenantId(tenantId)) return { ...withOptions, online: false, reason: 'no-grow' };
  if (!growUiEnabled(env) || !growUiEnabled(env, tenantId)) return { ...withOptions, online: false, reason: 'no-grow' };
  const grow = resolveGrow(env, appUrl);
  if (!grow.configured || !(grow.creds || grow.wallet)) return { ...withOptions, online: false, reason: 'no-grow' };
  const acc = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', tenantId).maybeSingle();
  if (acc.error || !acc.data || (acc.data as { enabled?: unknown }).enabled !== true) return { ...withOptions, online: false, reason: 'no-grow' };
  return { ...withOptions, online: true, reason: null };
}
