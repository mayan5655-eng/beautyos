// app/api/grow/release-holds/route.ts
//
// Cron (vercel.json, every 5 minutes): a booking in deposit mode is held as pending for 30 minutes. If its deposit was not paid by then it is released
// automatically and the slot frees up (lib/grow/cancelFees.releaseExpiredHolds). Protected like every other cron (CRON_SECRET). The booking route and the
// availability route also release expired holds for their own business the moment they run, so a slot is never shown as taken for longer than it should.
// Does nothing while the Grow screens are off.
import { NextResponse } from 'next/server';
import { isAuthorizedCron, cronUnauthorized } from '../../../../lib/cronAuth';
import { markCronRun } from '../../../../lib/cronHeartbeat.js';
import { growUiEnabled } from '@/lib/grow/adapter';
import { releaseExpiredHolds } from '@/lib/grow/cancelFees';
import { cancelDeps } from '../_cancel';

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('grow-release-holds');
  if (!growUiEnabled()) return NextResponse.json({ success: true, skipped: 'grow-off' });
  const deps = cancelDeps();
  if (!deps) return NextResponse.json({ success: true, skipped: 'not-configured' });
  try {
    const r = await releaseExpiredHolds(deps);
    if (r.released || r.confirmed) console.log(`[grow] holds: ${JSON.stringify(r)}`);
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    // The consent table does not exist yet (add_grow_cancellation.sql not run): nothing to release.
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return NextResponse.json({ success: true, skipped: 'tables-missing' });
    console.error('[grow] hold release failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'internal' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
