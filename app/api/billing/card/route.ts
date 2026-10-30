// app/api/billing/card/route.ts
//
// POST { consent: true } -> opens the provider's HOSTED page where she saves her card, and returns its address. Card details are typed on the
// provider's page only; nothing in Kalmea ever sees them, and what comes back is a token reference (see /api/billing/mock-card for the mock
// page, lib/billing/growBilling.ts and /api/billing/grow-notify for Grow).
//
// The consent tick is required, on the server too: the exact words she saw (with her price), the version and the time are stored before the
// card page opens (billing_card_consents, add_kalmea_billing_grow.sql). Without that table the tick is still required, it just is not stored.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { signCardSession } from '@/lib/billing/session';
import { priceOf } from '@/lib/billing/service';
import { billingConsentTextHe, BILLING_CONSENT_VERSION } from '@/lib/billing/consent';
import { admin, billing, caller, tableMissing } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, אי אפשר להוסיף כרטיס בחשבון הדגמה' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { consent?: unknown };
  if (body.consent !== true) {
    return NextResponse.json({ success: false, code: 'consent-required', error: 'כדי לשמור כרטיס צריך לסמן את האישור' }, { status: 400 });
  }

  const b = billing();
  if (!b.configured || !b.payments) {
    return NextResponse.json({ success: false, code: 'not-configured', error: 'התשלום בכרטיס אשראי עוד לא פעיל. נעדכן כשהוא זמין.' }, { status: 409 });
  }

  const db = admin();
  const [{ data: tenant }, { data: st }, { data: sub }] = await Promise.all([
    db.from('tenants').select('id, name, plan_status, trial_ends_at, plan_price, created_at').eq('id', c.tenantId).maybeSingle(),
    db.from('settings').select('business_name, therapist_name, business_phone, automations').eq('tenant_id', c.tenantId).maybeSingle(),
    db.from('billing_subscriptions').select('price').eq('tenant_id', c.tenantId).maybeSingle(),
  ]);
  const price = sub?.price ? Number(sub.price) : priceOf(tenant || null);

  // What she agreed to, stored before the card page opens.
  const { data: { user } } = await c.session.auth.getUser();
  const consent = await db.from('billing_card_consents').insert({
    tenant_id: c.tenantId, user_id: user?.id || null, consent_text: billingConsentTextHe(price), consent_version: BILLING_CONSENT_VERSION, price,
  });
  if (consent.error && !tableMissing(consent.error)) {
    console.error('[billing] consent not stored:', consent.error.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לשמור את האישור, נסי שוב' }, { status: 500 });
  }

  const autos = st?.automations && typeof st.automations === 'object' ? (st.automations as Record<string, unknown>) : {};
  const base = APP_URL.replace(/\/+$/, '');
  try {
    const session = await b.payments.createCardSession({
      tenantId: c.tenantId,
      businessName: String(st?.business_name || tenant?.name || ''),
      email: c.email,
      fullName: String(st?.therapist_name || st?.business_name || tenant?.name || ''),
      phone: String(autos.owner_phone || st?.business_phone || ''),
      returnUrl: `${base}/dashboard?billing=card`,
      // Grow posts the saved card here; the signed session ties it to THIS business (lib/billing/session.ts).
      notifyUrl: `${base}/api/billing/grow-notify?s=${encodeURIComponent(signCardSession(c.tenantId))}`,
    });
    return NextResponse.json({ success: true, url: session.url });
  } catch (e) {
    console.error('[billing] card session failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לפתוח את דף הכרטיס. אם חסר מספר נייד בהגדרות העסק, הוסיפי אותו ונסי שוב.' }, { status: 502 });
  }
}
