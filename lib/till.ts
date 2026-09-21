// lib/till.ts
//
// The arithmetic behind the till, in one place with no React in it, so the
// numbers she reads can be proven: today's total by payment method, a split
// payment that has to add up, a tip that is not revenue, a discount that can
// be a percentage, and a void that removes a receipt from every total without
// touching the row.
//
// ── Voids ──────────────────────────────────────────────────────────────────
// A receipt is never edited and never deleted. Voiding writes a row in
// receipt_voids naming the receipt and a reason; the original stays exactly
// as it was, visible in the list with a "מבוטלת" badge, and every total in
// the product reads through `liveReceipts()` which drops it. The accountant
// has not yet said what the legal shape of a cancellation is; this keeps the
// original intact so whatever that shape turns out to be, it can be produced
// from what is stored.
//
// ── Payments ───────────────────────────────────────────────────────────────
// A receipt paid one way has payment_method and amount, as always. A receipt
// paid two ways carries `payments`: [{method, amount}, ...] that sum to the
// amount, and payment_method = SPLIT_METHOD so the old readers still see a
// string. `paymentsOf` gives every reader the same view of both shapes.
//
// ── Tips ───────────────────────────────────────────────────────────────────
// `tip` is its own column and never part of `amount`. Revenue, the tax tab
// and the per-service figures read amount; the till's day and month cards
// show the tip beside the total, not inside it.

export type PaymentLine = { method: string; amount: number };

export type ReceiptLike = {
  id?: unknown;
  amount?: number | string | null;
  tip?: number | string | null;
  payment_method?: string | null;
  payments?: PaymentLine[] | string | null;
  created_at?: string | null;
  appointment_id?: unknown;
};

export type VoidLike = { receipt_id?: unknown; reason?: string | null; created_at?: string | null };

export const SPLIT_METHOD = 'מפוצל';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The payment lines of a receipt, whichever shape it was stored in. */
export function paymentsOf(r: ReceiptLike): PaymentLine[] {
  let raw = r.payments;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((p) => p && typeof p === 'object' && typeof (p as PaymentLine).method === 'string')
      .map((p) => ({ method: (p as PaymentLine).method, amount: num((p as PaymentLine).amount) }));
  }
  return [{ method: String(r.payment_method || ''), amount: num(r.amount) }];
}

/** True when the receipt was settled by more than one method. */
export function isSplit(r: ReceiptLike): boolean {
  return paymentsOf(r).length > 1;
}

/**
 * Check a split before it is written: every line has a method and a positive
 * amount, no method twice, and the lines sum to the total to the agora.
 */
export function validateSplit(lines: PaymentLine[], total: number): { ok: boolean; error?: string; sum: number } {
  const sum = Math.round(lines.reduce((s, l) => s + num(l.amount), 0) * 100) / 100;
  if (lines.length < 2) return { ok: false, error: 'פיצול צריך לפחות שני אמצעי תשלום', sum };
  if (lines.some((l) => !l.method)) return { ok: false, error: 'בחרי אמצעי תשלום לכל חלק', sum };
  if (lines.some((l) => num(l.amount) <= 0)) return { ok: false, error: 'כל חלק חייב להיות גדול מאפס', sum };
  if (new Set(lines.map((l) => l.method)).size !== lines.length) return { ok: false, error: 'אותו אמצעי תשלום פעמיים', sum };
  if (Math.abs(sum - Math.round(total * 100) / 100) > 0.005) {
    return { ok: false, error: `החלקים מסתכמים ב-₪${sum} ולא ב-₪${total}`, sum };
  }
  return { ok: true, sum };
}

/** The discount in shekels for either mode. Never negative, never above the subtotal. */
export function discountAmount(subtotal: number, mode: 'ils' | 'pct', value: number): number {
  const sub = Math.max(0, num(subtotal));
  const v = Math.max(0, num(value));
  const raw = mode === 'pct' ? (sub * Math.min(100, v)) / 100 : v;
  return Math.min(sub, Math.round(raw * 100) / 100);
}

/** The set of voided receipt ids. */
export function voidedIds(voids: VoidLike[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const v of voids || []) if (v && v.receipt_id != null) out.add(String(v.receipt_id));
  return out;
}

