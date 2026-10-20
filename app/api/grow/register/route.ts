// app/api/grow/register/route.ts
//
// POST { businessNumber, phone } -> { url, phoneMasked }
//
// "I don't have Grow yet": calls Grow's GetLink for HER business (lib/grow/registration.ts). Grow texts the registration form to that
// mobile and answers with the form link and an encrypted_lead, which we keep as the pending registration's tracking code: Grow's
// registration webhook carries the same value, and only that value attaches the result to her business. Nothing is charged.
//
// Calling it again while she waits (a wrong mobile) is allowed: with the same business number and the right mobile Grow updates the
// same lead. Refused plainly when registration is not available on this deployment, when she is already connected, and for the
// demo business. Grow's error ids come back in plain Hebrew (GETLINK_ERRORS), with the id for the logs.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { registrationOps, newTrackingCode, growBusinessNumber } from '@/lib/grow/registration';
import { growPhone } from '@/lib/grow/payload';
import { checkTenantLimit } from '@/lib/rateLimit';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const limited = checkTenantLimit(c.tenantId, 'legal-receipts');
  if (limited) return limited;

  const grow = resolveGrow(process.env, APP_URL);
  const ops = registrationOps(process.env, grow.mode, grow.configured, APP_URL);
  if (!ops) {
    return NextResponse.json({ success: false, code: 'not-available', error: 'פתיחת חשבון Grow מתוך Kalmea עוד לא זמינה. בינתיים אפשר להשאיר פרטים ונעביר אותם ל-Grow.' }, { status: 409 });
  }

  const db = admin();
  const acc = await db.from('grow_accounts').select('user_id').eq('tenant_id', c.tenantId).maybeSingle();
  if (acc.error && tableMissing(acc.error)) return NextResponse.json({ success: false, error: 'חיבור Grow עוד לא הופעל בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
  if (acc.data) return NextResponse.json({ success: false, code: 'already-connected', error: 'החשבון שלך כבר מחובר ל-Grow' }, { status: 409 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const businessNumber = growBusinessNumber(b.businessNumber);
  const phone = growPhone(b.phone);
  if (!businessNumber) return NextResponse.json({ success: false, code: 'bad-business-number', error: 'מספר תעודת הזהות או העוסק לא נראה תקין' }, { status: 400 });
  if (!phone) return NextResponse.json({ success: false, code: 'bad-phone', error: 'צריך נייד ישראלי שמתחיל ב-05, 10 ספרות' }, { status: 400 });

  const trackingCode = newTrackingCode(() => randomBytes(12).toString('hex'));
  const r = await ops.createLink({ trackingCode, businessNumber, phone });
  if (!r.ok) {
    // The id and Grow's own words go to the log (no phone, no business number); she gets the plain Hebrew.
    console.error('[grow] GetLink refused:', ops.kind, r.code, r.growId || '-', r.error);
    const status = r.code === 'unreachable' ? 502 : r.kind === 'platform' || r.kind === 'general' ? 502 : 409;
    return NextResponse.json({ success: false, code: r.kind, growId: r.growId || null, error: r.messageHe }, { status });
  }

  const now = new Date().toISOString();
  // Grow's encrypted_lead IS the tracking code its webhook sends back: that is what the pending row is found by.
  const full = { tenant_id: c.tenantId, tracking_code: r.encryptedLead, created_at: now, consumed_at: null, status: 'waiting', status_message: null, encrypted_lead: r.encryptedLead, link_url: r.url, updated_at: now };
  let { error } = await db.from('grow_onboarding_pending').upsert(full, { onConflict: 'tenant_id' });
  if (error && /column|schema cache|42703|PGRST204/i.test(`${error.code} ${error.message}`)) {
    // add_grow_cashier.sql not run yet: the tracking code alone still lets the webhook match her approval.
    ({ error } = await db.from('grow_onboarding_pending').upsert({ tenant_id: c.tenantId, tracking_code: r.encryptedLead, created_at: now, consumed_at: null }, { onConflict: 'tenant_id' }));
  }
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ success: false, error: 'חיבור Grow עוד לא הופעל בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
    console.error('[grow] registration save failed:', error.message);
    return NextResponse.json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, { status: 500 });
  }
  console.log('[grow] registration link opened for tenant', c.tenantId, ops.kind);
  return NextResponse.json({ success: true, url: r.url, phoneMasked: `${phone.slice(0, 3)}-•••-${phone.slice(-4)}` });
}
