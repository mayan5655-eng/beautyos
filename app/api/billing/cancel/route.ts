// app/api/billing/cancel/route.ts
//
// POST -> she cancels her subscription. No more charges; she keeps what she has paid for until ends_at, then the existing read-only gate
// closes (nothing is ever deleted). Adding a card again resumes it.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { cancelSubscription } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { admin, billing, caller } from '../_shared';

export async function POST() {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, אי אפשר לבטל מנוי בחשבון הדגמה' }, { status: 403 });
  try {
    const b = billing();
    const r = await cancelSubscription(
      { repo: supabaseBillingRepo(admin()), payments: b.payments!, invoicing: b.invoicing! },
      c.tenantId,
    );
    if (!r.ok) return NextResponse.json({ success: false, error: 'אין מנוי פעיל לביטול' }, { status: 404 });
    console.log('[billing] canceled tenant', c.tenantId, 'ends', r.endsAt);
    return NextResponse.json({ success: true, endsAt: r.endsAt });
  } catch (e) {
    console.error('[billing] cancel failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'הביטול נכשל, נסי שוב' }, { status: 500 });
  }
}
