// app/api/memberships/run/route.ts
//
// Daily cron (vercel.json): charge the client memberships that are due, once per period (lib/memberships.ts runDueMemberships), retry
// failed ones 1, 3 and 5 days after the first failure, pause after that, and turn a charge cut off mid-way into "check in Grow".
// Protected like every other cron (CRON_SECRET, lib/cronAuth). Does nothing while NEXT_PUBLIC_CLIENT_MEMBERSHIPS is off, while the
// saved-card flows are not configured, or before the migration has run. Businesses whose Grow screens are off, or that are demos, are
// skipped. Each business runs on its own (lib/cronFanout): one slow business never holds up the rest. Sends no client message.
import { NextResponse } from 'next/server';
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth';
import { markCronRun } from '@/lib/cronHeartbeat.js';
import { fanOut } from '@/lib/cronFanout';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';
import { runDueMemberships } from '@/lib/memberships';
import { growUiEnabled } from '@/lib/grow/adapter';
import { isDemoTenantId } from '@/lib/demoTenants';
import { moneyAlert } from '@/lib/moneyAlert.js';
import { membershipDeps } from '../_deps';

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('client-memberships');
  if (!clientMembershipsEnabled()) return NextResponse.json({ success: true, skipped: 'flag-off' });
  const d = membershipDeps();
  if (!d) return NextResponse.json({ success: true, skipped: 'not-configured' });
  try {
    const r = await runDueMemberships(d, {
      skipTenant: (t) => isDemoTenantId(t) || !growUiEnabled(process.env, t),
      forEach: async (items, key, work) => {
        const out = await fanOut(items, work, { keyOf: key, concurrency: 4, budgetMs: 220_000, itemTimeoutMs: 60_000 });
        if (out.summary.notStarted.length || out.summary.timedOut.length) {
          await moneyAlert('memberships:run', 'the daily membership run did not finish every business; the rest are charged on the next run', { notStarted: out.summary.notStarted.length, timedOut: out.summary.timedOut.length }, { severity: 'warning', key: 'budget' });
        }
      },
    });
    console.log(`[memberships] daily run: ${JSON.stringify(r)}`);
    if (r.errors || r.unknown || r.stale) await moneyAlert('memberships:run', 'membership charges need a look (errors, or Grow answers that could not be confirmed)', { errors: r.errors, unknown: r.unknown, stale: r.stale }, { severity: 'warning', key: 'attention' });
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    // add_client_memberships_2026-11-11.sql has not been run yet: nothing to charge, not an error.
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return NextResponse.json({ success: true, skipped: 'tables-missing' });
    console.error('[memberships] daily run threw:', (e as Error)?.message); await moneyAlert('memberships:run', 'daily membership run threw', null);
    return NextResponse.json({ success: false, error: 'internal' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
