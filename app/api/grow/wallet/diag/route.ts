// app/api/grow/wallet/diag/route.ts
//
// POST { t, event, message, code, status, sdkLoaded, sdkEnv, ua, phase } from the payment page /pay/<token> when Grow's wallet did not
// open or did not complete (lib/grow/walletDiag.js). No login, like the page: the token binds the report to its one payment, and an
// unknown token writes nothing. Rate-limited per IP and per payment. Recorded in ops_events at warning (lib/grow/walletDiagServer.ts):
// the payment's id, never the token, a phone or a name.
import { NextResponse } from 'next/server';
import { checkIpLimit, hit, RATE_POLICIES } from '@/lib/rateLimit';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { recordWalletDiag } from '@/lib/grow/walletDiagServer';
import { moneyAlert } from '@/lib/moneyAlert';
import { admin } from '../../_shared';

export const maxDuration = 15;

export async function POST(request: Request) {
  const ipLimited = checkIpLimit(request, 'wallet-diag');
  if (ipLimited) return ipLimited;
  const body = await request.json().catch(() => ({}));
  const repo = supabaseGrowRepo(admin());
  const r = await recordWalletDiag(body, {
    findByToken: (t) => repo.findByToken(t),
    limited: (paymentId) => !hit(`wallet-diag:payment:${paymentId}`, RATE_POLICIES['wallet-diag'].perTenant).ok,
    alert: moneyAlert,
  });
  return NextResponse.json(r.json, { status: r.status });
}
