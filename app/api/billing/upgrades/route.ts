// app/api/billing/upgrades/route.ts
//
// GET -> what the "שדרוגים ✨" store (app/UpgradesStore.jsx) and the small upgrade chip on each screen need, in one light call, for HER
// tenant only (the tenant comes from her session, never from the request):
//   billing / configured / mode   billing is on for this deployment (BILLING_UI_ENABLED); a card can be charged; mock or live
//   card                          { last4 } of the card saved for her subscription, or null (the store then guides her to add one)
//   packs                         this month's use of each metered AI feature, from the server's real counts (lib/addonUsage.ts)
//   annual                        only with NEXT_PUBLIC_ANNUAL_PLAN=1, the same shape as /api/billing/status
//   referrals                     NEXT_PUBLIC_REFERRALS is on and its tables exist
//
// GET ?request=<id>&pack=<key> -> what happened to ONE purchase, by the request id the store sent with it (owner only, her tenant only):
//   { request: { state } }  'succeeded' | 'failed' (the provider said no: not charged) | 'pending' | 'none' (no charge saved with this id)
//                           Never a provider id, a token or another business's row.
// Packs are offered (and looked up) only once billing_payments.request_id exists (lib/billing/requestIdReady.ts): before
// add_addon_request_id_2026-11-10.sql runs, packs are not purchasable and are reported as unavailable (no pack card, no chip).
// Only the business's owner gets the card and anything chargeable (callerIsOwner): a member sees no pack, no yearly switch, no card.
// Unlike /api/billing/status it never reads the payment history, so a screen can ask on every open. Read-only, rate-limited
// ('billing-upgrades'). With every switch off it answers { hidden: true } and reads nothing.
import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { callerTenantId } from '@/lib/tenantScope';
import { billingUiEnabled } from '@/lib/billing/adapter';
import { isDemoTenantId } from '@/lib/demoTenants';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { addonPacksEnabled, annualPlanEnabled, annualPriceOf } from '@/lib/pricing';
import { referralsEnabled } from '@/lib/referral';
import { priceOf } from '@/lib/billing/service';
import { addonRequestIdReady } from '@/lib/billing/requestIdReady';
import { supabaseBillingRepo } from '@/lib/billing/repo';

import { addonUsageFor } from '@/lib/addonUsage';
import { admin, billing, callerIsOwner, tableMissing } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const packsOn = addonPacksEnabled();
  const annualOn = annualPlanEnabled();
  const refOn = referralsEnabled();
  if (!packsOn && !annualOn && !refOn) return NextResponse.json({ success: false, hidden: true });
  const ipLimited = checkIpLimit(request, 'billing-upgrades');
  if (ipLimited) return ipLimited;

  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const tenantId = await callerTenantId(session);
  if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 403 });
  const limited = checkTenantLimit(tenantId, 'billing-upgrades');
  if (limited) return limited;

  const url = new URL(request.url);
  const requestId = url.searchParams.get('request');
  if (requestId !== null) return requestStatus(tenantId, user.id, requestId, packsOn);

  const ui = billingUiEnabled();
  const b = ui ? billing() : null;
  const out = {
    success: true as const,
    billing: ui,
    configured: !!b?.configured,
    mode: b?.mode || null,
    demo: isDemoTenantId(tenantId),
    card: null as { last4: string } | null,
    subStatus: null as string | null,
    nextChargeAt: null as string | null,
    packs: [] as unknown[],
    annual: null as Record<string, unknown> | null,
    referrals: false,
  };
  // The referral card only when its tables exist (add_referrals_annual_2026-11-08.sql): nothing inactive is shown (owner rule 2026-11-09).
  if (refOn) {
    const rc = await admin().from('referral_codes').select('tenant_id', { head: true, count: 'exact' }).eq('tenant_id', tenantId);
    out.referrals = !rc.error;
  }
  // Billing off: nothing can be bought, so no pack and no yearly switch. The referral card does not need billing.
  if (!ui) return NextResponse.json(out);
  // Nothing can be charged on this deployment yet (no provider configured): no pack and no yearly switch is offered at all.
  if (!out.configured) return NextResponse.json(out);

  const db = admin();
  // A member of the business (not its owner) can never charge its card, so nothing chargeable, and no card digits, reach her.
  if (!(await callerIsOwner(db, tenantId, user.id))) return NextResponse.json({ ...out, configured: false });
  const s = await db.from('billing_subscriptions').select('id, price, status, next_charge_at, card_last4').eq('tenant_id', tenantId).maybeSingle();
  if (s.error && !tableMissing(s.error)) {
    console.error('[upgrades] subscription read failed for tenant', tenantId, s.error.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את השדרוגים' }, { status: 500 });
  }
  const sub = s.error ? null : s.data;
  if (sub) {
    out.subStatus = String(sub.status || '') || null;
    out.nextChargeAt = (sub.next_charge_at as string | null) ?? null;
    // A cancelled subscription keeps its last four, but the store must not offer to charge it (buyAddon refuses it too).
    if (sub.card_last4 && sub.status !== 'canceled') out.card = { last4: String(sub.card_last4) };
  }

  // Not purchasable before the request-id migration: no pack at all, exactly as with packs off.
  if (packsOn && await addonRequestIdReady(db)) {
    out.packs = await addonUsageFor(tenantId);
  }

  if (annualOn) {
    let monthly = Number(sub?.price);
    if (!sub) {
      const t = await db.from('tenants').select('plan_price, created_at').eq('id', tenantId).maybeSingle();
      monthly = priceOf(t.data || null);
    }
    let annual: Record<string, unknown> = { ready: false, monthly, yearly: annualPriceOf(monthly), billingPeriod: 'monthly', pendingPeriod: null };
    const ap = await db.from('billing_subscriptions').select('billing_period, pending_period').eq('tenant_id', tenantId).maybeSingle();
    if (!ap.error) annual = { ...annual, ready: true, billingPeriod: ap.data?.billing_period === 'annual' ? 'annual' : 'monthly', pendingPeriod: ap.data?.pending_period ?? null };
    out.annual = annual;
  }

  return NextResponse.json(out);
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const stateOf = (status: string) => (status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : 'pending');

/** One purchase's outcome by its request id: owner only, her tenant only, the state and nothing else. */
async function requestStatus(tenantId: string, userId: string, requestId: string, packsOn: boolean) {
  if (!packsOn || !billingUiEnabled()) return NextResponse.json({ success: false, hidden: true });
  if (!REQUEST_ID.test(requestId)) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  const db = admin();
  if (!(await callerIsOwner(db, tenantId, userId))) return NextResponse.json({ success: false, error: 'רק בעלת העסק יכולה לבדוק חיוב' }, { status: 403 });
  try {
    const repo = supabaseBillingRepo(db);
    const f = await repo.findAddonByRequest!(tenantId, requestId);
    // Before the migration nothing can have been bought with an id, but the store must not read that as "not charged": 'untracked'.
    if (!f.supported) return NextResponse.json({ success: true, request: { state: 'untracked' } });
    return NextResponse.json({ success: true, request: { state: f.row ? stateOf(String(f.row.status)) : 'none' } });
  } catch (e) {
    console.error('[upgrades] request status read failed for tenant', tenantId, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: 'לא הצלחנו לבדוק את החיוב' }, { status: 500 });
  }
}
