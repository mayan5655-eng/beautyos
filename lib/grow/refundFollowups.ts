// lib/grow/refundFollowups.ts
//
// What happens AFTER "also give the money back in Grow" (lib/grow/voidRefund.ts), so a refund never goes quiet:
//
//   1. The refund state of each voided Grow sale, for the till history: "הוחזר ב-Grow" / "ההחזר בתהליך" / "ההחזר נכשל". Derived from what
//      is already stored, no migration: grow_payments (status 'refunded', refund_ref, refunded_at, and the 'refund_in_progress' claim the
//      refund routes write in the error column), joined by receipt id AND tenant, plus the line voidRefund writes on the receipt's note
//      when the refund was not done (VOID_REFUND_FAILED_NOTE). That line is what tells "failed" apart from "she voided only in her books".
//   2. Stuck refunds: a payment still claimed 'refund_in_progress' an hour after the claim means Grow never answered (the claim is kept
//      on purpose so nothing can refund twice). Nobody would ever see it, so the ops cron raises moneyAlert('grow:refund-stuck').
//   3. A refund asked for while the Grow screens are off for her business (GROW_UI_ENABLED / GROW_ALLOWED_TENANTS) used to answer
//      "hidden" with no alert: the void stood, the money stayed with the client's card, and only the toast knew. Now it alerts once the
//      tenant is known and writes the same "not done" line on the receipt.
//
// Every query carries the tenant; nothing here calls Grow.
import { VOID_REFUND_CLAIM, VOID_REFUND_FAILED_NOTE } from './voidRefund.ts';
import type { VoidRefundPayment } from './voidRefund.ts';

/** How long a refund may sit in 'refund_in_progress' before it counts as stuck. */
export const REFUND_STUCK_MS = 60 * 60 * 1000;

export type RefundState = 'refunded' | 'in_progress' | 'failed' | 'void_only';
export type RefundStateRow = {
  state: RefundState;
  /** In progress for over REFUND_STUCK_MS. */
  stuck?: boolean;
  /** Whether "לנסות שוב" may be offered (the same route, the same idempotency). Never for a deposit or a payment we cannot find. */
  canRetry?: boolean;
  refundedAt?: string | null;
};

/** Hebrew for the till history. No em dashes. */
export const REFUND_STATE_HE: Record<RefundState, string> = {
  refunded: 'הוחזר ב-Grow',
  in_progress: 'ההחזר בתהליך',
  failed: 'ההחזר נכשל, להחזיר בלוח הבקרה של Grow',
  void_only: 'בוטל רק ברישום, הכסף נשאר ב-Grow',
};
export const REFUND_STUCK_HE = 'ההחזר בתהליך כבר יותר משעה. כדאי לבדוק בלוח הבקרה של Grow אם הכסף הוחזר.';

const isDeposit = (p: Pick<VoidRefundPayment, 'description'>) => /^מקדמה/.test(String(p.description || ''));
const ms = (t: unknown) => { const v = Date.parse(String(t || '')); return Number.isFinite(v) ? v : NaN; };

/**
 * The refund state of ONE voided receipt. `p` is its Grow payment (same tenant) or null; `note` is the receipt's note.
 * Null when there is nothing to say (not a Grow sale we know of, and no "not done" line).
 */
export function refundStateOf(p: VoidRefundPayment | null, note: string | null | undefined, now: Date): RefundStateRow | null {
  const failedNoted = String(note || '').includes(VOID_REFUND_FAILED_NOTE);
  if (!p) return failedNoted ? { state: 'failed', canRetry: false } : null;
  // Before add_grow_wallet.sql a refunded payment keeps 'paid' with error 'refunded'.
  if (p.status === 'refunded' || (p.status === 'paid' && p.error === 'refunded')) return { state: 'refunded', refundedAt: p.refunded_at ?? null };
  if (p.status === 'paid' && p.error === VOID_REFUND_CLAIM) {
    const since = ms(p.updated_at);
    return { state: 'in_progress', stuck: Number.isFinite(since) && now.getTime() - since > REFUND_STUCK_MS };
  }
  if (failedNoted) return { state: 'failed', canRetry: p.status === 'paid' && !isDeposit(p) };
  if (p.status === 'paid') return { state: 'void_only' };
  return null;
}

