// app/api/grow/booking-pay/route.ts
//
// POST { t, appointmentId } -> { url }
//
// PUBLIC (no login): the client who just booked on the booking page pays for that visit by credit card. The amount, her name and
// her phone are all read from the appointment on the server, never taken from the browser, so the only thing a caller can do is
// open a Grow payment page for a real, fresh, self-booked appointment of a business whose Grow clearing is on. The payment is an
// ordinary Grow charge tied to the appointment (lib/grow/service.ts createCharge): Grow's callback marks it paid and the receipt is
// created the same way as a cashier charge. Grow's page link is valid for 10 minutes, so each press opens a new one.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { growUiEnabled, resolveGrow } from '@/lib/grow/adapter';
import { createCharge } from '@/lib/grow/service';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { walletAsCreds } from '@/lib/grow/wallet';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { admin } from '../_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only right after booking: an appointment created more than this long ago cannot be paid from the public page. */
const FRESH_MS = 6 * 60 * 60 * 1000;
const UNAVAILABLE = 'התשלום באשראי לא זמין כרגע. אפשר לשלם בעסק.';
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const ipLimited = checkIpLimit(request, 'booking-pay');
  if (ipLimited) return ipLimited;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const t = String(b.t ?? '');
  const appointmentId = String(b.appointmentId ?? '');
  if (!UUID_RE.test(t) || !UUID_RE.test(appointmentId)) return fail(UNAVAILABLE, 400);
  if (!growUiEnabled() || !growUiEnabled(process.env, t)) return fail(UNAVAILABLE, 404);
  const tenantLimited = checkTenantLimit(t, 'booking-pay');
  if (tenantLimited) return tenantLimited;

  const grow = resolveGrow(process.env, APP_URL);
  const creds = grow.creds || walletAsCreds(grow.wallet);
  if (!grow.configured || !creds) return fail(UNAVAILABLE, 409);

  const db = admin();
  const [acc, appt] = await Promise.all([
    db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', t).maybeSingle(),
    db.from('appointments').select('id, name, client_phone, client_id, service, price, self_booked, confirmation_status, created_at').eq('tenant_id', t).eq('id', appointmentId).maybeSingle(),
  ]);
  if (acc.error || !acc.data || acc.data.enabled !== true) return fail(UNAVAILABLE, 409);
  const a = appt.data;
  if (appt.error || !a || a.self_booked !== true) return fail('התור לא נמצא', 404);
  if (a.confirmation_status === 'cancelled') return fail('התור בוטל', 409);
  // A booking held for its deposit is confirmed only by the deposit payment; a full payment here would never release the hold.
  if (a.confirmation_status === 'pending') return fail('התור ממתין למקדמה. העסק ייצור איתך קשר להשלמת התשלום.', 409);
  if (!(Date.now() - new Date(String(a.created_at)).getTime() < FRESH_MS)) return fail('אפשר לשלם על התור בעסק', 409);
  if (!(Number(a.price) > 0)) return fail('לטיפול הזה אין מחיר לתשלום מראש. אפשר לשלם בעסק.', 409);

  // Already paid (a second press after a successful payment): nothing new is opened.
  const paid = await db.from('grow_payments').select('id').eq('tenant_id', t).eq('appointment_id', a.id).eq('status', 'paid').limit(1);
  if (!paid.error && paid.data && paid.data.length > 0) return fail('התור הזה כבר שולם. תודה!', 409);

  const result = await createCharge(
    {
      tenantId: t,
      userId: String(acc.data.user_id),
      amount: Number(a.price),
      description: `תשלום על תור · ${String(a.service || '')}`,
      clientName: String(a.name || ''),
      phone: a.client_phone,
      clientId: a.client_id ? String(a.client_id) : null,
      appointmentId: String(a.id),
      wallet: !!grow.wallet,
      // Back to her booking page: the client has no dashboard.
      returnUrl: `${APP_URL.replace(/\/+$/, '')}/book?t=${t}`,
    },
    { repo: supabaseGrowRepo(db), creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  );
  if (!result.ok) {
    console.error('[grow] booking-pay refused:', result.code, result.message);
    const status = result.code === 'grow-unreachable' || result.code === 'grow-refused' ? 502 : 400;
    return fail(result.code === 'bad-phone' ? 'מספר הטלפון בתור לא מתאים לתשלום באשראי. אפשר לשלם בעסק.' : UNAVAILABLE, status);
  }
  return NextResponse.json({ success: true, url: result.url }, { headers: { 'Cache-Control': 'no-store' } });
}
