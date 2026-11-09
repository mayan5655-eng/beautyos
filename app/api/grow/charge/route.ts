// app/api/grow/charge/route.ts
//
// POST { amount, description, clientName, phone, clientId?, appointmentId?, method?, loyalty? } -> { url, paymentId }
// method: card (default) | bit | apple_pay | google_pay, each Grow page code from the environment (lib/grow/methods.ts).
// loyalty: { reward, stampsUsed } when she applied the loyalty card's reward to this visit at the till. It is stored WITH the payment
// (grow_payments.loyalty_redemption), so the server consumes the reward when Grow says the link was paid, however late and whether or
// not her browser is still open (lib/grow/service.ts). Before 2026-11-08 only the browser's onPaid recorded it, so a link paid after
// the till stopped polling left the card "ready" and the same reward could be given again (Vercel security review, PR #20).
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
import { parseLoyaltyIntent } from '@/lib/loyalty';
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
  // The client and the appointment must be HERS: the ids are copied onto the payment and its receipt (and a legal document reads the
  // client by them), so an id from another business is refused rather than trusted (2026-11-02 audit). Absent ids stay allowed.
  const clientId = b.clientId != null && String(b.clientId).trim() ? String(b.clientId).trim() : null;
  const appointmentId = b.appointmentId != null && String(b.appointmentId).trim() ? String(b.appointmentId).trim() : null;
  const [cl, ap] = await Promise.all([
    clientId ? db.from('clients').select('id').eq('tenant_id', c.tenantId).eq('id', clientId).maybeSingle() : Promise.resolve({ data: true, error: null }),
    appointmentId ? db.from('appointments').select('id').eq('tenant_id', c.tenantId).eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: true, error: null }),
  ]);
  if (cl.error || ap.error) return NextResponse.json({ success: false, error: 'שגיאה, נסי שוב' }, { status: 500 });
  if (!cl.data || !ap.data) return NextResponse.json({ success: false, error: 'הלקוחה או התור לא נמצאו' }, { status: 404 });
  // The reward belongs to a client of HERS (checked just above) and nothing else is taken from the browser: the tenant is the caller's,
  // the client is the payment's own. stamps_used must be a whole number from 1 to 100. A malformed reward, or one with no client, is
  // refused rather than dropped: the discount on this link was given for it, so the card must be told.
  let loyalty: { client_id: string; reward: string; stamps_used: number } | null = null;
  if (b.loyalty != null) {
    const intent = parseLoyaltyIntent(b.loyalty);
    if (!intent || !clientId) return NextResponse.json({ success: false, error: 'מתנת הכרטיסייה לא תקינה. הסירי אותה ונסי שוב.' }, { status: 400 });
    loyalty = { client_id: clientId, ...intent };
  }
  const result = await createCharge(
    {
      tenantId: c.tenantId,
      userId: String(acc.data.user_id),
      amount: b.amount,
      description: String(b.description ?? 'טיפול'),
      clientName: String(b.clientName ?? ''),
      phone: b.phone,
      clientId,
      appointmentId,
      method: isPayMethod(b.method) ? b.method : undefined,
      wallet: !!grow.wallet,
      loyalty,
      origin: 'till',
    },
    { repo: supabaseGrowRepo(db), creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  );
  if (!result.ok) {
    const status = result.code === 'bad-amount' || result.code === 'bad-phone' ? 400 : 502;
    return NextResponse.json({ success: false, code: result.code, error: result.message }, { status });
  }
  return NextResponse.json({ success: true, paymentId: result.paymentId, url: result.url });
}
