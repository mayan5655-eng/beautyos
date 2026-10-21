// app/api/grow/policy/public/route.ts
//
// GET ?t=<tenantId> -> the policy a client sees on the public booking page. PUBLIC (no login) and deliberately never blocked for a business whose
// plan is on hold: public bookings keep working, as already decided for the trial gate. Only what the client needs to agree to is returned.
// Answers { mode: 'off' } for everything else: Grow screens switched off, the business not connected, no policy, a missing table, an unknown id.
// That is exactly today's page.
// card: true is added whenever her Grow clearing is on and this deployment can charge, policy or not, so the booking page can tell
// the client she may pay by credit card.
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { growUiEnabled, resolveGrow } from '@/lib/grow/adapter';
import { sanitizePolicy } from '@/lib/cancellationPolicy';
import { admin } from '../../_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const answer = (body: Record<string, unknown>) => NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
const off = () => answer({ mode: 'off' });

export async function GET(request: Request) {
  if (!growUiEnabled()) return off();
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!UUID_RE.test(t) || !growUiEnabled(process.env, t)) return off();
  try {
    const db = admin();
    const [acc, row] = await Promise.all([
      db.from('grow_accounts').select('enabled').eq('tenant_id', t).maybeSingle(),
      db.from('grow_cancel_policies').select('policy').eq('tenant_id', t).maybeSingle(),
    ]);
    if (acc.error || !acc.data || acc.data.enabled !== true) return off();
    const card = resolveGrow(process.env, APP_URL).configured;
    const p = row.error || !row.data ? null : sanitizePolicy(row.data.policy);
    if (!p || p.mode === 'off') return card ? answer({ mode: 'off', card }) : off();
    return answer({ mode: p.mode, text: p.text, windowHours: p.windowHours, lateFee: p.lateFee, noShowFee: p.noShowFee, deposit: p.deposit, timelyCancel: p.timelyCancel, card });
  } catch {
    return off();
  }
}
