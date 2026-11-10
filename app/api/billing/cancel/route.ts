// app/api/billing/cancel/route.ts
//
// POST -> she cancels her subscription. No more charges; she keeps what she has paid for until ends_at, then the plan gate closes the system (app/PlanBlockedScreen.jsx)
// closes (nothing is ever deleted). Adding a card again resumes it.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { cancelSubscription } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { admin, billing, caller, callerIsOwner, NOT_OWNER_HE } from '../_shared';

export async function POST() {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, אי אפשר לבטל מנוי בחשבון הדגמה' }, { status: 403 });
  // Only the business's owner replaces the card / cancels (lib/billing/owner.ts, fails closed); a member of the business never can.
  if (!(await callerIsOwner(admin(), c.tenantId, c.userId))) return NextResponse.json({ success: false, code: 'not-owner', error: NOT_OWNER_HE }, { status: 403 });
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
