// app/api/grow/request/route.ts
//
// POST { name, phone, businessName, businessId } -> she has no Grow account yet and asks us to pass her details on to Grow.
// One open request per business (a second submit updates it). Stored for the platform owner, who forwards it; nothing is sent to Grow
// from here and nothing is charged. The row holds her phone and business id, so the table is server-only (add_grow_signup_requests.sql).
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { growPhone, growText } from '@/lib/grow/payload';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const name = growText(b.name, 60);
  const businessName = growText(b.businessName, 80);
  const phone = growPhone(b.phone);
  const businessId = String(b.businessId ?? '').replace(/\D/g, '');
  if (name.length < 2) return NextResponse.json({ success: false, error: 'חסר שם' }, { status: 400 });
  if (!phone) return NextResponse.json({ success: false, error: 'מספר הנייד לא נראה תקין' }, { status: 400 });
  if (businessName.length < 2) return NextResponse.json({ success: false, error: 'חסר שם העסק' }, { status: 400 });
  if (!/^\d{8,9}$/.test(businessId)) return NextResponse.json({ success: false, error: 'מספר עוסק או ח.פ. צריך להיות 8 או 9 ספרות' }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await admin().from('grow_signup_requests').upsert(
    { tenant_id: c.tenantId, name, phone, business_name: businessName, business_id: businessId, status: 'new', updated_at: now },
    { onConflict: 'tenant_id' },
  );
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ success: false, error: 'הבקשה עוד לא יכולה להישלח (חסרה הרצת מיגרציה)' }, { status: 409 });
    console.error('[grow] signup request failed:', error.message);
    return NextResponse.json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, { status: 500 });
  }
  console.log('[grow] signup request stored for tenant', c.tenantId);
  return NextResponse.json({ success: true });
}
