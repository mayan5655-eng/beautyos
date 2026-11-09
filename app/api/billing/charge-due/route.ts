// app/api/billing/charge-due/route.ts
//
// Daily cron (vercel.json): charge the subscriptions that are due, retry failed ones on days 1, 3 and 5, close the gate after the 7-day grace
// period, and retry invoices that could not be issued. Protected like every other cron (CRON_SECRET, lib/cronAuth). Does nothing while
// BILLING_UI_ENABLED is off or while no provider is configured, so deploying it changes nothing until billing is switched on.
import { NextResponse } from 'next/server';
import { isAuthorizedCron, cronUnauthorized } from '../../../../lib/cronAuth';
import { markCronRun } from '../../../../lib/cronHeartbeat.js';
import { billingUiEnabled } from '@/lib/billing/adapter';
import { runDue } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { supabaseReferralRepo } from '@/lib/billing/referralRepo';
import { admin, billing } from '../_shared';
import { moneyAlert } from '@/lib/moneyAlert.js';

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('billing-charge-due');
  if (!billingUiEnabled()) return NextResponse.json({ success: true, skipped: 'billing-off' });
  const b = billing();
  if (!b.configured || !b.payments || !b.invoicing) return NextResponse.json({ success: true, skipped: 'not-configured' });
  try {
    // Stop starting new businesses at 240 s, leaving a minute for the last charge and the invoices before the 300 s limit.
    // The referral tables ride along; they are used only with NEXT_PUBLIC_REFERRALS=1 (lib/billing/service.ts billingFlags).
    const db = admin();
    const r = await runDue({ repo: supabaseBillingRepo(db), referrals: supabaseReferralRepo(db), payments: b.payments, invoicing: b.invoicing }, { budgetMs: 240_000 });
    console.log(`[billing] daily run: ${JSON.stringify(r)}`);
    if (r.notStarted) await moneyAlert('billing:run', 'daily billing ran out of time; the rest are charged on the next run', { notStarted: r.notStarted }, { severity: 'warning', key: 'budget' });
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    // add_kalmea_billing.sql has not been run yet: nothing to charge, not an error.
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return NextResponse.json({ success: true, skipped: 'tables-missing' });
    console.error('[billing] daily run threw:', (e as Error)?.message); await moneyAlert('billing:run', 'daily billing run threw', null);
    return NextResponse.json({ success: false, error: 'internal' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
