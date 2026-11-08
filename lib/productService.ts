// lib/productService.ts
//
// The server half of products and inventory, with the database injected as a small repo (lib/productRepo.ts is the service-role
// one), so "the save is retried", "a column is missing", "the sale is applied twice" and "a void comes back twice" are proven in
// test-products.ts without a database.
//
// Stock itself never changes here: every move is one call to a database function (add_products_inventory_2026-11-08.sql) that
// locks the product row, checks the move's key and changes the stock in the same transaction.

import { missingColumnName } from './pgError.ts';
import { isMissingProductSchema, OPTIONAL_PRODUCT_COLUMNS, ADJUST_HE, type ProductInput, type ProductRow, type AdjustKind } from './products.ts';

export type DbError = { code?: string; message?: string } | null;
export type ProductRepo = {
  list(tenantId: string): Promise<{ rows: ProductRow[]; error: DbError }>;
  findRecentDuplicate(tenantId: string, name: string, brand: string | null, sinceIso: string): Promise<ProductRow | null>;
  insert(row: Record<string, unknown>): Promise<{ row: ProductRow | null; error: DbError }>;
  update(tenantId: string, id: string, patch: Record<string, unknown>): Promise<{ row: ProductRow | null; error: DbError }>;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbError }>;
};

export type MoveLine = { line_no: number | null; product_id: string | null; result: string; qty: number | null; stock_after: number | null; crossed_low: boolean };

const rowsOf = (data: unknown): Record<string, unknown>[] => (Array.isArray(data) ? data : data ? [data] : []).filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function readMoveLines(data: unknown): MoveLine[] {
  return rowsOf(data).map((r) => ({
    line_no: numOrNull(r.line_no),
    product_id: r.product_id ? String(r.product_id) : null,
    result: String(r.result || ''),
    qty: numOrNull(r.qty),
    stock_after: numOrNull(r.stock_after),
    crossed_low: r.crossed_low === true,
  }));
}

/**
 * Write a product, insert or update. When the database is an older shape and lacks ONE optional column, drop exactly that column
 * and try again (lib/pgError.ts missingColumnName); any other missing column, or one it cannot name, is a failure, never a
 * quieter save. `dropped` names what was not saved, so the screen can say it.
 */
export async function writeProduct(repo: ProductRepo, tenantId: string, id: string | null, input: ProductInput): Promise<
  { status: 'ok'; row: ProductRow; dropped: string[] } | { status: 'missing' } | { status: 'duplicate-sku' } | { status: 'not_found' } | { status: 'error'; error: string }
> {
  const row: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  const dropped: string[] = [];
  for (let attempt = 0; attempt <= OPTIONAL_PRODUCT_COLUMNS.length; attempt++) {
    const res = id ? await repo.update(tenantId, id, row) : await repo.insert({ ...row, tenant_id: tenantId });
    if (!res.error) {
      if (!res.row) return { status: 'not_found' };
      return { status: 'ok', row: res.row, dropped };
    }
    if (isMissingProductSchema(res.error)) return { status: 'missing' };
    if (res.error.code === '23505') return { status: 'duplicate-sku' };
    const col = missingColumnName(res.error);
    if (col && (OPTIONAL_PRODUCT_COLUMNS as readonly string[]).includes(col) && col in row) {
      delete row[col];
      dropped.push(col);
      continue;
    }
    // A required column (name, price, stock...) is missing, or the error does not say which: the table is not what this code
    // expects, so nothing is written rather than a product missing a field she typed.
    if (res.error.code === '42703' || res.error.code === 'PGRST204') return { status: 'missing' };
    return { status: 'error', error: res.error.message || 'save failed' };
  }
  return { status: 'error', error: 'too many missing columns' };
}

/**
 * A new product. A second tap of "save" within a minute with the same name and brand is the same product, not a twin. Opening
 * stock is a ledger move ('received', key open:<product id>), never a column written from the form, so it happens once.
 */
