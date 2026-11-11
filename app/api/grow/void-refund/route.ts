// app/api/grow/void-refund/route.ts
//
// POST { receiptId } -> after she voided a sale in the till that was paid through Grow (receipt_voids already written), give the client's
// money back through Grow's refundTransaction, in full, once. The logic and its rules are in lib/grow/voidRefund.ts.
// Her own business only: the tenant comes from her session (caller()), and the payment is found by receipt id AND that tenant.
// The answer is always 200 with { success, status, message } once she is signed in, so the till shows the Hebrew message as is; the void
// itself is never touched here.
//
// Grow switched off for her business (GROW_UI_ENABLED / GROW_ALLOWED_TENANTS): the answer is still "hidden", but the tenant is resolved
// FIRST (callerTenant), so the refund that was asked for and not sent raises moneyAlert and is written on the receipt
// (lib/grow/refundFollowups.ts recordHiddenVoidRefund). Before, "hidden" came back before anyone knew whose sale it was, and nothing alerted.
//
// GET ?ids=a,b,c -> { states: { receiptId: { state, stuck?, canRetry?, refundedAt? } } }: the refund state of her voided Grow sales for the
// till history (lib/grow/refundFollowups.ts refundStatesFor), derived from grow_payments and the receipt note, her tenant only.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { createLiveOps } from '@/lib/grow/ops';
import { refundVoidedGrowReceipt, supabaseVoidRefundRepo, VOID_REFUND_HE, VOID_REFUND_FAILED_NOTE } from '@/lib/grow/voidRefund';
import { recordHiddenVoidRefund, refundStatesFor, supabaseRefundStatesRepo } from '@/lib/grow/refundFollowups';
import { moneyAlert } from '@/lib/moneyAlert.js';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { admin, caller, callerTenant, DEMO_NOTE } from '../_shared';
import { membershipRefunded } from '../../memberships/_deps';

export const maxDuration = 30;

export async function POST(request: Request) {
  const ipLimited = checkIpLimit(request, 'void-refund');
  if (ipLimited) return ipLimited;
  // Not caller(): it answers "hidden" before the tenant is known, and a refund asked for while Grow is off must still alert.
  const c = await callerTenant();
  if ('error' in c) return c.error;
  const tenantLimited = checkTenantLimit(c.tenantId, 'void-refund');
  if (tenantLimited) return tenantLimited;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, status: 'demo', error: DEMO_NOTE, message: DEMO_NOTE }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { receiptId?: unknown };
  const receiptId = typeof b.receiptId === 'string' ? b.receiptId : '';
  if (!/^[0-9a-f-]{32,40}$/i.test(receiptId)) return NextResponse.json({ success: false, status: 'bad_request', error: 'בקשה לא תקינה' }, { status: 400 });

  const db = admin();
  if (c.hidden) {
    // Grow is off for her business: nothing is sent to Grow, but the operator hears about it and the receipt says it was not done.
    const repo = supabaseVoidRefundRepo(db);
    const hasFailedNote = async (t: string, id: string) => {
      const { data } = await db.from('receipts').select('note').eq('id', id).eq('tenant_id', t).maybeSingle();
      return String((data as { note?: unknown } | null)?.note || '').includes(VOID_REFUND_FAILED_NOTE);
    };
    const h = await recordHiddenVoidRefund({ isVoided: repo.isVoided, appendReceiptNote: repo.appendReceiptNote, hasFailedNote, alert: moneyAlert }, { tenantId: c.tenantId, receiptId }).catch(() => ({ note: null }));
    return NextResponse.json({ success: false, hidden: true, error: 'off', status: 'failed', refunded: false, message: VOID_REFUND_HE.failed(''), note: h.note });
  }
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
    // A client membership's month: its unused credits go with the money. Also on "already refunded", so a missed step is repaired (idempotent).
    if (r.status === 'refunded' || r.status === 'already_refunded') {
      const pay = await supabaseVoidRefundRepo(db).findPaymentByReceipt(c.tenantId, receiptId).catch(() => null);
      if (pay) await membershipRefunded(c.tenantId, String(pay.id));
    }
    return NextResponse.json({ success: r.refunded, ...r });
  } catch (e) {
    await moneyAlert('grow:void-refund', 'refund on void crashed', { tenantId: c.tenantId, receiptId, error: String((e as Error)?.message || e).slice(0, 160) }, { key: `${receiptId}:crash` });
    return NextResponse.json({ success: false, status: 'unknown', refunded: false, message: VOID_REFUND_HE.unknown });
  }
}

export async function GET(request: Request) {
  const ipLimited = checkIpLimit(request, 'void-refund');
  if (ipLimited) return ipLimited;
  const c = await caller();
  if ('error' in c) return c.error;
  const tenantLimited = checkTenantLimit(c.tenantId, 'void-refund');
  if (tenantLimited) return tenantLimited;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: true, states: {} });
  const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean);
  try {
    const states = await refundStatesFor(supabaseRefundStatesRepo(admin()), c.tenantId, ids, new Date());
    return NextResponse.json({ success: true, states });
  } catch {
    return NextResponse.json({ success: false, states: {} });
  }
}
