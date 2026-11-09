// app/api/billing/period/route.ts
//
// POST { period: 'annual' | 'monthly', consent: true } -> she asks to pay yearly (or to go back to monthly). NOTHING is charged here:
// the choice is saved as billing_subscriptions.pending_period and the daily run applies it at her next renewal (lib/billing/service.ts
// requestPeriodSwitch, chargePeriodOf). So a switch can never be a second charge for a period she already paid, and there is no
// proration and no refund to compute. The exact words she agreed to are stored first (billing_card_consents), like the card consent.
//
// Her tenant comes from her session (caller()); like every billing route it does not use the plan guard: a business on hold must still
// reach billing. Behind BILLING_UI_ENABLED (caller) and NEXT_PUBLIC_ANNUAL_PLAN (lib/pricing.ts). Before
// add_referrals_annual_2026-11-08.sql runs it says the yearly plan is not ready yet.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { annualPlanEnabled, annualPriceOf } from '@/lib/pricing';
import { requestPeriodSwitch } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { billingAnnualConsentTextHe, billingMonthlyConsentTextHe, BILLING_ANNUAL_CONSENT_VERSION } from '@/lib/billing/consent';
import { trialEndDateHe } from '@/lib/planCopy';
import { checkTenantLimit } from '@/lib/rateLimit';
import { admin, billing, caller, callerIsOwner, NOT_OWNER_HE, tableMissing } from '../_shared';

const NOT_READY = 'התשלום השנתי עוד לא פעיל בחשבון. נעדכן כשהוא זמין.';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (!annualPlanEnabled()) return NextResponse.json({ success: false, hidden: true, error: 'off' });
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, אי אפשר לשנות מנוי בחשבון הדגמה' }, { status: 403 });
  const limited = checkTenantLimit(c.tenantId, 'billing-period');
  if (limited) return limited;
  if (!(await callerIsOwner(admin(), c.tenantId, c.userId))) return NextResponse.json({ success: false, code: 'not-owner', error: NOT_OWNER_HE }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { period?: unknown; consent?: unknown };
  const period = body.period === 'annual' ? 'annual' : body.period === 'monthly' ? 'monthly' : null;
  if (!period) return NextResponse.json({ success: false, error: 'בחירה לא תקינה' }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ success: false, code: 'consent-required', error: 'כדי לשנות את המסלול צריך לסמן את האישור' }, { status: 400 });

  const db = admin();
  // The columns this needs: without them the switch could not be stored, so say so honestly instead of pretending.
  const probe = await db.from('billing_subscriptions').select('id, price, status, next_charge_at, billing_period, pending_period').eq('tenant_id', c.tenantId).maybeSingle();
  if (probe.error) {
    if (tableMissing(probe.error)) return NextResponse.json({ success: false, code: 'not-ready', error: NOT_READY }, { status: 409 });
    console.error('[billing] period read failed:', probe.error.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לשמור, נסי שוב' }, { status: 500 });
  }
  if (!probe.data) return NextResponse.json({ success: false, code: 'no-subscription', error: 'כדי לבחור תשלום שנתי צריך קודם לשמור כרטיס אשראי.' }, { status: 409 });
  if (probe.data.status === 'canceled') return NextResponse.json({ success: false, code: 'canceled', error: 'המנוי בוטל. אפשר לחדש אותו עם כרטיס, ואז לבחור מסלול.' }, { status: 409 });

  const monthly = Number(probe.data.price);
  const from = probe.data.next_charge_at ? trialEndDateHe(new Date(probe.data.next_charge_at as string)) : '';
  const { data: { user } } = await c.session.auth.getUser();
  const consent = await db.from('billing_card_consents').insert({
    tenant_id: c.tenantId, user_id: user?.id || null,
    consent_text: period === 'annual' ? billingAnnualConsentTextHe(annualPriceOf(monthly), from) : billingMonthlyConsentTextHe(monthly, from),
    consent_version: BILLING_ANNUAL_CONSENT_VERSION, price: period === 'annual' ? annualPriceOf(monthly) : monthly,
  });
  if (consent.error && !tableMissing(consent.error)) {
    console.error('[billing] period consent not stored:', consent.error.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לשמור את האישור, נסי שוב' }, { status: 500 });
  }

  try {
    const b = billing();
    const r = await requestPeriodSwitch({ repo: supabaseBillingRepo(db), payments: b.payments!, invoicing: b.invoicing! }, c.tenantId, period);
    if (!r.ok) return NextResponse.json({ success: false, code: r.reason, error: r.reason === 'off' ? NOT_READY : 'לא הצלחנו לשמור, נסי שוב' }, { status: 409 });
    console.log('[billing] period switch requested by tenant', c.tenantId, period, 'pending', r.pendingPeriod);
    return NextResponse.json({ success: true, billingPeriod: r.billingPeriod, pendingPeriod: r.pendingPeriod, effectiveAt: r.effectiveAt });
  } catch (e) {
    console.error('[billing] period switch failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לשמור, נסי שוב' }, { status: 500 });
  }
}
