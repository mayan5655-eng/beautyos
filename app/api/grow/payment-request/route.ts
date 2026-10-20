// app/api/grow/payment-request/route.ts
//
// POST { clientId, amount, kind: 'full' | 'deposit', method?, note? } -> { paymentId, url, waLink, message }
//
// A payment link for a client, for a deposit or the full amount (lib/grow/paymentRequest.ts). The client's name and phone are read
// from HER client list on the server, never taken from the browser, so a request can only go to her own client. Nothing is sent:
// she presses the WhatsApp link herself. The status turns "paid" through Grow's callback, like any Grow payment.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { createCharge } from '@/lib/grow/service';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { walletAsCreds } from '@/lib/grow/wallet';
import { isPayMethod } from '@/lib/grow/methods';
import { isRequestKind, requestDescription, requestMessageHe, requestWaLink } from '@/lib/grow/paymentRequest';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });

  const grow = resolveGrow(process.env, APP_URL);
  const creds = grow.creds || walletAsCreds(grow.wallet);
  if (!creds) return NextResponse.json({ success: false, code: 'platform-not-connected', error: 'הסליקה דרך Grow עוד לא פעילה במערכת.' }, { status: 409 });

  const db = admin();
  const acc = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', c.tenantId).maybeSingle();
  if (acc.error) {
    if (tableMissing(acc.error)) return NextResponse.json({ success: false, code: 'platform-not-connected', error: 'הסליקה דרך Grow עוד לא פעילה בחשבון' }, { status: 409 });
    return NextResponse.json({ success: false, error: 'שגיאה, נסי שוב' }, { status: 500 });
  }
  if (!acc.data || acc.data.enabled !== true) {
    return NextResponse.json({ success: false, code: 'account-not-connected', error: 'כדי לשלוח בקשת תשלום צריך לחבר ולהפעיל את Grow בהגדרות > חיבורים.' }, { status: 409 });
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isRequestKind(b.kind)) return NextResponse.json({ success: false, error: 'בחרי אם זו מקדמה או תשלום מלא' }, { status: 400 });
  const clientId = String(b.clientId ?? '').trim();
  if (!clientId) return NextResponse.json({ success: false, error: 'בחרי לקוחה' }, { status: 400 });
  const [{ data: client }, { data: st }] = await Promise.all([
    db.from('clients').select('id, name, phone').eq('tenant_id', c.tenantId).eq('id', clientId).maybeSingle(),
    db.from('settings').select('business_name').eq('tenant_id', c.tenantId).maybeSingle(),
  ]);
  if (!client) return NextResponse.json({ success: false, error: 'הלקוחה לא נמצאה' }, { status: 404 });

  const result = await createCharge(
    {
      tenantId: c.tenantId,
      userId: String(acc.data.user_id),
      amount: b.amount,
      description: requestDescription(b.kind, typeof b.note === 'string' ? b.note : null),
      clientName: String(client.name || ''),
      phone: client.phone,
      clientId: String(client.id),
      appointmentId: null,
      kind: b.kind === 'deposit' ? 'deposit' : undefined,
      method: isPayMethod(b.method) ? b.method : undefined,
      wallet: !!grow.wallet,
      // Back to HER booking page, as a booking deposit does: the client has no dashboard.
      returnUrl: `${APP_URL.replace(/\/+$/, '')}/book?t=${c.tenantId}`,
    },
    { repo: supabaseGrowRepo(db), creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  );
  if (!result.ok) {
    const status = result.code === 'bad-amount' || result.code === 'bad-phone' ? 400 : 502;
    return NextResponse.json({ success: false, code: result.code, error: result.message }, { status });
  }
  const amount = Number(b.amount);
  const message = requestMessageHe({ clientName: client.name, businessName: st?.business_name, amount, kind: b.kind, url: result.url });
  return NextResponse.json({ success: true, paymentId: result.paymentId, url: result.url, message, waLink: requestWaLink(client.phone, message) });
}
