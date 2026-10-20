// app/api/grow/charge/route.ts
//
// POST { amount, description, clientName, phone, clientId?, appointmentId?, method? } -> { url, paymentId }
// method: card (default) | bit | apple_pay | google_pay, each Grow page code from the environment (lib/grow/methods.ts).
//
// She asks, from the cashier, for a card payment page for a client. This does NOT charge anyone: it asks Grow
// for a payment page on HER Grow account and returns the link; the client pays there. Refused, with a plain
// sentence, when the platform keys are not configured, when she has not connected and enabled Grow, and for the
// demo business. Nothing here sends a message: she opens or shares the link herself.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { createCharge } from '@/lib/grow/service';
import { isPayMethod } from '@/lib/grow/methods';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { walletAsCreds } from '@/lib/grow/wallet';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });

  const grow = resolveGrow(process.env, APP_URL);
  const creds = grow.creds || walletAsCreds(grow.wallet);
  if (!creds) return NextResponse.json({ success: false, code: 'platform-not-connected', error: 'הסליקה בכרטיס אשראי עוד לא פעילה במערכת. נעדכן כשהיא זמינה.' }, { status: 409 });

  const db = admin();
  const acc = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', c.tenantId).maybeSingle();
  if (acc.error) {
    if (tableMissing(acc.error)) return NextResponse.json({ success: false, code: 'platform-not-connected', error: 'הסליקה בכרטיס אשראי עוד לא פעילה בחשבון' }, { status: 409 });
    return NextResponse.json({ success: false, error: 'שגיאה, נסי שוב' }, { status: 500 });
  }
  if (!acc.data || acc.data.enabled !== true) {
    return NextResponse.json({ success: false, code: 'account-not-connected', error: 'כדי לחייב בכרטיס אשראי צריך לחבר ולהפעיל את Grow בהגדרות > חיבורים.' }, { status: 409 });
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createCharge(
    {
      tenantId: c.tenantId,
      userId: String(acc.data.user_id),
      amount: b.amount,
      description: String(b.description ?? 'טיפול'),
      clientName: String(b.clientName ?? ''),
      phone: b.phone,
      clientId: b.clientId != null ? String(b.clientId) : null,
      appointmentId: b.appointmentId != null ? String(b.appointmentId) : null,
      method: isPayMethod(b.method) ? b.method : undefined,
      wallet: !!grow.wallet,
    },
    { repo: supabaseGrowRepo(db), creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  );
  if (!result.ok) {
    const status = result.code === 'bad-amount' || result.code === 'bad-phone' ? 400 : 502;
    return NextResponse.json({ success: false, code: result.code, error: result.message }, { status });
  }
  return NextResponse.json({ success: true, paymentId: result.paymentId, url: result.url });
}
