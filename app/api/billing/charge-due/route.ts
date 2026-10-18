// app/api/billing/charge-due/route.ts
//
// Daily cron (vercel.json): charge the subscriptions that are due, retry failed ones on days 1, 3 and 5, close the gate after the 7-day grace
// period, and retry invoices that could not be issued. Protected like every other cron (CRON_SECRET, lib/cronAuth). Does nothing while
// BILLING_UI_ENABLED is off or while no provider is configured, so deploying it changes nothing until billing is switched on.
import { NextResponse } from 'next/server';
import { isAuthorizedCron, cronUnauthorized } from '../../../../lib/cronAuth';
import { billingUiEnabled } from '@/lib/billing/adapter';
import { runDue } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { admin, billing } from '../_shared';

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  if (!billingUiEnabled()) return NextResponse.json({ success: true, skipped: 'billing-off' });
  const b = billing();
  if (!b.configured || !b.payments || !b.invoicing) return NextResponse.json({ success: true, skipped: 'not-configured' });
  try {
    const r = await runDue({ repo: supabaseBillingRepo(admin()), payments: b.payments, invoicing: b.invoicing });
    console.log(`[billing] daily run: ${JSON.stringify(r)}`);
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    // add_kalmea_billing.sql has not been run yet: nothing to charge, not an error.
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return NextResponse.json({ success: true, skipped: 'tables-missing' });
    console.error('[billing] daily run threw:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'internal' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
