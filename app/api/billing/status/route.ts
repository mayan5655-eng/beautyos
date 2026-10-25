// app/api/billing/status/route.ts
//
// GET -> what the billing screen and the trial banner need, in one call, read for HER tenant only (the tenant comes from her session; the token
// reference is not a column the browser role may read):
//   ui / mode / configured   the screens are on for this deployment; mock or live; can a card be added at all
//   plan                     { status, trialEndsAt, price }  the price she will pay (her subscription's, else her agreed price, else 499)
//   subscription             null until she adds a card; otherwise status, price, next charge, card last four, failed attempts, grace end
//   payments                 her billing history with the invoice links
//   tableReady               false while add_kalmea_billing.sql has not been run
import { NextResponse } from 'next/server';
import { priceOf, graceEndsAt, nextRetryAt, INVITE_DAYS } from '@/lib/billing/service';
import { admin, billing, caller, tableMissing } from '../_shared';
import { ADDON_PACKS, ADDON_PACK_KEYS, addonPacksEnabled, addonButtonHe } from '@/lib/pricing';
import { getCallCapStatus } from '@/lib/ai/callCaps';
import { purchasedAddons } from '@/lib/addonQuota';

const SUB_COLS = 'id, tenant_id, price, currency, status, next_charge_at, card_last4, card_brand, failed_attempts, past_due_since, last_attempt_at, canceled_at, ends_at';

export async function GET() {
  const c = await caller();
  if ('error' in c) return c.error;
  const b = billing();
  const out = {
    success: true, ui: true, mode: b.mode, configured: b.configured, tableReady: true, inviteDays: INVITE_DAYS,
    plan: { status: 'active' as string, trialEndsAt: null as string | null, price: priceOf(null) },
    subscription: null as Record<string, unknown> | null,
    payments: [] as unknown[],
  };

  // The plan columns are not readable with her own session (the gate revoked them from the browser role), so they are read with the service role,
  // for her own tenant only (c.tenantId comes from her session).
  const t = await admin().from('tenants').select('plan_status, trial_ends_at, plan_price, created_at').eq('id', c.tenantId).maybeSingle();
  if (t.data) out.plan = { status: String(t.data.plan_status || 'active'), trialEndsAt: (t.data.trial_ends_at as string | null) ?? null, price: priceOf(t.data) };

  // Read with the service role for her own tenant, like the writes: under the session the select policy can hide her row (the same mismatch
  // made the Grow card show a connected business as "not connected", fixed in b7b3e81). SUB_COLS never includes the token reference.
  const s = await admin().from('billing_subscriptions').select(SUB_COLS).eq('tenant_id', c.tenantId).maybeSingle();
  if (s.error) {
    if (tableMissing(s.error)) return NextResponse.json({ ...out, tableReady: false });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את פרטי המנוי' }, { status: 500 });
  }
  if (s.data) {
    const sub = { ...(s.data as unknown as Parameters<typeof graceEndsAt>[0]), token_ref: null };
    out.plan.price = Number(s.data.price);
    out.subscription = {
      ...s.data,
      graceEndsAt: graceEndsAt(sub)?.toISOString() ?? null,
      nextRetryAt: nextRetryAt(sub)?.toISOString() ?? null,
    };
  }

  const p = await admin()
    .from('billing_payments')
    .select('id, kind, status, amount, currency, period_start, period_end, invoice_status, invoice_number, invoice_url, note, created_at')
    .eq('tenant_id', c.tenantId)
    .order('created_at', { ascending: false })
    .limit(24);
  if (!p.error) out.payments = p.data || [];
  // Add-on packs (lib/pricing.ts): this month's use of each metered feature and the pack she can buy. Absent while packs are off.
  if (addonPacksEnabled()) {
    const bought = await purchasedAddons(c.tenantId, { noCache: true });
    const addons = await Promise.all(ADDON_PACK_KEYS.map(async (k) => {
      const p = ADDON_PACKS[k];
      const st = await getCallCapStatus(c.tenantId, p.callSite, { purchased: bought });
      return { key: k, label: p.unitHe, used: st.unknown ? null : st.used, cap: st.cap, purchased: st.purchased || 0, units: p.units, price: p.price, button: addonButtonHe(p) };
    }));
    return NextResponse.json({ ...out, addons });
  }
  return NextResponse.json(out);
}
