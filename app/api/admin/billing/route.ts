// app/api/admin/billing/route.ts
//
// The owner's billing actions on any business, for clients who pay her directly or on a special price:
//   mark-paid   records a manual payment, extends the paid period by one month, and unblocks the business (lib/billing/service.markPaidManually)
//   set-price   sets the monthly price for one business (349 launch, 499 regular, or anything else): on her subscription and on tenants.plan_price
//
// requirePlatformAdmin() runs FIRST; a non-admin gets 404 (a 403 would confirm the endpoint exists). The tenant comes from the body, which is
// correct here and only here: an admin legitimately acts on other businesses. Writes use the service role. Nothing is ever deleted.
import { NextResponse } from 'next/server';
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard';
import { markPaidManually } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { billing } from '../../billing/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function POST(request: Request) {
  const adminCheck = await requirePlatformAdmin();
  if (!adminCheck.ok) return notFound();

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : '';
  if (!UUID_RE.test(tenantId)) return NextResponse.json({ error: 'מזהה עסק לא תקין' }, { status: 400 });

  const db = createAdminClient();
  const b = billing();
  const deps = { repo: supabaseBillingRepo(db), payments: b.payments!, invoicing: b.invoicing! };

  try {
    if (action === 'mark-paid') {
      const amount = body?.amount === undefined || body?.amount === '' ? undefined : Number(body.amount);
      if (amount !== undefined && !(amount > 0 && amount <= 20000)) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 });
      const r = await markPaidManually(deps, tenantId, { amount, note: typeof body?.note === 'string' ? body.note : undefined });
      console.log('[billing] marked paid manually by admin', adminCheck.userId, 'tenant', tenantId);
      return NextResponse.json({ success: true, nextChargeAt: r.subscription.next_charge_at });
    }
    if (action === 'set-price') {
      const price = Number(body?.price);
      if (!(price > 0 && price <= 5000)) return NextResponse.json({ error: 'מחיר לא תקין' }, { status: 400 });
      await db.from('tenants').update({ plan_price: price }).eq('id', tenantId);
      const sub = await deps.repo.getSub(tenantId);
      if (sub) await deps.repo.updateSub(sub.id, { price });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e) {
    console.error('[billing] admin action failed:', (e as Error)?.message);
    return NextResponse.json({ error: 'הפעולה נכשלה' }, { status: 500 });
  }
}
