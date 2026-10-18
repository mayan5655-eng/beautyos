// app/api/grow/status/route.ts
//
// GET -> what the Settings card and the cashier need to know, in one call:
//   ui        the Grow screens are switched on for this deployment (GROW_UI_ENABLED); the routes answer 404 otherwise
//   mode      'mock' | 'live' (mock = a test run: nobody is ever charged)
//   platform  { configured, env }   can this deployment charge at all (the missing variable names are NOT sent)
//   account   { connected, enabled, userIdMasked }
//   request   { sent, at }          she asked us to open a Grow account for her
//   payments  her last 20 Grow payments (status, amount, receipt link) - read through her session, so RLS applies
//   tableReady false while add_grow_payments.sql has not been run
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { maskUserId } from '@/lib/grow/payload';
import { admin, caller, tableMissing } from '../_shared';

export async function GET() {
  const c = await caller();
  if ('error' in c) return c.error;
  const grow = resolveGrow(process.env, APP_URL);
  const out = {
    success: true,
    ui: true,
    mode: grow.mode,
    platform: { configured: grow.configured, env: grow.env },
    tableReady: true,
    account: { connected: false, enabled: false, userIdMasked: '' },
    request: { sent: false, at: null as string | null },
    payments: [] as unknown[],
  };
  const acc = await c.session.from('grow_accounts').select('user_id, enabled').eq('tenant_id', c.tenantId).maybeSingle();
  if (acc.error) {
    if (tableMissing(acc.error)) return NextResponse.json({ ...out, tableReady: false });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את מצב Grow' }, { status: 500 });
  }
  if (acc.data) out.account = { connected: true, enabled: acc.data.enabled === true, userIdMasked: maskUserId(String(acc.data.user_id)) };
  // The request table is server-only (it holds her phone and business id): read with the service role, for her own tenant only.
  const rq = await admin().from('grow_signup_requests').select('created_at').eq('tenant_id', c.tenantId).maybeSingle();
  if (!rq.error && rq.data) out.request = { sent: true, at: String(rq.data.created_at) };
  const pay = await c.session
    .from('grow_payments')
    .select('id, status, amount, client_name, description, invoice_url, receipt_id, paid_at, created_at')
    .eq('tenant_id', c.tenantId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!pay.error) out.payments = pay.data || [];
  return NextResponse.json(out);
}
