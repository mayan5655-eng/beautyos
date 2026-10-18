// app/api/grow/credit/route.ts
//   GET  ?clientId=  -> her unused credit in shekels (from a deposit kept after a timely cancel, or left over after a visit)
//   POST { clientId, amount, receiptId } -> the cashier used that much credit on a receipt: mark it used
import { NextResponse } from 'next/server';
import { caller } from '../_shared';
import { cancelDeps } from '../_cancel';

export async function GET(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  const clientId = new URL(request.url).searchParams.get('clientId') || '';
  const deps = cancelDeps();
  if (!clientId || !deps) return NextResponse.json({ success: true, balance: 0 });
  try {
    return NextResponse.json({ success: true, balance: await deps.repo.creditBalance(c.tenantId, clientId) });
  } catch (e) {
    console.warn('[grow] credit lookup failed:', (e as Error)?.message);
    return NextResponse.json({ success: true, balance: 0 });
  }
}

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  const b = (await request.json().catch(() => ({}))) as { clientId?: unknown; amount?: unknown; receiptId?: unknown };
  const clientId = String(b.clientId ?? '');
  const amount = Number(b.amount);
  const deps = cancelDeps();
  if (!clientId || !(amount > 0) || amount > 20000 || !deps) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  try {
    const used = await deps.repo.useCredit(c.tenantId, clientId, amount, b.receiptId ? String(b.receiptId) : null);
    return NextResponse.json({ success: true, used });
  } catch (e) {
    console.error('[grow] using credit failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לרשום את ניכוי הקרדיט' }, { status: 500 });
  }
}