/** The till's own view right after POST /api/grow/void-refund answered, until the next GET (the void's GET may run before the POST ends). */
export function stateFromVoidRefundAnswer(a: { status?: string; refunded?: boolean; hidden?: boolean; reason?: string } | null | undefined): RefundStateRow {
  if (a && (a.refunded || a.status === 'refunded' || a.status === 'already_refunded')) return { state: 'refunded' };
  if (a && (a.status === 'in_progress' || a.status === 'unknown')) return { state: 'in_progress' };
  // A deposit is refunded through the cancellation policy, and with Grow off a retry answers the same: no retry button for either.
  return { state: 'failed', canRetry: !!a && !a.hidden && a.reason !== 'deposit' && a.reason !== 'no_payment' };
}

export type RefundStatesRepo = {
  /** Of these receipt ids, the ones this tenant voided. */
  voidedOf(tenantId: string, receiptIds: string[]): Promise<string[]>;
  /** The Grow payments behind these receipts, this tenant only (newest first). */
  paymentsOf(tenantId: string, receiptIds: string[]): Promise<VoidRefundPayment[]>;
  /** id -> note, this tenant only. */
  notesOf(tenantId: string, receiptIds: string[]): Promise<Record<string, string | null>>;
};

export const RECEIPT_ID_RE = /^[0-9a-f-]{32,40}$/i;
export const MAX_STATE_IDS = 100;

