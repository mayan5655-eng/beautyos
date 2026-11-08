// lib/products.ts
//
// Products and inventory at the till (מוצרים ומלאי). Pure: no React, no database, so every rule below is proven by
// test-products.ts.
//
// ── Where things live ──────────────────────────────────────────────────────
//   automations.feature_flags.products   the platform switch (set by SQL; the settings save never takes feature_flags from the
//                                        browser). Off: no screen, no till picker, no public list, every route answers hidden.
//   products / product_stock_ledger      add_products_inventory_2026-11-08.sql (hand run). Until it runs the screen says so in one
//                                        sentence and the till offers no products.
//
// ── Money ──────────────────────────────────────────────────────────────────
// A product is income AT SALE: it rides on the same receipt as the treatment (or alone), its item marked kind: 'product', and the
// receipt's amount is counted once, like every other payment. The item kind is what lets every reader tell it apart:
//   * lib/loyalty.js NON_VISIT_ITEM_KINDS already reads 'product' as "not a visit": a products-only sale never earns a stamp.
//   * lib/monthlyReport.ts shows product sales as their own line and never lets a product be "the top treatment".
// A discount on a mixed receipt comes off every line in proportion (productShares), so the parts always add up to what she took.
//
// ── Stock ──────────────────────────────────────────────────────────────────
// The browser never writes a stock number. After the till's receipt is saved, a signed-in server route asks the database to apply
// THAT receipt (product_stock_apply_receipt): it reads the receipt's own items, and each product line moves stock once, under a
// key made of the receipt id and the line number. A retry, a double tap, or the safety-net sync replaying it meets the key and
// changes nothing. A void puts each line back once (product_stock_restore_receipt, keyed by the sale row it reverses).
//
// SELLING AT ZERO IS ALLOWED. The till warns (stockWarning) and the sale goes through; stock can go below zero. Her record of
// stock is a count she keeps by hand and is often behind (a delivery not entered yet), while the client and the money are real and
// in front of her. A sale is never refused because of a number on a screen. A negative stock is shown as such and is on her
// attention list until she enters the delivery or a count.

import { tenantFlags } from './featureFlags.ts';

export const PRODUCTS_FLAG = 'products';
export const PRODUCT_ITEM_KIND = 'product';
export const MAX_NAME = 80;
export const MAX_BRAND = 60;
export const MAX_CATEGORY = 40;
export const MAX_SKU = 40;
export const MAX_PRICE = 100000;
export const MAX_QTY_LINE = 999;
export const MAX_ADJUST = 10000;
export const MAX_REASON = 200;
export const DEFAULT_LOW_THRESHOLD = 2;

type SettingsLike = { automations?: unknown; feature_flags?: unknown } | null | undefined;

/** Is the feature switched on for this business by the platform? Only a literal true counts. */
export function productsVisible(settings: SettingsLike): boolean {
  return tenantFlags(settings)[PRODUCTS_FLAG] === true;
}

const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const money2 = (n: number) => Math.round(n * 100) / 100;

