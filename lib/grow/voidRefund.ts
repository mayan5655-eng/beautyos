// lib/grow/voidRefund.ts
//
// "Also give the money back in Grow" when she voids a sale in the till that was paid through Grow.
//
// Before this, a void in the till (receipt_voids) only took the sale out of HER books: the client's card stayed charged at Grow, and the
// owner had to refund a 1 shekel test by hand in Grow's dashboard. Now the void sheet offers the refund (on by default), and once the void
// is saved the browser asks /api/grow/void-refund to send Grow's refundTransaction for that payment.
//
// Rules, each one a test in test-void-grow-refund.ts:
//   * The void comes FIRST and always stands. This runs only for a receipt that is already voided, and nothing here can undo the void.
//   * Her own business only: the payment is found by receipt id AND her tenant id (the tenant comes from the session, never the browser).
//   * The full amount only (Grow refunds the payment's own amount; no partial refund from here).
//   * Never twice: the same compare-and-set claim as /api/grow/refund (REFUND_CLAIM on a 'paid' row), so a double tap, two devices or the
//     Grow card's own "החזר" button cannot send a second refund. A payment already refunded answers "already" without calling Grow.
//   * An answer we never got (timeout, network) KEEPS the claim: Grow may have refunded, and a retry could refund twice. She is told to
//     check Grow's dashboard. A clear refusal from Grow releases the claim, so a later try from the Grow card is possible.
//   * Every failure raises moneyAlert (ids and codes only) and comes back with Hebrew text that sends her to Grow's dashboard.
//   * Booking deposits are not refunded from here (their money may already be client credit or a cancellation hold); that is the
//     cancellation policy's job, exactly as in /api/grow/refund.
//   * The outcome is recorded: on the payment (status 'refunded', refund_ref, refunded_at) and as a line appended to the receipt's note.
import type { GrowOps } from './ops.ts';

/** Written on the payment while its refund is with Grow. The same value as app/api/grow/refund/route.ts REFUND_CLAIM. */
export const VOID_REFUND_CLAIM = 'refund_in_progress';

export type VoidRefundPayment = {
  id: string;
  tenant_id: string;
  status: string;
  amount: number | string;
  description?: string | null;
  receipt_id?: string | null;
  transaction_id?: string | null;
  transaction_token?: string | null;
  error?: string | null;
  updated_at?: string | null;
  refunded_at?: string | null;
};

export type VoidRefundRepo = {
  /** The Grow payment behind this receipt, in this tenant only, or null. */
  findPaymentByReceipt(tenantId: string, receiptId: string): Promise<VoidRefundPayment | null>;
  /** Whether this receipt of this tenant has a receipt_voids row. */
  isVoided(tenantId: string, receiptId: string): Promise<boolean>;
  /** Compare-and-set: 'paid' and not already claimed -> claimed. 'busy' when another request holds it. */
  claim(tenantId: string, paymentId: string): Promise<'claimed' | 'busy' | 'error'>;
  /** Releases OUR claim only (error still REFUND_CLAIM), putting back what the error column said before. */
  release(tenantId: string, paymentId: string, prior: string | null): Promise<void>;
  /** The money is back: status 'refunded' with Grow's refund reference and time (with fallbacks before the migrations ran). */
  markRefunded(tenantId: string, paymentId: string, refundRef: string, at: string): Promise<void>;
  /** Appends one line to the receipt's note, never replacing what it said. */
  appendReceiptNote(tenantId: string, receiptId: string, line: string): Promise<string | null>;
};

export type VoidRefundDeps = {
  repo: VoidRefundRepo;
  /** Grow's refund call, or null when this deployment has no Grow credentials that can refund. */
  ops: Pick<GrowOps, 'refund'> | null;
  /** Her Grow userId (grow_accounts.user_id), or the sandbox override. Empty when Grow is not connected for her. */
  userId: string;
  alert: (source: string, message: string, details?: Record<string, unknown> | null, opts?: { key?: string; severity?: 'warning' | 'error' }) => Promise<unknown>;
  now?: () => Date;
};

export type VoidRefundStatus = 'refunded' | 'already_refunded' | 'in_progress' | 'not_voided' | 'failed' | 'unknown';
export type VoidRefundResult = {
  status: VoidRefundStatus;
  /** True only when Grow confirmed the refund in THIS call. */
  refunded: boolean;
  /** Hebrew, ready to show her. */
  message: string;
  /** A short English code for logs and tests. */
  reason?: string;
  amount?: number;
  refundId?: string;
  /** The receipt's note after this call, when it was changed. */
  note?: string | null;
};

