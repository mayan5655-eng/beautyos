// app/api/grow/wallet/route.ts
//
// The payment page /pay/<token> (lib/grow/wallet.ts). No login: the client who got the link has none. The token in the link IS the
// authorisation, and it only ever opens THAT one payment.
//   GET  ?t=<token>      -> { state: 'open' | 'paid' | 'closed' | 'expired' | 'unknown', amount, description, businessName, context }   (no Grow call)
//   POST { t: <token>, inApp? }  -> { state: 'ready', authCode, sdkEnv, hostedUrl, limited, ... }   createPaymentProcess is called now, right before the wallet is drawn
// inApp (GROW_INAPP_WALLET=1 only): the page says it runs in an in-app browser; exactly the boolean true opens the wallet with card and
// Bit only (lib/grow/wallet.ts inAppLimitFor). GET answers inAppWallet so the page knows the flag before the tap.
// context (lib/grow/wallet.ts payContextOf): for a booking deposit or a visit paid from the booking page, the service, date and time and
// the way back to her booking page; for a gift voucher, the way to the voucher. A booking deposit whose 30-minute hold ran out reads
// 'expired' and is never opened at Grow (lib/grow/cancelFees.ts depositHoldOpen).
// Answers like the rest of Grow's screens while the feature is off for this business.
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { growUiEnabled, resolveGrow } from '@/lib/grow/adapter';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { startWalletSession, walletLinkState, inAppLimitFor, inAppWalletEnabled, payContextOf, isBookingDeposit, DEPOSIT_HOLD_OVER_HE } from '@/lib/grow/wallet';
import type { GrowPayment } from '@/lib/grow/service';
import { depositHoldOpen } from '@/lib/grow/cancelFees';
import type { ConsentRow } from '@/lib/grow/cancelFees';
import { VOUCHER_SERVICE_PREFIX } from '@/lib/giftVouchers';
import { admin } from '../_shared';
import { reportWalletSession } from '@/lib/grow/walletDiagServer';
import { moneyAlert } from '@/lib/moneyAlert';
import { langOfSettings, type Lang } from '@/lib/i18n/core';

export const maxDuration = 30;

const hidden = () => NextResponse.json({ success: false, hidden: true, state: 'unknown' }, { status: 404 });

/** Her business name and her own accent colour (settings.primary_color is HER brand, which this page wears). */
async function brandOf(tenantId: string): Promise<{ businessName: string; accent: string; language: Lang }> {
  const { data } = await admin().from('settings').select('business_name, primary_color, branding').eq('tenant_id', tenantId).maybeSingle();
  const d = (data || {}) as { business_name?: unknown; primary_color?: unknown };
  const color = String(d.primary_color || '');
  // language: the business's (lib/i18n), so the payment page speaks it.
  return { businessName: String(d.business_name || ''), accent: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '', language: langOfSettings(data) };
}

/** A booking deposit's hold, read from its consent. A read error counts as closed: no money is taken for a slot we cannot vouch for. */
async function holdOpenFor(p: GrowPayment): Promise<boolean> {
  if (!p.appointment_id) return false;
  const { data, error } = await admin().from('appointment_policy_consents').select('mode, status, hold_expires_at')
    .eq('tenant_id', p.tenant_id).eq('appointment_id', p.appointment_id).maybeSingle();
  if (error) { console.error('[grow] wallet: deposit hold read failed:', error.message); return false; }
  return depositHoldOpen(data as Pick<ConsentRow, 'mode' | 'status' | 'hold_expires_at'> | null, new Date());
}

/** What the page shows the payment is for. Each read is best effort: without it the page is the plain one it always was. */
async function contextOf(p: GrowPayment) {
  const db = admin();
  let appt: Record<string, unknown> | null = null;
  let voucherToken: string | null = null;
  if (p.appointment_id) {
    const { data } = await db.from('appointments').select('service, date, start_minute, hour').eq('tenant_id', p.tenant_id).eq('id', p.appointment_id).maybeSingle();
    appt = (data as Record<string, unknown> | null) || null;
  } else if (String(p.description || '').startsWith(VOUCHER_SERVICE_PREFIX)) {
    // gift_voucher is a newer column (add_gift_vouchers_2026-11-08.sql): read on its own, so a database without it still shows the page.
    const { data, error } = await db.from('grow_payments').select('gift_voucher').eq('id', p.id).maybeSingle();
    const gv = !error && data ? (data as { gift_voucher?: { token?: unknown } | null }).gift_voucher : null;
    voucherToken = gv && typeof gv.token === 'string' ? gv.token : null;
  }
  return payContextOf(p, { appUrl: APP_URL, appt, voucherToken });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const repo = supabaseGrowRepo(admin());
  const found = await walletLinkState(token, { repo });
  const payment = found.payment;
  if (!payment) return hidden();
  if (!growUiEnabled(process.env, payment.tenant_id)) return hidden();
  let state = found.state;
  let note = '';
  if (state === 'open' && isBookingDeposit(payment) && !(await holdOpenFor(payment))) { state = 'expired'; note = DEPOSIT_HOLD_OVER_HE; }
  const [brand, context] = await Promise.all([brandOf(payment.tenant_id), contextOf(payment).catch(() => null)]);
  return NextResponse.json({ success: true, state, note, amount: Number(payment.amount), description: payment.description || '', ...brand, inAppWallet: inAppWalletEnabled(process.env), context });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { t?: unknown; acceptedTerms?: unknown; inApp?: unknown };
  const token = typeof body.t === 'string' ? body.t : '';
  // The terms tick on the payment page (Grow's site check) is required here too, before Grow is asked for anything.
  if (body.acceptedTerms !== true) return NextResponse.json({ success: false, state: 'terms-required', error: 'כדי להמשיך לתשלום צריך לסמן את האישור.' }, { status: 400 });
  const grow = resolveGrow(process.env, APP_URL);
  if (!grow.wallet) return NextResponse.json({ success: false, state: 'closed', error: 'התשלום הזה עוד לא זמין.' }, { status: 409 });
  const db = admin();
  const repo = supabaseGrowRepo(db);
  const found = await walletLinkState(token, { repo });
  if (!found.payment || !growUiEnabled(process.env, found.payment.tenant_id)) return hidden();

  const r = await startWalletSession(token, {
    repo,
    creds: grow.wallet,
    appUrl: APP_URL,
    userIdFor: async (tenantId) => {
      const { data } = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', tenantId).maybeSingle();
      return data && (data as { enabled?: unknown }).enabled === true ? String((data as { user_id: unknown }).user_id) : null;
    },
    holdOpen: holdOpenFor,
    // A hint from the page, never trusted beyond this: only removes methods, only with the flag on, only for exactly `true`.
    cardAndBitOnly: inAppLimitFor(process.env, body.inApp),
    // What Grow answered (flags and its error only) into ops_events at warning: the owner reads it with SQL (docs/GROW_SETUP.md).
    report: (rep) => reportWalletSession(rep, moneyAlert),
  });
  if (!r.ok) return NextResponse.json({ success: false, state: r.code, error: r.message }, { status: r.code === 'grow-unreachable' || r.code === 'grow-refused' ? 502 : 409 });
  return NextResponse.json({ success: true, state: 'ready', authCode: r.authCode, sdkEnv: r.sdkEnv, hostedUrl: r.hostedUrl, limited: r.limited, amount: r.amount, description: r.description });
}