/** receiptId -> state, for the voided receipts among `receiptIds` (bad ids dropped, at most MAX_STATE_IDS). */
export async function refundStatesFor(repo: RefundStatesRepo, tenantId: string, receiptIds: string[], now: Date): Promise<Record<string, RefundStateRow>> {
  const ids = [...new Set(receiptIds.filter((x) => typeof x === 'string' && RECEIPT_ID_RE.test(x)))].slice(0, MAX_STATE_IDS);
  if (!tenantId || !ids.length) return {};
  const voided = await repo.voidedOf(tenantId, ids);
  if (!voided.length) return {};
  const [payments, notes] = await Promise.all([repo.paymentsOf(tenantId, voided), repo.notesOf(tenantId, voided)]);
  const out: Record<string, RefundStateRow> = {};
  for (const id of voided) {
    // Newest first, as voidRefund's findPaymentByReceipt; another tenant's row can never count.
    const p = payments.find((x) => String(x.receipt_id) === id && String(x.tenant_id) === String(tenantId)) || null;
    const s = refundStateOf(p, notes[id], now);
    if (s) out[id] = s;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseRefundStatesRepo(db: any): RefundStatesRepo {
  return {
    async voidedOf(tenantId, receiptIds) {
      const { data, error } = await db.from('receipt_voids').select('receipt_id').eq('tenant_id', tenantId).in('receipt_id', receiptIds);
      // A read error is never "nothing voided" or "no payment": it throws, and the route answers no states (no line beats a wrong one).
      if (error) throw new Error(`voidedOf: ${error.message || 'failed'}`);
      return [...new Set(((data || []) as { receipt_id: unknown }[]).map((r) => String(r.receipt_id)))];
    },
    async paymentsOf(tenantId, receiptIds) {
      // refunded_at arrives with add_grow_cancellation.sql; without it the read is retried without that column.
      const cols = 'id, tenant_id, status, amount, description, receipt_id, error, updated_at';
      let r = await db.from('grow_payments').select(`${cols}, refunded_at`).eq('tenant_id', tenantId).in('receipt_id', receiptIds).order('created_at', { ascending: false });
      if (r.error) r = await db.from('grow_payments').select(cols).eq('tenant_id', tenantId).in('receipt_id', receiptIds).order('created_at', { ascending: false });
      if (r.error) throw new Error(`paymentsOf: ${r.error.message || 'failed'}`);
      return r.data || [];
    },
    async notesOf(tenantId, receiptIds) {
      const { data, error } = await db.from('receipts').select('id, note').eq('tenant_id', tenantId).in('id', receiptIds);
      if (error) throw new Error(`notesOf: ${error.message || 'failed'}`);
      const out: Record<string, string | null> = {};
      for (const r of (data || []) as { id: unknown; note: unknown }[]) out[String(r.id)] = r.note == null ? null : String(r.note);
      return out;
    },
  };
}

// ── 2. Stuck refunds ──────────────────────────────────────────────────────────

export type StuckRefund = { id: string; tenant_id: string; receipt_id?: string | null; updated_at?: string | null };
type Alert = (source: string, message: string, details?: Record<string, unknown> | null, opts?: { key?: string; severity?: 'warning' | 'error' }) => Promise<unknown>;

/**
 * Raised from the 5-minute Grow ops cron (/api/grow/release-holds), at most once an hour:
 *   * a refund that crossed the one-hour mark within the last hour: 'error' (pushed to the operator's phone), once;
 *   * every refund still stuck, once a day (the 06:00 UTC run): a 'warning' reminder in the admin panel, so a missed run never
 *     leaves one unseen and a stuck refund does not push every hour.
 * Returns what it found, for the cron's JSON.
 */
export async function alertStuckRefunds(
  load: (olderThanIso: string) => Promise<StuckRefund[]>,
  alert: Alert,
  now: Date,
): Promise<{ scanned: boolean; stuck: number; alerted: number }> {
  if (now.getUTCMinutes() >= 5) return { scanned: false, stuck: 0, alerted: 0 };
  const cutoff = now.getTime() - REFUND_STUCK_MS;
  const rows = await load(new Date(cutoff).toISOString());
  const daily = now.getUTCHours() === 6;
  let alerted = 0;
  for (const r of rows) {
    const since = ms(r.updated_at);
    // Crossed the hour since the last hourly scan (with 5 minutes of slack for when in the :00-:04 window each scan ran).
    const fresh = Number.isFinite(since) && since > cutoff - REFUND_STUCK_MS - 5 * 60 * 1000;
    if (!fresh && !daily) continue;
    const ageMin = Number.isFinite(since) ? Math.round((now.getTime() - since) / 60000) : null;
    await alert('grow:refund-stuck', fresh ? 'refund stuck in progress for over an hour (no answer from Grow)' : 'refund still stuck in progress (daily reminder)',
      { tenantId: r.tenant_id, paymentId: r.id, receiptId: r.receipt_id ?? null, ageMin },
      { key: `${r.id}:${fresh ? 'first' : now.toISOString().slice(0, 10)}`, severity: fresh ? 'error' : 'warning' });
    alerted++;
  }
  return { scanned: true, stuck: rows.length, alerted };
}

/** Every tenant's payments still claimed 'refund_in_progress' since before `olderThanIso` (service role, ops only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseStuckRefunds(db: any) {
  return async (olderThanIso: string): Promise<StuckRefund[]> => {
    const { data, error } = await db.from('grow_payments').select('id, tenant_id, receipt_id, updated_at')
      .eq('status', 'paid').eq('error', VOID_REFUND_CLAIM).lt('updated_at', olderThanIso).order('updated_at', { ascending: true }).limit(200);
    if (error) throw new Error(error.message || 'stuck refunds read failed');
    return (data || []) as StuckRefund[];
  };
}

// ── 3. A refund asked for while Grow is off for her business ─────────────────

export type HiddenRefundDeps = {
  isVoided(tenantId: string, receiptId: string): Promise<boolean>;
  appendReceiptNote(tenantId: string, receiptId: string, line: string): Promise<string | null>;
  alert: Alert;
  now?: () => Date;
};

/** The till asked for the refund but Grow is switched off for this tenant: alert, and record it on the receipt (her own, voided). */
export async function recordHiddenVoidRefund(d: HiddenRefundDeps, i: { tenantId: string; receiptId: string }): Promise<{ note: string | null }> {
  const { tenantId, receiptId } = i;
  const voided = await d.isVoided(tenantId, receiptId).catch(() => false);
  await d.alert('grow:void-refund', 'refund on void asked while Grow is off for this business (hidden), not sent', { tenantId, receiptId, reason: 'hidden', voided }, { key: `${receiptId}:hidden` });
  if (!voided) return { note: null };
  const day = (d.now ? d.now() : new Date()).toISOString().slice(0, 10);
  const note = await d.appendReceiptNote(tenantId, receiptId, `${VOID_REFUND_FAILED_NOTE} ב-${day}, להחזיר בלוח הבקרה של Grow`).catch(() => null);
  return { note };
}