// ── The home routine (lib/skinScanView.ts) ────────────────────────────────
// The scan writes free text per routine step ("סרום niacinamide 5%"). She tags each of her products with the step types it fits;
// a step that names a type brings her products of that type. The match is a plain word list, never a guess at a brand.
export const ROUTINE_TYPES = [
  { key: 'cleanser', he: 'ניקוי', re: /ניקוי|מנקה|תרחיץ|סבון|קצף|cleanser|cleansing|micellar|מיסלר/i },
  { key: 'toner', he: 'טונר', re: /טונר|מי פנים|toner|tonic|essence/i },
  { key: 'serum', he: 'סרום', re: /סרום|serum|אמפול/i },
  { key: 'moisturizer', he: 'קרם לחות', re: /לחות|קרם פנים|קרם הזנה|moistur|hydrat|ceramide/i },
  { key: 'spf', he: 'הגנה מהשמש', re: /spf|הגנה מ?השמש|קרם הגנה|מסנן|sunscreen/i },
  { key: 'eye', he: 'קרם עיניים', re: /קרם עיניים|לעיניים|סביב העיניים|eye/i },
  { key: 'exfoliant', he: 'פילינג', re: /פילינג|קילוף|exfol|peel|\bAHA\b|\bBHA\b|glycolic|lactic|salicylic/i },
  { key: 'mask', he: 'מסכה', re: /מסכה|מסיכה|mask/i },
  { key: 'oil', he: 'שמן פנים', re: /שמן|\boil\b|squalane/i },
  { key: 'retinol', he: 'רטינול', re: /רטינול|retin|bakuchiol/i },
  { key: 'vitamin_c', he: 'ויטמין C', re: /ויטמין\s*c|vitamin\s*c|ascorb/i },
] as const;
export type RoutineType = (typeof ROUTINE_TYPES)[number]['key'];
const ROUTINE_KEYS = new Set<string>(ROUTINE_TYPES.map((t) => t.key));

/** The step types a routine step's text names, in the fixed order above. */
export function routineTypesOf(step: unknown): RoutineType[] {
  const s = typeof step === 'string' ? step : '';
  if (!s) return [];
  return ROUTINE_TYPES.filter((t) => t.re.test(s)).map((t) => t.key);
}

export function cleanRoutineTypes(v: unknown): RoutineType[] {
  const list = Array.isArray(v) ? v : [];
  const out: RoutineType[] = [];
  for (const x of list) { const k = String(x || ''); if (ROUTINE_KEYS.has(k) && !out.includes(k as RoutineType)) out.push(k as RoutineType); }
  return out.slice(0, 12);
}

