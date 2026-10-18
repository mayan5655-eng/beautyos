// app/api/grow/fees/route.ts
//
// GET [?appointmentId=&clientId=] -> the fee items that need her attention (pending questions, and refunds that failed), each with its one-tap
// question in Hebrew. With appointmentId or clientId it narrows to that appointment or client card. Read through her tenant only.
import { NextResponse } from 'next/server';
import { feeQuestion } from '@/lib/grow/cancelFees';
import type { FeeStatus } from '@/lib/grow/cancelFees';
import { admin, caller, tableMissing } from '../_shared';

export async function GET(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  const u = new URL(request.url);
  let q = admin().from('cancellation_fee_items').select('*').eq('tenant_id', c.tenantId).in('status', ['pending', 'refund_failed'] satisfies FeeStatus[]).order('created_at', { ascending: false }).limit(50);
  const appointmentId = u.searchParams.get('appointmentId');
  const clientId = u.searchParams.get('clientId');
  if (appointmentId) q = q.eq('appointment_id', appointmentId);
  if (clientId) q = q.eq('client_id', clientId);
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ success: true, tableReady: false, items: [] });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון' }, { status: 500 });
  }
  const items = (data || []).map((r) => ({
    id: r.id, kind: r.kind, status: r.status, amount: Number(r.amount), client_name: r.client_name, client_id: r.client_id, appointment_id: r.appointment_id, service: r.service,
    question: feeQuestion({ kind: r.kind, amount: Number(r.amount), client_name: r.client_name }), error: r.error,
  }));
  return NextResponse.json({ success: true, tableReady: true, items });
}