export async function createProduct(repo: ProductRepo, o: { tenantId: string; userId: string | null; input: ProductInput; openingStock: number; now?: number }) {
  const since = new Date((o.now ?? Date.now()) - 60_000).toISOString();
  const twin = await repo.findRecentDuplicate(o.tenantId, o.input.name, o.input.brand, since).catch(() => null);
  if (twin) return { status: 'ok' as const, row: twin, dropped: [] as string[], already: true };
  const w = await writeProduct(repo, o.tenantId, null, o.input);
  if (w.status !== 'ok') return w;
  let row = w.row;
  if (o.openingStock > 0) {
    const m = await repo.rpc('product_stock_move', { p_tenant: o.tenantId, p_product: row.id, p_kind: 'received', p_delta: o.openingStock, p_set: null, p_key: `open:${row.id}`, p_reason: 'מלאי פתיחה', p_by: o.userId });
    const line = rowsOf(m.data)[0];
    if (!m.error && line && (line.result === 'ok' || line.result === 'already')) row = { ...row, stock: Number(line.stock_after) };
    else return { status: 'ok' as const, row, dropped: w.dropped, already: false, stockFailed: true };
  }
  return { status: 'ok' as const, row, dropped: w.dropped, already: false };
}

/** A manual move with its reason. The key comes from the form (one per opened form), so a retried save is the same move. */
export async function adjustStock(repo: ProductRepo, o: { tenantId: string; userId: string | null; productId: string; kind: AdjustKind; qty: number; reason: string; key: string }) {
  const args = {
    p_tenant: o.tenantId, p_product: o.productId, p_kind: o.kind,
    p_delta: o.kind === 'received' ? o.qty : o.kind === 'damaged' ? -o.qty : null,
    p_set: o.kind === 'count' ? o.qty : null,
    p_key: `adj:${o.key}`, p_reason: `${ADJUST_HE[o.kind]}: ${o.reason}`.slice(0, 200), p_by: o.userId,
  };
  const { data, error } = await repo.rpc('product_stock_move', args);
  if (error && isMissingProductSchema(error)) return { status: 'missing' as const };
  if (error) return { status: 'error' as const, error: error.message || 'move failed' };
  const r = rowsOf(data)[0] || {};
  return { status: String(r.result || '') as 'ok' | 'already' | 'not_found' | 'bad_move', stockAfter: numOrNull(r.stock_after), crossedLow: r.crossed_low === true };
}

/**
 * After the till saved a receipt: move stock for ITS product lines (the database reads the receipt; nothing from the browser but
 * its id). `crossed` lists the products this application took to or below her threshold, for one notification each; a retry
 * answers 'already' and crosses nothing, so a retry never notifies twice.
 */
export async function applyReceipt(repo: ProductRepo, o: { tenantId: string; userId: string | null; receiptId: string }) {
  const { data, error } = await repo.rpc('product_stock_apply_receipt', { p_tenant: o.tenantId, p_receipt: o.receiptId, p_by: o.userId });
  if (error && isMissingProductSchema(error)) return { status: 'missing' as const };
  if (error) return { status: 'error' as const, error: error.message || 'apply failed' };
  const lines = readMoveLines(data);
  return { status: 'ok' as const, lines, crossed: lines.filter((l) => l.result === 'ok' && l.crossed_low && l.product_id).map((l) => String(l.product_id)) };
}

/** After a void: every sale line of that receipt goes back once. 'not_voided' when there is no void row (nothing moves). */
export async function restoreReceipt(repo: ProductRepo, o: { tenantId: string; userId: string | null; receiptId: string }) {
  const { data, error } = await repo.rpc('product_stock_restore_receipt', { p_tenant: o.tenantId, p_receipt: o.receiptId, p_by: o.userId });
  if (error && isMissingProductSchema(error)) return { status: 'missing' as const };
  if (error) return { status: 'error' as const, error: error.message || 'restore failed' };
  return { status: 'ok' as const, lines: readMoveLines(data) };
}

/** The low-stock notification text: one per product, in her words. Never sent to a client. */
export function lowStockNote(p: { name: string; stock?: unknown }) {
  const s = Math.round(Number(p.stock) || 0);
  return {
    title: s <= 0 ? `${p.name} אזל מהמלאי` : `מלאי נמוך: ${p.name}`,
    body: s <= 0 ? 'לפי הרישום לא נשארו יחידות. כשמגיע משלוח, עדכני אותו במוצרים ומלאי.' : `נשארו ${s === 1 ? 'יחידה אחת' : `${s} יחידות`}. אולי הזמן להזמין עוד.`,
  };
}
