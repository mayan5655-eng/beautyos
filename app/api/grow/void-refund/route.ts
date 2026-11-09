// app/api/grow/void-refund/route.ts
//
// POST { receiptId } -> after she voided a sale in the till that was paid through Grow (receipt_voids already written), give the client's
// money back through Grow's refundTransaction, in full, once. The logic and its rules are in lib/grow/voidRefund.ts.
// Her own business only: the tenant comes from her session (caller()), and the payment is found by receipt id AND that tenant.
// The answer is always 200 with { success, status, message } once she is signed in, so the till shows the Hebrew message as is; the void
// itself is never touched here.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { createLiveOps } from '@/lib/grow/ops';
import { refundVoidedGrowReceipt, supabaseVoidRefundRepo, VOID_REFUND_HE } from '@/lib/grow/voidRefund';
import { moneyAlert } from '@/lib/moneyAlert.js';
import { admin, caller, DEMO_NOTE } from '../_shared';

export const maxDuration = 30;

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, status: 'demo', error: DEMO_NOTE, message: DEMO_NOTE }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { receiptId?: unknown };
  const receiptId = typeof b.receiptId === 'string' ? b.receiptId : '';
  if (!/^[0-9a-f-]{32,40}$/i.test(receiptId)) return NextResponse.json({ success: false, status: 'bad_request', error: 'בקשה לא תקינה' }, { status: 400 });

  const db = admin();
  const grow = resolveGrow(process.env, APP_URL);
  // The refund call: the in-memory mock locally, or the live wallet credentials (the account the till's payments open on), else the
  // saved-card credentials. Without either, the lib answers "not configured" and alerts.
  const liveCreds = grow.wallet || grow.tokenCreds || null;
  const ops = grow.mode === 'mock' ? (grow.configured ? grow.ops || null : null) : liveCreds ? createLiveOps(liveCreds) : null;
  const { data: acc } = await db.from('grow_accounts').select('user_id').eq('tenant_id', c.tenantId).maybeSingle();
  const accountUser = acc ? String((acc as { user_id: unknown }).user_id || '') : '';
  const userId = (liveCreds && 'userIdOverride' in liveCreds && liveCreds.userIdOverride) || accountUser || (grow.mode === 'mock' ? 'mock-user' : '');

  try {
    const r = await refundVoidedGrowReceipt({ repo: supabaseVoidRefundRepo(db), ops, userId, alert: moneyAlert }, { tenantId: c.tenantId, receiptId });
    if (r.refunded) console.log('[grow] refunded on void: receipt', receiptId, 'tenant', c.tenantId);
    return NextResponse.json({ success: r.refunded, ...r });
  } catch (e) {
    await moneyAlert('grow:void-refund', 'refund on void crashed', { tenantId: c.tenantId, receiptId, error: String((e as Error)?.message || e).slice(0, 160) }, { key: `${receiptId}:crash` });
    return NextResponse.json({ success: false, status: 'unknown', refunded: false, message: VOID_REFUND_HE.unknown });
  }
}
