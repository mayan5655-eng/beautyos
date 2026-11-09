// lib/productReport.ts
//
// The short products view (מוצרים: החודש): what product sales brought in this month, the top sellers, and what is low.
// Pure, tested in test-products.ts.
//
// ONE WAY TO COUNT. Revenue comes from her receipts, voided ones left out (lib/till liveReceipts), each product line's share of
// the receipt amount (lib/products.ts productShares), so it is the same money the income screen and the monthly report count,
// never a second formula over the stock ledger. The month is Israel time (lib/monthlyReport.ts israelDay). The figure is gross,
// what she took; the monthly report sentence shows it net of VAT for a dealer who charges it.

import { liveReceipts } from './till.ts';
import { israelDay } from './monthlyReport.ts';
import { lineShares, isLowStock, stockOf, thresholdOf, PRODUCT_ITEM_KIND, type ProductRow } from './products.ts';

export type ProductsMonth = {
  income: number;
  units: number;
  receipts: number;
  top: { name: string; units: number; income: number }[];
  low: { id: string; name: string; stock: number; threshold: number }[];
};

export function productsMonth(input: {
  receipts: { id?: unknown; created_at?: unknown; amount?: unknown; items?: unknown }[];
  voids?: { receipt_id?: unknown; credit_status?: unknown }[] | null;
  products?: ProductRow[] | null;
  now?: Date;
  topN?: number;
}): ProductsMonth {
  const today = israelDay(input.now || new Date());
  const live = liveReceipts(input.receipts as never[], (input.voids || []) as never[]) as typeof input.receipts;
  const names = new Map<string, string>();
  for (const p of input.products || []) names.set(String(p.id), p.name);
  const by = new Map<string, { name: string; units: number; income: number }>();
  let income = 0, units = 0, count = 0;
  for (const r of live) {
    const d = israelDay(r.created_at as string);
    if (!d || !today || d.year !== today.year || d.month !== today.month) continue;
    let any = false;
    for (const l of lineShares(r)) {
      if (l.kind !== PRODUCT_ITEM_KIND) continue;
      any = true;
      income += l.income; units += l.qty;
      // One row per product id (a renamed product is still one product); its current name when she still has it.
      const key = l.productId || `name:${l.name}`;
      const cur = by.get(key) || { name: (l.productId && names.get(l.productId)) || l.name, units: 0, income: 0 };
      cur.units += l.qty; cur.income += l.income;
      by.set(key, cur);
    }
    if (any) count++;
  }
  const top = [...by.values()]
    .sort((a, b) => b.units - a.units || b.income - a.income || a.name.localeCompare(b.name, 'he'))
    .slice(0, input.topN ?? 5)
    .map((t) => ({ name: t.name, units: t.units, income: Math.round(t.income) }));
  const low = (input.products || []).filter(isLowStock)
    .sort((a, b) => stockOf(a) - stockOf(b))
    .map((p) => ({ id: String(p.id), name: p.name, stock: stockOf(p), threshold: thresholdOf(p) }));
  return { income: Math.round(income), units, receipts: count, top, low };
}