/** The receipts that count: everything not voided. */
export function liveReceipts<T extends ReceiptLike>(receipts: T[], voids: VoidLike[] | null | undefined): T[] {
  const gone = voidedIds(voids);
  if (gone.size === 0) return receipts;
  return receipts.filter((r) => !gone.has(String(r.id)));
}

/** The void row for a receipt, or null. */
export function voidOf(r: ReceiptLike, voids: VoidLike[] | null | undefined): VoidLike | null {
  for (const v of voids || []) if (v && String(v.receipt_id) === String(r.id)) return v;
  return null;
}

export type Totals = {
  total: number;          // sum of amount
  tips: number;           // sum of tip
  collected: number;      // total + tips: what went into the drawer
  count: number;
  byMethod: { method: string; total: number; count: number }[];
};

/**
 * Totals over a set of receipts, by payment method. A split receipt counts
 * once in `count` and contributes each of its lines to its own method.
 */
export function totalsOf(receipts: ReceiptLike[]): Totals {
  const by = new Map<string, { total: number; count: number }>();
  let total = 0, tips = 0;
  for (const r of receipts) {
    total += num(r.amount);
    tips += num(r.tip);
    for (const p of paymentsOf(r)) {
      const cur = by.get(p.method) || { total: 0, count: 0 };
      cur.total += p.amount;
      cur.count += 1;
      by.set(p.method, cur);
    }
  }
  const byMethod = [...by.entries()]
    .map(([method, v]) => ({ method, total: Math.round(v.total * 100) / 100, count: v.count }))
    .sort((a, b) => b.total - a.total);
  return {
    total: Math.round(total * 100) / 100,
    tips: Math.round(tips * 100) / 100,
    collected: Math.round((total + tips) * 100) / 100,
    count: receipts.length,
    byMethod,
  };
}

/**
 * Receipts created in a given local calendar month. `month` is 0-based, as
 * Date.getMonth() gives it. The month total and its per-method breakdown
 * MUST both be computed from this one set - see monthSummary - or the cards
 * under the headline can show a method exceeding the headline, which is what
 * happened when the breakdown ran over every receipt ever.
 */
export function receiptsInMonth<T extends ReceiptLike>(receipts: T[], month: number, year: number): T[] {
  return receipts.filter((r) => {
    if (!r.created_at) return false;
    const d = new Date(r.created_at);
    return !isNaN(d.getTime()) && d.getMonth() === month && d.getFullYear() === year;
  });
}

/**
 * The headline and the breakdown from ONE set, so they cannot disagree:
 * `total` is the sum every method line adds up to.
 */
export function monthSummary(receipts: ReceiptLike[], month: number, year: number): Totals {
  return totalsOf(receiptsInMonth(receipts, month, year));
}

export const OTHER_METHOD = 'אחר';

/**
 * The breakdown as the screen shows it: one row per KNOWN method, in the
 * order given (zeros included, so the list is the same shape every day), plus
 * an "אחר" row for anything else a receipt was ever stamped with - a legacy
 * string, a hand-typed method - so the rows always sum to `totals.total`.
 */
export function bucketByMethod(totals: Totals, known: readonly string[], otherLabel: string = OTHER_METHOD): { method: string; total: number; count: number; known: boolean }[] {
  const rows = known.map((method) => {
    const row = totals.byMethod.find((b) => b.method === method);
    return { method, total: row ? row.total : 0, count: row ? row.count : 0, known: true };
  });
  let otherTotal = 0, otherCount = 0;
  for (const b of totals.byMethod) {
    if (known.includes(b.method)) continue;
    otherTotal += b.total;
    otherCount += b.count;
  }
  if (otherCount > 0) rows.push({ method: otherLabel, total: Math.round(otherTotal * 100) / 100, count: otherCount, known: false });
  return rows;
}

/** Receipts created on a given local YYYY-MM-DD day. */
export function receiptsOnDay<T extends ReceiptLike>(receipts: T[], dayKey: string): T[] {
  return receipts.filter((r) => localDayKey(r.created_at) === dayKey);
}

/** YYYY-MM-DD of an ISO timestamp in the browser's local time (Israel, for her). */
export function localDayKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Does a receipt involve this method, as sole or as one of a split? */
export function paidWith(r: ReceiptLike, method: string): boolean {
  return paymentsOf(r).some((p) => p.method === method);
}
