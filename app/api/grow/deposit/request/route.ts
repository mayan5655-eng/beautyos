// app/api/grow/deposit/request/route.ts
//
// POST { appointmentId } -> the cosmetician booked an appointment herself in the calendar and switched "request deposit" on. Creates the same 30-minute
// pending hold as a public booking and returns the Grow payment link for her to send the client (the app builds the wa.me message). Refused unless the
// business is connected to Grow and its policy is in deposit mode; nothing is charged here, the client pays on Grow's page.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { requestDepositForAppointment } from '@/lib/grow/cancelFees';
import { caller, DEMO_NOTE } from '../../_shared';
import { cancelDeps } from '../../_cancel';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { appointmentId?: unknown };
  const appointmentId = typeof b.appointmentId === 'string' || typeof b.appointmentId === 'number' ? String(b.appointmentId) : '';
  if (!appointmentId) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  const deps = cancelDeps();
  if (!deps) return NextResponse.json({ success: false, error: 'הסליקה בכרטיס אשראי עוד לא פעילה במערכת' }, { status: 409 });
  try {
    const r = await requestDepositForAppointment(deps, { tenantId: c.tenantId, appointmentId, returnUrl: `${APP_URL}/book?t=${c.tenantId}` });
    if (!r.ok) return NextResponse.json({ success: false, code: r.code, error: r.error }, { status: r.code === 'step-failed' ? 502 : 400 });
    return NextResponse.json({ success: true, url: r.url, amount: r.amount, minutes: r.minutes, clientName: r.clientName, phone: r.phone });
  } catch (e) {
    console.error('[grow] owner deposit request failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'משהו נתקע, נסי שוב בעוד רגע' }, { status: 500 });
  }
}