// ── Her catalog ───────────────────────────────────────────────────────────
export type ProductRow = {
  id: string;
  tenant_id?: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  price: number | string;
  cost_price?: number | string | null;
  sku?: string | null;
  stock: number | string;
  low_stock_threshold?: number | string | null;
  routine_types?: string[] | null;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Every column the owner's screen reads. Public pages never get this: they get publicProductView. */
export const PRODUCT_COLS = 'id, tenant_id, name, brand, category, price, cost_price, sku, stock, low_stock_threshold, routine_types, archived_at, created_at, updated_at';
/** The only columns a public route ever selects. No cost, no stock, no threshold, no SKU, no id. */
export const PUBLIC_PRODUCT_COLS = 'name, brand, price, routine_types';
/** Columns a save may degrade without (an older shape of the table): each is dropped ALONE, never as a set. */
export const OPTIONAL_PRODUCT_COLUMNS = ['routine_types', 'category', 'sku', 'cost_price'] as const;

export const isActiveProduct = (p: { archived_at?: unknown } | null | undefined) => !!p && !p.archived_at;
const int = (v: unknown, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
export const stockOf = (p: { stock?: unknown } | null | undefined) => int(p?.stock, 0);
export const thresholdOf = (p: { low_stock_threshold?: unknown } | null | undefined) => Math.max(0, int(p?.low_stock_threshold, 0));
/** Low: at or below her threshold (a threshold of 0 means "tell me when it runs out"). */
export const isLowStock = (p: ProductRow | null | undefined) => !!p && isActiveProduct(p) && stockOf(p) <= thresholdOf(p);

export type ProductInput = { name: string; brand: string | null; category: string | null; price: number; cost_price: number | null; sku: string | null; low_stock_threshold: number; routine_types: RoutineType[] };

/**
 * What she typed, checked. Opening stock is NOT here: a stock number only ever moves through the ledger (a "received" row on
 * creation), so the catalog form cannot overwrite a count the till has been moving.
 */
export function cleanProductInput(b: Record<string, unknown>): { ok: true; value: ProductInput } | { ok: false; error: string } {
  const name = cleanText(b.name, MAX_NAME);
  if (!name) return { ok: false, error: 'כתבי את שם המוצר' };
  const price = money2(Number(b.price));
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) return { ok: false, error: 'מחיר המכירה צריך להיות מספר, למשל 180' };
  let cost: number | null = null;
  if (b.cost_price !== undefined && b.cost_price !== null && String(b.cost_price).trim() !== '') {
    cost = money2(Number(b.cost_price));
    if (!Number.isFinite(cost) || cost < 0 || cost > MAX_PRICE) return { ok: false, error: 'מחיר העלות צריך להיות מספר, או להישאר ריק' };
  }
  const thrRaw = b.low_stock_threshold;
  const thr = thrRaw === undefined || thrRaw === null || String(thrRaw).trim() === '' ? DEFAULT_LOW_THRESHOLD : Math.round(Number(thrRaw));
  if (!Number.isFinite(thr) || thr < 0 || thr > 100000) return { ok: false, error: 'סף המלאי הנמוך צריך להיות מספר שלם, 0 ומעלה' };
  const sku = cleanText(b.sku, MAX_SKU).replace(/\s+/g, '') || null;
  return {
    ok: true,
    value: {
      name,
      brand: cleanText(b.brand, MAX_BRAND) || null,
      category: cleanText(b.category, MAX_CATEGORY) || null,
      price,
      cost_price: cost,
      sku,
      low_stock_threshold: thr,
      routine_types: cleanRoutineTypes(b.routine_types),
    },
  };
}

// ── Manual stock moves (a delivery, damage, a count) ───────────────────────
export const ADJUST_KINDS = ['received', 'damaged', 'count'] as const;
export type AdjustKind = (typeof ADJUST_KINDS)[number];
export const ADJUST_HE: Record<AdjustKind, string> = { received: 'קיבלתי משלוח', damaged: 'פגום או אבד', count: 'ספירת מלאי' };
export const LEDGER_HE: Record<string, string> = { sale: 'נמכר בקופה', void_restore: 'חזר למלאי (תשלום בוטל)', received: 'משלוח', damaged: 'פגום או אבד', count: 'ספירה' };

export function cleanAdjust(b: Record<string, unknown>): { ok: true; kind: AdjustKind; qty: number; reason: string } | { ok: false; error: string } {
  const kind = String(b.kind || '') as AdjustKind;
  if (!ADJUST_KINDS.includes(kind)) return { ok: false, error: 'בחרי מה קרה: משלוח, פגום או ספירה' };
  const qty = Number(b.qty);
  if (!Number.isInteger(qty)) return { ok: false, error: 'כמות צריכה להיות מספר שלם' };
  if (kind === 'count' ? qty < 0 || qty > 1000000 : qty < 1 || qty > MAX_ADJUST) return { ok: false, error: kind === 'count' ? 'כמה יחידות ספרת? 0 ומעלה' : 'כמות בין 1 ל-10,000' };
  const reason = cleanText(b.reason, MAX_REASON);
  if (!reason) return { ok: false, error: 'כתבי בקצרה מה קרה, זה נשמר ביומן המלאי' };
  return { ok: true, kind, qty, reason };
}

// ── At the till ───────────────────────────────────────────────────────────
export type TillItem = { id?: unknown; name?: unknown; price?: unknown; qty?: unknown; kind?: unknown; product_id?: unknown; brand?: unknown; loyalty_reward?: unknown };

/** The receipt item for a product. `kind` and `product_id` are what the stock function and every report read. */
export function productItem(p: ProductRow, qty = 1) {
  return { id: `product-${p.id}-${Date.now().toString(36)}`, name: p.name, brand: p.brand || null, price: money2(Number(p.price) || 0), qty: Math.max(1, Math.min(MAX_QTY_LINE, Math.round(qty))), kind: PRODUCT_ITEM_KIND, product_id: String(p.id) };
}

export const isProductItem = (i: TillItem | null | undefined) => !!i && String(i.kind || '') === PRODUCT_ITEM_KIND;

/** Units of one product across the till's lines (she may have added it twice). */
export function unitsInCart(items: TillItem[] | null | undefined, productId: string): number {
  let n = 0;
  for (const i of items || []) if (isProductItem(i) && String(i.product_id) === String(productId)) n += Math.max(0, int(i.qty, 1));
  return n;
}

/**
 * The warning the till shows next to a product line. Never a refusal: the sale is real (see the header). Null when there is
 * enough on record.
 */
export function stockWarning(p: ProductRow | null | undefined, units: number): string | null {
  if (!p) return null;
  const s = stockOf(p);
  if (s <= 0) return `${p.name}: לפי הרישום אין במלאי. אפשר למכור, והמלאי ירד מתחת לאפס עד שתעדכני משלוח או ספירה.`;
  if (units > s) return `${p.name}: לפי הרישום נשארו ${s === 1 ? 'יחידה אחת' : `${s} יחידות`}. אפשר למכור, והמלאי ירד מתחת לאפס עד שתעדכני.`;
  return null;
}

/** What the server answered for each line, as one sentence for her (or null when all is fine). */
export function saleOutcomeNote(lines: { result?: unknown; stock_after?: unknown; name?: string }[] | null | undefined): string | null {
  const neg = (lines || []).filter((l) => (l.result === 'ok' || l.result === 'already') && Number(l.stock_after) < 0);
  const missing = (lines || []).filter((l) => l.result === 'not_found' || l.result === 'bad_line');
  if (missing.length) return 'התשלום נרשם, אבל מוצר אחד או יותר לא נמצא בקטלוג, אז המלאי שלו לא עודכן.';
  if (neg.length) return `התשלום נרשם. המלאי של ${neg.map((l) => l.name || 'מוצר').join(', ')} ירד מתחת לאפס, כדאי לעדכן משלוח או ספירה.`;
  return null;
}

function itemsOf(r: { items?: unknown } | null | undefined): TillItem[] {
  let raw = r?.items;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  return Array.isArray(raw) ? (raw.filter((i) => i && typeof i === 'object') as TillItem[]) : [];
}

export const hasProductItems = (r: { items?: unknown } | null | undefined) => itemsOf(r).some(isProductItem);

/** True for a receipt whose every line is a product: a sale, not a visit and not a treatment. */
export function isProductOnlyReceipt(r: { items?: unknown } | null | undefined): boolean {
  const items = itemsOf(r).filter((i) => i.loyalty_reward !== true);
  return items.length > 0 && items.every(isProductItem);
}

export type LineShare = { name: string; income: number; kind: string; qty: number; productId: string | null };

/**
 * What each line of a receipt earned, scaled to the receipt's amount (a discount or a voucher comes off every line in
 * proportion), with its kind. The loyalty mark is not a line. A receipt with no readable items has no line shares.
 */
export function lineShares(r: { amount?: unknown; items?: unknown } | null | undefined): LineShare[] {
  const amount = Number(r?.amount) || 0;
  const lines = itemsOf(r)
    .filter((i) => i.loyalty_reward !== true)
    .map((i) => ({ name: String(i.name ?? '').trim(), weight: Math.max(0, (Number(i.price) || 0) * (Number(i.qty) || 1)), kind: String(i.kind || ''), qty: Math.max(1, int(i.qty, 1)), productId: i.product_id ? String(i.product_id) : null }))
    .filter((i) => i.name);
  if (!lines.length || amount <= 0) return lines.map((l) => ({ name: l.name, income: 0, kind: l.kind, qty: l.qty, productId: l.productId }));
  let total = lines.reduce((s, l) => s + l.weight, 0);
  const ws = total > 0 ? lines.map((l) => l.weight) : lines.map(() => 1);
  if (total <= 0) total = lines.length;
  return lines.map((l, i) => ({ name: l.name, income: (amount * ws[i]) / total, kind: l.kind, qty: l.qty, productId: l.productId }));
}

/** The product part of a receipt's amount, and its units. */
export function productShares(r: { amount?: unknown; items?: unknown } | null | undefined): { income: number; units: number } {
  let income = 0, units = 0;
  for (const l of lineShares(r)) if (l.kind === PRODUCT_ITEM_KIND) { income += l.income; units += l.qty; }
  return { income, units };
}

// ── Public pages: display fields of active products, nothing else ──────────
export type PublicProduct = { name: string; brand: string | null; price: number; types: RoutineType[] };

/** The ONLY shape a public page receives. Built field by field, so a new private column can never ride along. */
export function publicProductView(p: Record<string, unknown> | null | undefined): PublicProduct | null {
  if (!p || p.archived_at) return null;
  const name = cleanText(p.name, MAX_NAME);
  if (!name) return null;
  const price = money2(Number(p.price));
  return { name, brand: cleanText(p.brand, MAX_BRAND) || null, price: Number.isFinite(price) && price >= 0 ? price : 0, types: cleanRoutineTypes(p.routine_types) };
}

export type Recommendation = { name: string; brand: string | null; price: number; step: string };

/**
 * Her products for a scan's home routine: for each step in order (morning, then evening), the products she tagged with a type the
 * step names. Each product once, at most `max`. Nothing tagged, nothing shown: never a product she did not choose for this.
 */
export function recommendProducts(routine: { morning?: string[]; evening?: string[] } | null | undefined, products: PublicProduct[] | null | undefined, max = 4): Recommendation[] {
  const steps = [...(routine?.morning || []), ...(routine?.evening || [])];
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    const types = routineTypesOf(step);
    if (!types.length) continue;
    for (const p of products || []) {
      if (!p || out.length >= max) break;
      const key = `${p.name}|${p.brand || ''}`;
      if (seen.has(key)) continue;
      const hit = types.find((t) => p.types.includes(t));
      if (!hit) continue;
      seen.add(key);
      out.push({ name: p.name, brand: p.brand, price: p.price, step: ROUTINE_TYPES.find((t) => t.key === hit)!.he });
    }
    if (out.length >= max) break;
  }
  return out;
}

