// app/api/grow/status/route.ts
//
// GET -> what the Settings card and the cashier need to know, in one call:
//   platform  { configured, env }   can this deployment charge at all (the missing variable names are NOT sent)
//   account   { connected, enabled, userIdMasked }
//   payments  her last 20 Grow payments (status, amount, receipt link) - read through her session, so RLS applies
//   tableReady false while add_grow_payments.sql has not been run
import { NextResponse } from 'next/server';
import { growPlatformStatus } from '@/lib/grow/config';
import { maskUserId } from '@/lib/grow/payload';
import { caller, tableMissing } from '../_shared';

export async function GET() {
  const c = await caller();
  if ('error' in c) return c.error;
  const platform = growPlatformStatus();
  const out = {
    success: true,
    platform: { configured: platform.configured, env: platform.env },
    tableReady: true,
    account: { connected: false, enabled: false, userIdMasked: '' },
    payments: [] as unknown[],
  };
  const acc = await c.session.from('grow_accounts').select('user_id, enabled').eq('tenant_id', c.tenantId).maybeSingle();
  if (acc.error) {
    if (tableMissing(acc.error)) return NextResponse.json({ ...out, tableReady: false });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את מצב Grow' }, { status: 500 });
  }
  if (acc.data) out.account = { connected: true, enabled: acc.data.enabled === true, userIdMasked: maskUserId(String(acc.data.user_id)) };
  const pay = await c.session
    .from('grow_payments')
    .select('id, status, amount, client_name, description, invoice_url, receipt_id, paid_at, created_at')
    .eq('tenant_id', c.tenantId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!pay.error) out.payments = pay.data || [];
  return NextResponse.json(out);
}
