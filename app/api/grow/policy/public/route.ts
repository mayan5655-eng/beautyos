// app/api/grow/policy/public/route.ts
//
// GET ?t=<tenantId> -> the policy a client sees on the public booking page. PUBLIC (no login) and deliberately never blocked for a business whose
// plan is on hold: public bookings keep working, as already decided for the trial gate. Only what the client needs to agree to is returned.
// Answers { mode: 'off' } for everything else: Grow screens switched off, the business not connected, no policy, a missing table, an unknown id.
// That is exactly today's page.
import { NextResponse } from 'next/server';
import { growUiEnabled } from '@/lib/grow/adapter';
import { sanitizePolicy } from '@/lib/cancellationPolicy';
import { admin } from '../../_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const off = () => NextResponse.json({ mode: 'off' }, { headers: { 'Cache-Control': 'no-store' } });

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
    if (acc.error || row.error || !row.data || !acc.data || acc.data.enabled !== true) return off();
    const p = sanitizePolicy(row.data.policy);
    if (p.mode === 'off') return off();
    return NextResponse.json({ mode: p.mode, text: p.text, windowHours: p.windowHours, lateFee: p.lateFee, noShowFee: p.noShowFee, deposit: p.deposit, timelyCancel: p.timelyCancel }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return off();
  }
}