const DASHBOARD = 'צריך להחזיר את הכסף ללקוחה מלוח הבקרה של Grow.';
export const VOID_REFUND_HE = {
  failed: (why: string) => `התשלום בוטל אצלך, אבל ההחזר ב-Grow לא בוצע${why ? ` (${why})` : ''}. ${DASHBOARD}`,
  unknown: 'התשלום בוטל אצלך, אבל לא קיבלנו תשובה מ-Grow על ההחזר. בדקי בלוח הבקרה של Grow אם הכסף הוחזר, ואם לא, החזירי משם.',
  already: 'התשלום בוטל. הכסף כבר הוחזר ללקוחה ב-Grow קודם, ולא נשלח החזר נוסף.',
  inProgress: 'התשלום בוטל. החזר של התשלום הזה כבר נשלח ל-Grow ועוד לא הסתיים, לכן לא נשלח החזר נוסף. אפשר לבדוק בלוח הבקרה של Grow.',
  notVoided: 'קודם מבטלים את התשלום, ורק אז מחזירים את הכסף.',
  done: (amount: number) => `התשלום בוטל, ו-₪${fmt(amount)} הוחזרו ללקוחה דרך Grow. את מסמך הזיכוי על המסמך של Grow מפיקים בחשבון Grow.`,
};

/** The line written on the receipt when the refund was not done. The till history reads it back to tell "failed" from "void only". */
export const VOID_REFUND_FAILED_NOTE = 'ההחזר דרך Grow לא בוצע';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const isDeposit = (p: VoidRefundPayment) => /^מקדמה/.test(String(p.description || ''));

export async function refundVoidedGrowReceipt(d: VoidRefundDeps, i: { tenantId: string; receiptId: string }): Promise<VoidRefundResult> {
  const { tenantId, receiptId } = i;
  const now = () => (d.now ? d.now() : new Date());
  const fail = async (reason: string, why: string, details: Record<string, unknown> = {}, p?: VoidRefundPayment | null): Promise<VoidRefundResult> => {
    await d.alert('grow:void-refund', `refund on void not done: ${reason}`, { tenantId, receiptId, paymentId: p?.id ?? null, reason, ...details }, { key: `${receiptId}:${reason}` });
    const note = await d.repo.appendReceiptNote(tenantId, receiptId, `${VOID_REFUND_FAILED_NOTE} ב-${now().toISOString().slice(0, 10)}, להחזיר בלוח הבקרה של Grow`).catch(() => null);
    return { status: 'failed', refunded: false, reason, message: VOID_REFUND_HE.failed(why), note };
  };

  if (!(await d.repo.isVoided(tenantId, receiptId))) return { status: 'not_voided', refunded: false, reason: 'not_voided', message: VOID_REFUND_HE.notVoided };

  const p = await d.repo.findPaymentByReceipt(tenantId, receiptId);
  if (!p || String(p.tenant_id) !== String(tenantId)) return fail('no_payment', 'לא מצאנו את התשלום הזה אצל Grow');
  // Before add_grow_wallet.sql a refunded payment keeps 'paid' with error 'refunded' (app/api/grow/refund/route.ts).
  if (p.status === 'refunded' || (p.status === 'paid' && p.error === 'refunded')) return { status: 'already_refunded', refunded: false, reason: 'already', message: VOID_REFUND_HE.already };
  if (p.status === 'paid' && p.error === VOID_REFUND_CLAIM) {
    await d.alert('grow:void-refund', 'refund on void found a refund already in progress', { tenantId, receiptId, paymentId: p.id }, { key: `${p.id}:busy`, severity: 'warning' });
    return { status: 'in_progress', refunded: false, reason: 'busy', message: VOID_REFUND_HE.inProgress };
  }
  if (p.status !== 'paid') return fail('not_paid', 'התשלום לא מסומן כמשולם', { status: p.status }, p);
  if (isDeposit(p)) return fail('deposit', 'מקדמה מחזירים דרך מדיניות הביטולים', {}, p);
  const amount = Number(p.amount);
  if (!(amount > 0)) return fail('bad_amount', 'סכום התשלום לא תקין', {}, p);
  if (!d.ops) return fail('not_configured', 'החזר דרך Kalmea עוד לא זמין במערכת', {}, p);
  if (!d.userId) return fail('no_account', 'Grow לא מחוברת בחשבון', {}, p);
  if (!p.transaction_id || !p.transaction_token) return fail('no_transaction', 'חסרים פרטי העסקה של Grow', {}, p);

  const prior = p.error ?? null; // read before the claim writes over it
  const claimed = await d.repo.claim(tenantId, p.id);
  if (claimed === 'busy') {
    await d.alert('grow:void-refund', 'refund on void lost the claim to another request', { tenantId, receiptId, paymentId: p.id }, { key: `${p.id}:busy`, severity: 'warning' });
    return { status: 'in_progress', refunded: false, reason: 'busy', message: VOID_REFUND_HE.inProgress };
  }
  if (claimed === 'error') return fail('claim_failed', 'לא הצלחנו להתחיל את ההחזר', {}, p);

  let r: Awaited<ReturnType<GrowOps['refund']>>;
  try {
    r = await d.ops.refund({ userId: d.userId, transactionId: String(p.transaction_id), transactionToken: String(p.transaction_token), amount, idempotencyKey: `void:${p.id}` });
  } catch {
    r = { ok: false, code: 'unreachable', error: 'refund call threw' };
  }

  if (!r.ok) {
    if (r.code === 'unreachable' || r.code === 'not-confirmed') {
      // No answer: Grow may have done it. The claim stays, so nothing here can send a second refund; the dashboard settles it.
      await d.alert('grow:void-refund', 'refund on void: no answer from Grow, outcome unknown (claim kept)', { tenantId, receiptId, paymentId: p.id, code: r.code }, { key: `${p.id}:unknown` });
      const note = await d.repo.appendReceiptNote(tenantId, receiptId, `לא התקבלה תשובה מ-Grow על ההחזר ב-${now().toISOString().slice(0, 10)}, לבדוק בלוח הבקרה של Grow`).catch(() => null);
      return { status: 'unknown', refunded: false, reason: 'unknown', message: VOID_REFUND_HE.unknown, note };
    }
    await d.repo.release(tenantId, p.id, prior);
    return fail('declined', 'Grow לא אישרה את ההחזר', { code: r.code, errId: r.errId ?? null }, p);
  }

  const at = now().toISOString();
  await d.repo.markRefunded(tenantId, p.id, r.refundId, at);
  const note = await d.repo.appendReceiptNote(tenantId, receiptId, `₪${fmt(amount)} הוחזרו ללקוחה דרך Grow ב-${at.slice(0, 10)}`).catch(() => null);
  return { status: 'refunded', refunded: true, reason: 'refunded', amount, refundId: r.refundId, message: VOID_REFUND_HE.done(amount), note };
}

