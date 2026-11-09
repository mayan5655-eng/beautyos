// app/api/billing/status/route.ts
//
// GET -> what the billing screen and the trial banner need, in one call, read for HER tenant only (the tenant comes from her session; the token
// reference is not a column the browser role may read):
//   ui / mode / configured   the screens are on for this deployment; mock or live; can a card be added at all
//   plan                     { status, trialEndsAt, price }  the price she will pay (her subscription's, else her agreed price, else 499)
//   subscription             null until she adds a card; otherwise status, price, next charge, card last four, failed attempts, grace end
//   payments                 her billing history with the invoice links
//   tableReady               false while add_kalmea_billing.sql has not been run
//   annual                   only with NEXT_PUBLIC_ANNUAL_PLAN=1: { ready, monthly, yearly, billingPeriod, pendingPeriod } (ready false
//                            before add_referrals_annual_2026-11-08.sql). Absent while the flag is off, so the card is as before.
import { NextResponse } from 'next/server';
import { priceOf, graceEndsAt, nextRetryAt, INVITE_DAYS } from '@/lib/billing/service';
import { admin, billing, caller, tableMissing } from '../_shared';
import { addonPacksEnabled, annualPlanEnabled, annualPriceOf } from '@/lib/pricing';
import { addonUsageFor } from '@/lib/addonUsage';

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

  // The yearly plan, read on its own so a missing column (migration not run) never hides the rest of the billing card.
  let annual: Record<string, unknown> | null = null;
  if (annualPlanEnabled()) {
    const monthly = Number(out.plan.price);
    annual = { ready: false, monthly, yearly: annualPriceOf(monthly), billingPeriod: 'monthly', pendingPeriod: null };
    if (s.data) {
      const ap = await admin().from('billing_subscriptions').select('billing_period, pending_period').eq('tenant_id', c.tenantId).maybeSingle();
      if (!ap.error) annual = { ...annual, ready: true, billingPeriod: ap.data?.billing_period === 'annual' ? 'annual' : 'monthly', pendingPeriod: ap.data?.pending_period ?? null };
    } else {
      // No subscription yet: ready means the columns exist (a head read of the column), so the choice can be offered after the card.
      const ap = await admin().from('billing_subscriptions').select('billing_period', { head: true, count: 'exact' }).eq('tenant_id', c.tenantId);
      annual = { ...annual, ready: !ap.error };
    }
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
    const addons = await addonUsageFor(c.tenantId);
    return NextResponse.json({ ...out, addons, ...(annual ? { annual } : {}) });
  }
  return NextResponse.json(annual ? { ...out, annual } : out);
}
