// app/api/grow/deposit/pay/route.ts
//
// POST { t, appointmentId } -> { url }
//
// PUBLIC (no login): the client who just booked presses "pay the deposit" on the booking page. Grow's page link lasts about 10 minutes while the
// booking is held for 30, so a link made at booking time could be dead by the time she presses. Each press opens a fresh deposit page for the
// agreement stored with the booking (lib/grow/cancelFees.freshDepositLink): the amount comes from that snapshot, never from the browser, and only
// while the hold is still open.
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { growUiEnabled } from '@/lib/grow/adapter';
import { freshDepositLink } from '@/lib/grow/cancelFees';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { cancelDeps } from '../../_cancel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'התשלום באשראי לא זמין כרגע. העסק ייצור איתך קשר.';
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  // Same policy as paying for the visit: the same client pressing a few times is fine, a stream of presses is not.
  const ipLimited = checkIpLimit(request, 'booking-pay');
  if (ipLimited) return ipLimited;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const t = String(b.t ?? '');
  const appointmentId = String(b.appointmentId ?? '');
  if (!UUID_RE.test(t) || !UUID_RE.test(appointmentId)) return fail(UNAVAILABLE, 400);
  if (!growUiEnabled() || !growUiEnabled(process.env, t)) return fail(UNAVAILABLE, 404);
  const tenantLimited = checkTenantLimit(t, 'booking-pay');
  if (tenantLimited) return tenantLimited;
  const deps = cancelDeps();
  if (!deps) return fail(UNAVAILABLE, 409);
  try {
    const r = await freshDepositLink(deps, { tenantId: t, appointmentId, returnUrl: `${APP_URL.replace(/\/+$/, '')}/book?t=${t}` });
    if (!r.ok) return fail(r.error, r.code === 'step-failed' ? 502 : 409);
    return NextResponse.json({ success: true, url: r.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[grow] deposit pay link failed:', (e as Error)?.message);
    return fail('משהו נתקע, נסי שוב בעוד רגע', 500);
  }
}
