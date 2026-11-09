// app/api/grow/release-holds/route.ts
//
// Cron (vercel.json, every 5 minutes): a booking in deposit mode is held as pending for 30 minutes. If its deposit was not paid by then it is released
// automatically and the slot frees up (lib/grow/cancelFees.releaseExpiredHolds). Protected like every other cron (CRON_SECRET). The booking route and the
// availability route also release expired holds for their own business the moment they run, so a slot is never shown as taken for longer than it should.
// Does nothing while the Grow screens are off, EXCEPT the stuck-refund check below, which runs either way (a refund claimed before the
// switch went off is still money owed to a client).
//
// Stuck refunds (lib/grow/refundFollowups.ts alertStuckRefunds): at the :00 run of each hour, payments still claimed 'refund_in_progress'
// over an hour after the claim raise moneyAlert('grow:refund-stuck'): an error once when one first crosses the hour, a warning reminder
// once a day while it stays stuck. No new cron and no new service: this job already runs every 5 minutes.
import { NextResponse } from 'next/server';
import { isAuthorizedCron, cronUnauthorized } from '../../../../lib/cronAuth';
import { markCronRun } from '../../../../lib/cronHeartbeat.js';
import { growUiEnabled } from '@/lib/grow/adapter';
import { releaseExpiredHolds } from '@/lib/grow/cancelFees';
import { cancelDeps } from '../_cancel';
import { moneyAlert } from '@/lib/moneyAlert.js';
import { offerFreedHold } from '@/lib/waitlistRuntime';
import { alertStuckRefunds, supabaseStuckRefunds } from '@/lib/grow/refundFollowups';
import { admin } from '../_shared';

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('grow-release-holds');
  const stuckRefunds = await checkStuckRefunds();
  if (!growUiEnabled()) return NextResponse.json({ success: true, skipped: 'grow-off', stuckRefunds });
  const deps = cancelDeps();
  if (!deps) return NextResponse.json({ success: true, skipped: 'not-configured' });
  try {
    // Each released hold is a freed slot: offered to the waiting list (lib/waitlistOffers.js), scheduled after the response.
    const r = await releaseExpiredHolds(deps, undefined, offerFreedHold);
    if (r.released || r.confirmed || r.errors) console.log(`[grow] holds: ${JSON.stringify(r)}`);
    if (r.errors) await moneyAlert('grow:release-holds', 'some deposit holds could not be released', r, { key: 'errors' });
    return NextResponse.json({ success: true, ...r, stuckRefunds });
  } catch (e) {
    // The consent table does not exist yet (add_grow_cancellation.sql not run): nothing to release.
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return NextResponse.json({ success: true, skipped: 'tables-missing' });
    console.error('[grow] hold release failed:', (e as Error)?.message);
    await moneyAlert('grow:release-holds', 'hold release run failed', null, { key: 'run' });
    return NextResponse.json({ success: false, error: 'internal' }, { status: 500 });
  }
}

/** Never throws: a failed check is itself alerted, and the hold release goes on. */
async function checkStuckRefunds() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { scanned: false, stuck: 0, alerted: 0 };
  try {
    return await alertStuckRefunds(supabaseStuckRefunds(admin()), moneyAlert, new Date());
  } catch (e) {
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return { scanned: false, stuck: 0, alerted: 0 };
    await moneyAlert('grow:refund-stuck', 'stuck refund check failed', null, { key: 'run', severity: 'warning' });
    return { scanned: false, stuck: 0, alerted: 0, error: true };
  }
}

export async function GET(request: Request) {
  return POST(request);
}
