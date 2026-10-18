// app/api/grow/holds/route.ts
//
// GET -> the bookings of this business that are held as pending while the client pays her deposit: [{ appointmentId, expiresAt }]. The calendar and the
// appointment card show them as "ממתינה למקדמה" with the minutes that are left (app/HoldBadge.jsx). Only holds that have not run out yet; an expired one
// is released by lib/grow/cancelFees.releaseExpiredHolds, so it simply disappears from this list.
import { NextResponse } from 'next/server';
import { admin, caller, tableMissing } from '../_shared';

export async function GET() {
  const c = await caller();
  if ('error' in c) return c.error;
  const { data, error } = await admin()
    .from('appointment_policy_consents')
    .select('appointment_id, hold_expires_at')
    .eq('tenant_id', c.tenantId)
    .eq('status', 'awaiting_deposit')
    .gt('hold_expires_at', new Date().toISOString())
    .limit(100);
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ success: true, holds: [] });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון' }, { status: 500 });
  }
  return NextResponse.json({ success: true, holds: (data || []).map((r) => ({ appointmentId: String(r.appointment_id), expiresAt: String(r.hold_expires_at) })) });
}