/** The Supabase-backed repo (service role; every query carries the tenant). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseVoidRefundRepo(db: any): VoidRefundRepo {
  return {
    async findPaymentByReceipt(tenantId, receiptId) {
      const { data } = await db.from('grow_payments').select('id, tenant_id, status, amount, description, receipt_id, transaction_id, transaction_token, error, updated_at')
        .eq('receipt_id', receiptId).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1);
      return (data && data[0]) || null;
    },
    async isVoided(tenantId, receiptId) {
      const { data } = await db.from('receipt_voids').select('receipt_id').eq('receipt_id', receiptId).eq('tenant_id', tenantId).limit(1);
      return !!(data && data.length);
    },
    async claim(tenantId, paymentId) {
      const res = await db.from('grow_payments').update({ error: VOID_REFUND_CLAIM, updated_at: new Date().toISOString() })
        .eq('id', paymentId).eq('tenant_id', tenantId).eq('status', 'paid').or(`error.is.null,error.neq.${VOID_REFUND_CLAIM}`).select('id');
      if (res.error) return 'error';
      return res.data?.length ? 'claimed' : 'busy';
    },
    async release(tenantId, paymentId, prior) {
      await db.from('grow_payments').update({ error: prior === VOID_REFUND_CLAIM ? null : prior, updated_at: new Date().toISOString() })
        .eq('id', paymentId).eq('tenant_id', tenantId).eq('error', VOID_REFUND_CLAIM);
    },
    async markRefunded(tenantId, paymentId, refundRef, at) {
      // refund_ref / refunded_at: add_grow_cancellation.sql. 'refunded' status: add_grow_wallet.sql. Each fallback keeps the payment from
      // looking unrefunded (error 'refunded' is what the refund routes read as "already refunded" before the status exists).
      const where = (q: any) => q.eq('id', paymentId).eq('tenant_id', tenantId); // eslint-disable-line @typescript-eslint/no-explicit-any
      let u = await where(db.from('grow_payments').update({ status: 'refunded', error: null, refund_ref: refundRef, refunded_at: at, updated_at: at }));
      if (u.error) u = await where(db.from('grow_payments').update({ status: 'refunded', error: null, updated_at: at }));
      if (u.error) u = await where(db.from('grow_payments').update({ error: 'refunded', updated_at: at }));
      if (u.error) console.error('[grow] void refund: could not mark payment refunded', paymentId, u.error.message);
    },
    async appendReceiptNote(tenantId, receiptId, line) {
      const { data: rc } = await db.from('receipts').select('note').eq('id', receiptId).eq('tenant_id', tenantId).maybeSingle();
      const prior = String((rc as { note?: unknown } | null)?.note || '').trim();
      const note = prior ? `${prior} · ${line}` : line;
      const { error } = await db.from('receipts').update({ note }).eq('id', receiptId).eq('tenant_id', tenantId);
      return error ? null : note;
    },
  };
}
