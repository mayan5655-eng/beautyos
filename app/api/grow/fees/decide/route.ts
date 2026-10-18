// app/api/grow/fees/decide/route.ts
//
// POST { feeId, decision: 'charge' | 'waive' | 'retry-refund' } -> her one tap. NOTHING is ever charged without this call: detection only creates
// pending items (lib/grow/cancelFees.detect). 'charge' charges the client's saved card on HER Grow account and records the payment and receipt.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { decide, retryRefund } from '@/lib/grow/cancelFees';
import { caller, DEMO_NOTE } from '../../_shared';
import { cancelDeps } from '../../_cancel';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { feeId?: unknown; decision?: unknown };
  const feeId = typeof b.feeId === 'string' ? b.feeId : '';
  if (!/^[0-9a-f-]{36}$/i.test(feeId)) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  const deps = cancelDeps();
  if (!deps) return NextResponse.json({ success: false, error: 'הסליקה בכרטיס אשראי עוד לא פעילה במערכת' }, { status: 409 });

  try {
    if (b.decision === 'retry-refund') {
      const r = await retryRefund(deps, c.tenantId, feeId);
      return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ success: false, error: 'ההחזר לא עבר, נסי שוב בעוד רגע' }, { status: 502 });
    }
    if (b.decision !== 'charge' && b.decision !== 'waive') return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
    const r = await decide(deps, { tenantId: c.tenantId, feeId, decision: b.decision });
    if (!r.ok) return NextResponse.json({ success: false, code: r.code, error: r.error }, { status: r.code === 'gone' ? 409 : r.code === 'declined' ? 502 : 400 });
    console.log('[grow] fee', feeId, r.status, 'tenant', c.tenantId);
    return NextResponse.json({ success: true, status: r.status, receiptId: r.status === 'charged' ? r.receiptId : null });
  } catch (e) {
    console.error('[grow] fee decision failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'משהו נתקע, נסי שוב בעוד רגע' }, { status: 500 });
  }
}