/** wa.me text for ordering at the business: names the products, no price promise, no online purchase. */
export function orderText(recs: Recommendation[], businessName?: string): string {
  const names = recs.map((r) => (r.brand ? `${r.name} (${r.brand})` : r.name)).join(', ');
  return `היי${businessName ? ` ${businessName}` : ''}, עשיתי סריקת עור ואשמח להזמין או לשמוע עוד על: ${names}`;
}

// ── Before the migration runs ─────────────────────────────────────────────
export function isMissingProductSchema(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(String(e.code || ''))) return true;
  return /product/i.test(String(e.message || '')) && /does not exist|schema cache|could not find/i.test(String(e.message || ''));
}

export const NEEDS_MIGRATION_HE = 'מוצרים ומלאי עוד לא הופעלו אצלך: חסר עדכון אחד במסד הנתונים (kalmea-sql-products.txt). אחרי שירוץ, המסך הזה יעבוד. שום דבר אחר לא השתנה.';

/** The low-stock line for her attention list: one grouped item, keyed so a change brings it back after she dismissed it. */
export function lowStockAttention(products: ProductRow[] | null | undefined): { key: string; count: number; names: string } | null {
  const low = (products || []).filter(isLowStock).sort((a, b) => stockOf(a) - stockOf(b) || String(a.name).localeCompare(String(b.name), 'he'));
  if (!low.length) return null;
  const names = low.slice(0, 3).map((p) => `${p.name} (${stockOf(p)})`).join(', ') + (low.length > 3 ? ` ועוד ${low.length - 3}` : '');
  return { key: `lowstock:${low.map((p) => `${p.id}=${stockOf(p)}`).join(',')}`, count: low.length, names };
}
