// app/api/grow/deposit/route.ts
//   GET  ?appointmentId=  -> the deposit the client already paid for this appointment and that the cashier should deduct ({ amount } or null)
//   POST { appointmentId, receiptId, used } -> the visit's receipt was saved with the deposit deducted: remember it (so it is deducted once) and keep
//        anything above the visit's total as client credit.
import { NextResponse } from 'next/server';
import { depositForCashier, applyDeposit } from '@/lib/grow/cancelFees';
import { caller } from '../_shared';
import { cancelDeps } from '../_cancel';

export async function GET(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  const appointmentId = new URL(request.url).searchParams.get('appointmentId') || '';
  const deps = cancelDeps();
  if (!appointmentId || !deps) return NextResponse.json({ success: true, deposit: null });
  try {
    return NextResponse.json({ success: true, deposit: await depositForCashier(deps, c.tenantId, appointmentId) });
  } catch (e) {
    console.warn('[grow] deposit lookup failed:', (e as Error)?.message);
    return NextResponse.json({ success: true, deposit: null });
  }
}

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  const b = (await request.json().catch(() => ({}))) as { appointmentId?: unknown; receiptId?: unknown; used?: unknown };
  const appointmentId = String(b.appointmentId ?? '');
  const receiptId = String(b.receiptId ?? '');
  const used = Number(b.used);
  const deps = cancelDeps();
  if (!appointmentId || !receiptId || !(used >= 0) || !deps) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  try {
    await applyDeposit(deps, { tenantId: c.tenantId, appointmentId, receiptId, used });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[grow] applying the deposit failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לרשום את ניכוי המקדמה' }, { status: 500 });
  }
}
