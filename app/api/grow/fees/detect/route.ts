// app/api/grow/fees/detect/route.ts
//
// POST { appointmentId, event: 'cancel' | 'no_show' | 'restore' } -> the app calls this right after SHE cancels an appointment, marks a no-show, or
// undoes one. It only ever creates a pending question (or records a deposit being kept, returned or credited); it never charges. A business
// without a policy, or an appointment without a stored consent, is answered with "nothing to do", so the app can call it blindly.
// The client's own cancel link reaches the same logic from app/api/confirm.
import { NextResponse } from 'next/server';
import { detect } from '@/lib/grow/cancelFees';
import { caller } from '../../_shared';
import { cancelDeps } from '../../_cancel';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  const b = (await request.json().catch(() => ({}))) as { appointmentId?: unknown; event?: unknown };
  const appointmentId = typeof b.appointmentId === 'string' || typeof b.appointmentId === 'number' ? String(b.appointmentId) : '';
  const event = b.event === 'cancel' || b.event === 'no_show' || b.event === 'restore' ? b.event : null;
  if (!appointmentId || !event) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  const deps = cancelDeps();
  if (!deps) return NextResponse.json({ success: true, status: 'no-policy' });
  try {
    const r = await detect(deps, { tenantId: c.tenantId, appointmentId, event, actor: 'owner' });
    return NextResponse.json({ success: true, status: r.status });
  } catch (e) {
    // A missing table (migration not run) or any other failure must never break her cancel or no-show: it only means no question appears.
    console.warn('[grow] fee detection failed:', (e as Error)?.message);
    return NextResponse.json({ success: true, status: 'no-policy' });
  }
}
