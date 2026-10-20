// app/api/grow/status/route.ts
//
// GET -> what the Settings card and the cashier need to know, in one call:
//   ui        the Grow screens are switched on for this deployment (GROW_UI_ENABLED); the routes answer 404 otherwise
//   mode      'mock' | 'live' (mock = a test run: nobody is ever charged)
//   platform  { configured, env }   can this deployment charge at all (the missing variable names are NOT sent)
//   account   { connected, enabled, userIdMasked }
//   request   { sent, at }          she asked us to open a Grow account for her (the older, manual way)
//   registration { status, message, url, at } | null   her own Grow registration link (lib/grow/registration.ts)
//   methods   ['card', 'bit', ...]  the ways a client can pay on this deployment (lib/grow/methods.ts)
//   registrationAvailable           the registration link can be opened here (live when GROW_REGISTER_API_KEY_TEST/_LIVE is set, else the mock)
//   registrationFrame               the one Grow origin whose form may be shown inside the card, or null (then: SMS / new tab)
//   payments  her last 20 Grow payments (status, amount, receipt link) - read through her session, so RLS applies
//   tableReady false while add_grow_payments.sql has not been run
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { maskUserId } from '@/lib/grow/payload';
import { availableMethods } from '@/lib/grow/methods';
import { registrationOps } from '@/lib/grow/registration';
import { growRegisterFrameOrigin } from '@/lib/securityHeaders';
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
    registration: null as null | { status: string; message: string | null; url: string | null; at: string | null },
    wallet: !!grow.wallet,
    methods: grow.wallet ? ['wallet'] : availableMethods(grow.creds?.pageCodes || (grow.creds ? { card: grow.creds.pageCode } : {})),
    registrationAvailable: !!registrationOps(process.env, grow.mode, grow.configured, APP_URL),
    // Grow's form may be shown inside the card only where the CSP lets that one Grow origin be framed (lib/securityHeaders.ts).
    registrationFrame: growRegisterFrameOrigin(process.env),
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
  // Her registration link, while it is open (server-only table; the status columns come from add_grow_cashier.sql).
  let reg = await admin().from('grow_onboarding_pending').select('status, status_message, link_url, updated_at, created_at, consumed_at').eq('tenant_id', c.tenantId).maybeSingle();
  if (reg.error && /column|schema cache|42703|PGRST204/i.test(`${reg.error.code} ${reg.error.message}`)) {
    reg = await admin().from('grow_onboarding_pending').select('created_at, consumed_at').eq('tenant_id', c.tenantId).maybeSingle() as typeof reg;
  }
  if (!reg.error && reg.data) {
    const d = reg.data as Record<string, unknown>;
    const status = d.consumed_at ? 'approved' : String(d.status || 'waiting');
    out.registration = { status, message: d.status_message ? String(d.status_message) : null, url: status === 'waiting' && d.link_url ? String(d.link_url) : null, at: String(d.updated_at || d.created_at || '') || null };
  }
  const COLS = 'id, status, amount, client_name, description, invoice_url, receipt_id, paid_at, created_at';
  const read = (cols: string) => c.session.from('grow_payments').select(cols).eq('tenant_id', c.tenantId).order('created_at', { ascending: false }).limit(20);
  // kind (charge / deposit / fee) is a column of add_grow_cancellation.sql: without it the list still loads.
  let pay = await read(`${COLS}, kind`);
  if (pay.error) pay = await read(COLS);
  if (!pay.error) out.payments = pay.data || [];
  return NextResponse.json(out);
}
