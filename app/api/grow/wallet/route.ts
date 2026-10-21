// app/api/grow/wallet/route.ts
//
// The payment page /pay/<token> (lib/grow/wallet.ts). No login: the client who got the link has none. The token in the link IS the
// authorisation, and it only ever opens THAT one payment.
//   GET  ?t=<token>      -> { state: 'open' | 'paid' | 'closed' | 'expired' | 'unknown', amount, description, businessName }   (no Grow call)
//   POST { t: <token> }  -> { state: 'ready', authCode, sdkEnv, ... }   createPaymentProcess is called now, right before the wallet is drawn
// Answers like the rest of Grow's screens while the feature is off for this business.
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { growUiEnabled, resolveGrow } from '@/lib/grow/adapter';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { startWalletSession, walletLinkState } from '@/lib/grow/wallet';
import { admin } from '../_shared';

export const maxDuration = 30;

const hidden = () => NextResponse.json({ success: false, hidden: true, state: 'unknown' }, { status: 404 });

/** Her business name and her own accent colour (settings.primary_color is HER brand, which this page wears). */
async function brandOf(tenantId: string): Promise<{ businessName: string; accent: string }> {
  const { data } = await admin().from('settings').select('business_name, primary_color').eq('tenant_id', tenantId).maybeSingle();
  const d = (data || {}) as { business_name?: unknown; primary_color?: unknown };
  const color = String(d.primary_color || '');
  return { businessName: String(d.business_name || ''), accent: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '' };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const repo = supabaseGrowRepo(admin());
  const { state, payment } = await walletLinkState(token, { repo });
  if (!payment) return hidden();
  if (!growUiEnabled(process.env, payment.tenant_id)) return hidden();
  return NextResponse.json({ success: true, state, amount: Number(payment.amount), description: payment.description || '', ...(await brandOf(payment.tenant_id)) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { t?: unknown; acceptedTerms?: unknown };
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
  });
  if (!r.ok) return NextResponse.json({ success: false, state: r.code, error: r.message }, { status: r.code === 'grow-unreachable' || r.code === 'grow-refused' ? 502 : 409 });
  return NextResponse.json({ success: true, state: 'ready', authCode: r.authCode, sdkEnv: r.sdkEnv, amount: r.amount, description: r.description });
}
