// app/api/grow/refund/route.ts
//
// POST { paymentId } -> refunds one PAID wallet payment of hers in full, through Grow (refundTransaction), and marks it "refunded".
// Her own tenant only: the payment is looked up by id AND her tenant, so another business's id finds nothing.
// Refused (with a plain sentence) for: a payment that is not paid, a booking deposit or deposit request (its money may already be client
// credit or a cancellation hold; those go through the cancellation flow), and a deployment without the wallet credentials.
// Grow's rules: the whole amount only; the same day it is a cancellation, later a refund; no invoice is issued for a refund.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { createLiveOps } from '@/lib/grow/ops';
import { admin, caller, DEMO_NOTE } from '../_shared';

export const maxDuration = 30;

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const grow = resolveGrow(process.env, APP_URL);
  if (!grow.wallet) return NextResponse.json({ success: false, error: 'החזר כסף דרך Kalmea עוד לא זמין במערכת.' }, { status: 409 });

  const b = (await request.json().catch(() => ({}))) as { paymentId?: unknown };
  const paymentId = typeof b.paymentId === 'string' ? b.paymentId : '';
  if (!/^[0-9a-f-]{32,40}$/i.test(paymentId)) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });

  const db = admin();
  const { data: p } = await db.from('grow_payments').select('id, tenant_id, status, amount, process_id, description, receipt_id, transaction_id, transaction_token').eq('id', paymentId).eq('tenant_id', c.tenantId).maybeSingle();
  if (!p) return NextResponse.json({ success: false, error: 'התשלום לא נמצא' }, { status: 404 });
  if (p.status !== 'paid') return NextResponse.json({ success: false, error: p.status === 'refunded' ? 'התשלום הזה כבר הוחזר' : 'אפשר להחזיר רק תשלום ששולם' }, { status: 409 });
  if (/^מקדמה/.test(String(p.description || ''))) return NextResponse.json({ success: false, error: 'מקדמה לא מחזירים מכאן. אפשר לבטל אותה דרך מדיניות הביטולים.' }, { status: 409 });
  if (!p.process_id) return NextResponse.json({ success: false, error: 'לא מצאנו את התשלום אצל Grow' }, { status: 409 });

  const { data: acc } = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', c.tenantId).maybeSingle();
  const userId = acc ? String((acc as { user_id: unknown }).user_id) : '';
  if (!grow.wallet.userIdOverride && !userId) return NextResponse.json({ success: false, error: 'Grow לא מחוברת בחשבון' }, { status: 409 });

  // The transaction id and token come from Grow's own callback, stored when the payment was recorded (transaction_token: add_grow_wallet.sql).
  const tx = p.transaction_id && p.transaction_token ? { transactionId: String(p.transaction_id), transactionToken: String(p.transaction_token) } : null;
  if (!tx) return NextResponse.json({ success: false, error: 'את התשלום הזה אי אפשר להחזיר מכאן. אפשר להחזיר אותו בלוח הבקרה של Grow.' }, { status: 409 });

  const r = await createLiveOps(grow.wallet).refund({ userId, transactionId: tx.transactionId, transactionToken: tx.transactionToken, amount: Number(p.amount), idempotencyKey: String(p.id) });
  if (!r.ok) {
    console.error('[grow] refund refused for payment', p.id, r.error, r.errId ?? '');
    return NextResponse.json({ success: false, error: 'Grow לא אישרה את ההחזר. אפשר לנסות שוב, או לבצע אותו בלוח הבקרה של Grow.' }, { status: 502 });
  }

  // The money is back with the client. Marking it needs 'refunded' to be an allowed status (add_grow_wallet.sql); until that runs the
  // payment keeps "paid" and carries the note, rather than pretending nothing happened.
  const now = new Date().toISOString();
  let upd = await db.from('grow_payments').update({ status: 'refunded', updated_at: now }).eq('id', p.id).eq('tenant_id', c.tenantId);
  if (upd.error) upd = await db.from('grow_payments').update({ error: 'refunded', updated_at: now }).eq('id', p.id).eq('tenant_id', c.tenantId);
  if (p.receipt_id) await db.from('receipts').update({ note: `הוחזר דרך Grow ב-${now.slice(0, 10)}` }).eq('id', p.receipt_id).eq('tenant_id', c.tenantId);
  console.log('[grow] refunded payment', p.id, 'tenant', c.tenantId);
  return NextResponse.json({ success: true, refundId: r.refundId, markedRefunded: !upd.error });
}
