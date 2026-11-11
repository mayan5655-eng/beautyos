'use client';
// app/ProductsTill.jsx
//
// Products at the till, next to treatments (lib/products.ts). Two small pieces for the cashier sheet in app/beautyos.jsx:
//   ProductTillPicker    "+ הוסיפי מוצר": her active products with what is on record. Adds a line marked kind: 'product'.
//   ProductTillWarnings  one line per product in the sale that has less on record than she is selling. A warning, never a block:
//                        a real sale goes through and stock may go below zero (lib/products.ts explains why).
// Both render nothing unless the products are loaded (the flag is on and the migration has run).
import { iso, productItem, isActiveProduct, stockOf, stockWarning, unitsInCart, isProductItem } from '@/lib/products';
import { tr, uiDir } from "@/lib/i18n/tr";

export function ProductTillPicker({ api, onAdd, pc, pcTint }) {
  if (!api?.visible || api.status !== 'ready') return null;
  const list = (api.products || []).filter(isActiveProduct);
  if (!list.length) return null;
  return (
    <select data-testid="till-add-product" aria-label={tr("הוספת מוצר")} onChange={(e) => { const p = list.find((x) => String(x.id) === e.target.value); if (p) onAdd(productItem(p, 1)); e.target.value = ''; }}
      style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '5px 9px', minHeight: 44, marginBottom: 8, fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: uiDir(), background: pcTint, color: pc, maxWidth: '48%' }}>
      <option value="">{tr("+ הוסיפי מוצר")}</option>
      {list.map((p) => {
        const s = stockOf(p);
        return <option key={p.id} value={p.id}>{`${iso(p.name)}${p.brand ? ` (${iso(p.brand)})` : ''} · ₪${Number(p.price)} · ${s <= 0 ? 'אין במלאי' : `במלאי ${s}`}`}</option>;
      })}
    </select>
  );
}

export function ProductTillWarnings({ api, items }) {
  if (!api?.visible || api.status !== 'ready') return null;
  const ids = [...new Set((items || []).filter(isProductItem).map((i) => String(i.product_id)))];
  const notes = ids.map((id) => stockWarning((api.products || []).find((p) => String(p.id) === id), unitsInCart(items, id))).filter(Boolean);
  if (!notes.length) return null;
  return (
    <div data-testid="till-stock-warning" role="status" style={{ background: 'var(--k-petal, #FBEDE9)', border: '1px solid var(--k-pink, #E9A9A1)', borderRadius: 'var(--r-sm)', padding: '9px 11px', marginBottom: 10 }}>
      {notes.map((n) => <p key={n} style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', margin: '2px 0', lineHeight: 1.5 }}>{n}</p>)}
    </div>
  );
}
