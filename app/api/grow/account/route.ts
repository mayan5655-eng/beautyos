// app/api/grow/account/route.ts
//
// POST { userId?, enabled? } -> connect her Grow merchant id and/or switch Grow on or off.
// Opt-in per cosmetician: nothing is charged for a business without a row here that is enabled.
// Until Kalmea's platform onboarding with Grow allows the embedded registration form, she pastes the userId
// Grow gave her; this route only stores it (the platform apiKey is what authorises a charge).
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { USER_ID_RE } from '@/lib/grow/payload';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { userId?: unknown; enabled?: unknown };
  const db = admin();
  const now = new Date().toISOString();

  const existing = await db.from('grow_accounts').select('user_id').eq('tenant_id', c.tenantId).maybeSingle();
  if (existing.error) {
    if (tableMissing(existing.error)) return NextResponse.json({ success: false, error: 'חיבור Grow עוד לא הופעל בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
    return NextResponse.json({ success: false, error: 'השמירה נכשלה' }, { status: 500 });
  }

  const userId = typeof b.userId === 'string' ? b.userId.trim() : '';
  if (typeof b.userId === 'string' && userId && !USER_ID_RE.test(userId)) {
    return NextResponse.json({ success: false, error: 'מזהה העסק ב-Grow לא נראה תקין' }, { status: 400 });
  }
  const finalUserId = userId || (existing.data ? String(existing.data.user_id) : '');
  if (!finalUserId) return NextResponse.json({ success: false, error: 'חסר מזהה עסק של Grow' }, { status: 400 });

  const { error } = await db.from('grow_accounts').upsert(
    { tenant_id: c.tenantId, user_id: finalUserId, enabled: typeof b.enabled === 'boolean' ? b.enabled : true, updated_at: now },
    { onConflict: 'tenant_id' },
  );
  if (error) {
    console.error('[grow] account write failed:', error.message);
    return NextResponse.json({ success: false, error: 'השמירה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
