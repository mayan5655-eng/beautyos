// app/api/grow/register/route.ts
//
// POST { fullName, phone, businessName, email? } -> { url }
//
// "I don't have Grow yet": asks Grow for a registration link for HER business (lib/grow/registration.ts), with a tracking code
// only we know, and remembers it as a pending registration ('waiting'). When Grow approves, the platform webhook matches the
// tracking code, stores her userId and switches clearing on for her business only. Nothing is charged and nothing is sent.
//
// Refused plainly when the registration is not available on this deployment (live mode before Grow sends the registration
// spec: GROW_REGISTRATION_PATH unset), when she is already connected, and for the demo business.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { registrationOps, newTrackingCode } from '@/lib/grow/registration';
import { growFullName, growPhone, growText } from '@/lib/grow/payload';
import { checkTenantLimit } from '@/lib/rateLimit';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const limited = checkTenantLimit(c.tenantId, 'legal-receipts');
  if (limited) return limited;

  const grow = resolveGrow(process.env, APP_URL);
  const ops = registrationOps(process.env, grow.mode, grow.configured, grow.creds, APP_URL);
  if (!ops) {
    return NextResponse.json({ success: false, code: 'not-available', error: 'פתיחת חשבון Grow מתוך Kalmea עוד לא זמינה. בינתיים אפשר להשאיר פרטים ונעביר אותם ל-Grow.' }, { status: 409 });
  }

  const db = admin();
  const acc = await db.from('grow_accounts').select('user_id').eq('tenant_id', c.tenantId).maybeSingle();
  if (acc.error && tableMissing(acc.error)) return NextResponse.json({ success: false, error: 'חיבור Grow עוד לא הופעל בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
  if (acc.data) return NextResponse.json({ success: false, code: 'already-connected', error: 'החשבון שלך כבר מחובר ל-Grow' }, { status: 409 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fullName = growFullName(String(b.fullName ?? ''));
  const businessName = growText(b.businessName, 80);
  const phone = growPhone(b.phone);
  const email = typeof b.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ? b.email.trim().slice(0, 120) : undefined;
  if (fullName.split(' ').filter(Boolean).length < 2) return NextResponse.json({ success: false, error: 'צריך שם פרטי ושם משפחה' }, { status: 400 });
  if (!phone) return NextResponse.json({ success: false, error: 'מספר הנייד לא נראה תקין' }, { status: 400 });
  if (businessName.length < 2) return NextResponse.json({ success: false, error: 'חסר שם העסק' }, { status: 400 });

  const trackingCode = newTrackingCode(() => randomBytes(12).toString('hex'));
  const base = APP_URL.replace(/\/+$/, '');
  const r = await ops.createLink({
    trackingCode, businessName, fullName, phone, email,
    notifyUrl: `${base}/api/grow/webhook`,
    returnUrl: `${base}/?grow=registered`,
  });
  if (!r.ok) {
    console.error('[grow] registration link refused:', r.code, r.error);
    return NextResponse.json({ success: false, error: 'Grow לא פתחה כרגע את טופס ההרשמה. אפשר לנסות שוב בעוד רגע.' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const full = { tenant_id: c.tenantId, tracking_code: trackingCode, created_at: now, consumed_at: null, status: 'waiting', status_message: null, encrypted_lead: r.encryptedLead, link_url: r.url, updated_at: now };
  let { error } = await db.from('grow_onboarding_pending').upsert(full, { onConflict: 'tenant_id' });
  if (error && /column|schema cache|42703|PGRST204/i.test(`${error.code} ${error.message}`)) {
    // add_grow_cashier.sql not run yet: the tracking code alone still lets the webhook match her approval.
    ({ error } = await db.from('grow_onboarding_pending').upsert({ tenant_id: c.tenantId, tracking_code: trackingCode, created_at: now, consumed_at: null }, { onConflict: 'tenant_id' }));
  }
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ success: false, error: 'חיבור Grow עוד לא הופעל בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
    console.error('[grow] registration save failed:', error.message);
    return NextResponse.json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, { status: 500 });
  }
  console.log('[grow] registration link opened for tenant', c.tenantId, grow.mode);
  return NextResponse.json({ success: true, url: r.url });
}
