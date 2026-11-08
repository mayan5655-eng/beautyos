// Products and inventory (lib/products.ts, lib/productService.ts, lib/productPublic.ts, lib/productReport.ts, the routes and the
// migration). Fake repos and a fake Supabase reader: nothing here reaches a database, WhatsApp or push. The stock arithmetic itself
// lives in Postgres (product_stock_move and the functions built on it); the migration's text is checked here, and its behaviour
// (double apply, concurrent same key, void restore once, negative stock, cross-tenant refusal, grants) was run against a throwaway
// local Postgres 16 while building it. Covers: atomic decrement and its idempotency, void restore once, negative stock allowed with
// a warning, no loyalty stamp for a products-only sale, the monthly report separating products, public pages exposing no cost or
// stock, the honest degrade before the migration runs, and plan gating.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  productsVisible, productsAllowed, productsConfig, productsStored, sanitizeProductAutomations, DEFAULT_LOW_THRESHOLD, cleanProductInput, cleanAdjust, productItem, isProductItem, isProductOnlyReceipt, hasProductItems, productShares,
  lineShares, stockWarning, saleOutcomeNote, unitsInCart, publicProductView, recommendProducts, routineTypesOf, orderText, isLowStock,
  lowStockAttention, isMissingProductSchema, NEEDS_MIGRATION_HE, PUBLIC_PRODUCT_COLS, PRODUCT_COLS, PRODUCT_ITEM_KIND, ROUTINE_TYPES,
  type ProductRow,
} from './lib/products.ts';
import { writeProduct, createProduct, adjustStock, applyReceipt, restoreReceipt, readMoveLines, lowStockNote, type ProductRepo } from './lib/productService.ts';
import { loadPublicProducts } from './lib/productPublic.ts';
import { productsMonth } from './lib/productReport.ts';
import { monthlyReport, topTreatment, treatmentShares } from './lib/monthlyReport.ts';
import { isStampReceipt } from './lib/loyalty.js';
import { tenantFlags } from './lib/featureFlags.ts';
import { AUTOMATIONS_PROTECTED_KEYS } from './lib/settingsColumns.ts';
import { REFERENCED_TABLES } from './lib/referencedTables.js';
import { RATE_POLICIES } from './lib/rateLimit.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const T = '11111111-2222-4333-8444-555555555555';
const PID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const PID2 = 'aaaaaaaa-0000-4000-8000-00000000000b';
const on = { automations: { feature_flags: { products: true } } };
const prod = (o: Partial<ProductRow> = {}): ProductRow => ({ id: PID, name: 'קרם לחות', brand: 'Lumi', price: 180, cost_price: 70, sku: '729001', stock: 5, low_stock_threshold: 2, routine_types: ['moisturizer'], archived_at: null, ...o });
const SQL = rd('supabase/migrations/add_products_inventory_2026-11-08.sql');
const ROUTE = rd('app/api/products/route.ts');
const PUBLIC_ROUTE = rd('app/api/products/public/route.ts');

// ── the flag ────────────────────────────────────────────────────────────────
await ok('on by default for every business; only an explicit false (platform or hers) hides it', () => {
  assert.equal(productsVisible(null), true, 'no settings at all: on');
  assert.equal(productsVisible({ automations: {} }), true, 'nothing stored: on');
  assert.equal(productsVisible({ automations: { feature_flags: { products: 'false' } } }), true, 'only a real false is an off switch');
  assert.equal(productsVisible(on), true);
  assert.equal(productsVisible({ automations: { feature_flags: { products: false } } }), false, 'the platform switched it off');
  assert.equal(productsAllowed({ automations: { feature_flags: { products: false } } }), false);
  assert.equal(productsVisible({ feature_flags: { products: false } }), false, 'the dedicated column wins too');
  // Her own switch: off hides the screens, but the platform still allows it (Settings can switch it back on).
  const hersOff = { automations: { products: { enabled: false } } };
  assert.equal(productsVisible(hersOff), false);
  assert.equal(productsAllowed(hersOff), true);
  assert.equal(productsVisible({ automations: { products: { enabled: true }, feature_flags: { products: false } } }), false, 'her on cannot override the platform off');
});
await ok('her settings: on by default, the default threshold, clamps and junk, and the save validates them', () => {
  assert.deepEqual(productsConfig(null), { enabled: true, lowStockThreshold: DEFAULT_LOW_THRESHOLD });
  assert.deepEqual(productsConfig({ automations: { products: { enabled: false, low_stock_threshold: '5' } } }), { enabled: false, lowStockThreshold: 5 });
  assert.equal(productsConfig({ automations: { products: { low_stock_threshold: -3 } } }).lowStockThreshold, DEFAULT_LOW_THRESHOLD);
  assert.equal(productsConfig({ automations: { products: { low_stock_threshold: 'x' } } }).lowStockThreshold, DEFAULT_LOW_THRESHOLD);
  assert.equal(productsConfig({ automations: { products: { low_stock_threshold: 0 } } }).lowStockThreshold, 0, '0 is a real choice');
  assert.deepEqual(productsStored({ enabled: false, lowStockThreshold: 4 }), { enabled: false, low_stock_threshold: 4 });
  const saved = sanitizeProductAutomations({ business_name: 'x', automations: { other: 1, products: { enabled: 'nope', low_stock_threshold: 99999, evil: '<script>' } } });
  assert.deepEqual((saved.automations as Record<string, unknown>).products, { enabled: true, low_stock_threshold: DEFAULT_LOW_THRESHOLD });
  assert.equal((saved.automations as Record<string, unknown>).other, 1, 'other keys untouched');
  const untouched = { automations: { x: 1 } };
  assert.equal(sanitizeProductAutomations(untouched), untouched);
  // Her switch is NOT a protected key: the settings save writes it, through the validator.
  assert.ok(!(AUTOMATIONS_PROTECTED_KEYS as readonly string[]).includes('products'));
  const save = rd('app/api/settings/save/route.ts');
  assert.match(save, /const productsClean = sanitizeProductAutomations\(vouchersClean\);/);
  assert.match(save, /preserveProtectedAutomations\(productsClean/);
  // A new product starts with her default threshold.
  const c = cleanProductInput({ name: 'קרם', price: 10 }, 7);
  assert.ok(c.ok && c.value.low_stock_threshold === 7);
  const settingsUi = rd('app/ProductSettings.jsx');
  assert.match(settingsUi, /מוצרים ומלאי בקופה/);
  assert.match(settingsUi, /products: productsStored/);
  assert.ok(!/feature_flags/.test(settingsUi.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), 'never writes the platform key');
  assert.match(rd('app/beautyos.jsx'), /<ProductSettings api=\{productsApi\}/);
});
await ok('the flag lives under feature_flags, which the settings save never takes from the browser', () => {
  assert.ok((AUTOMATIONS_PROTECTED_KEYS as readonly string[]).includes('feature_flags'));
  assert.equal(tenantFlags(on).products, true);
});

// ── her catalog ─────────────────────────────────────────────────────────────
await ok('product input: required name and price, optional cost, clamps and junk', () => {
  assert.equal(cleanProductInput({ name: '  ', price: 10 }).ok, false);
  assert.equal(cleanProductInput({ name: 'קרם', price: 'abc' }).ok, false);
  assert.equal(cleanProductInput({ name: 'קרם', price: -1 }).ok, false);
  assert.equal(cleanProductInput({ name: 'קרם', price: 10, cost_price: 'x' }).ok, false);
  const c = cleanProductInput({ name: ' קרם\n לחות ', brand: '', price: '180.456', cost_price: '', sku: ' 72 90 ', routine_types: ['serum', 'serum', 'nope', 'spf'], stock: 999 });
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.value.name, 'קרם לחות');
  assert.equal(c.value.brand, null);
  assert.equal(c.value.price, 180.46);
  assert.equal(c.value.cost_price, null);
  assert.equal(c.value.sku, '7290');
  assert.equal(c.value.low_stock_threshold, 2, 'the default threshold');
  assert.deepEqual(c.value.routine_types, ['serum', 'spf']);
  assert.ok(!('stock' in c.value), 'a stock number never comes from the catalog form');
});
await ok('manual adjustment needs a kind, a whole quantity and a reason', () => {
  assert.equal(cleanAdjust({ kind: 'stolen', qty: 1, reason: 'x' }).ok, false);
  assert.equal(cleanAdjust({ kind: 'received', qty: 1.5, reason: 'x' }).ok, false);
  assert.equal(cleanAdjust({ kind: 'received', qty: 0, reason: 'x' }).ok, false);
  assert.equal(cleanAdjust({ kind: 'received', qty: 3, reason: '   ' }).ok, false, 'no reason, no move');
  assert.equal(cleanAdjust({ kind: 'count', qty: 0, reason: 'ספירה' }).ok, true, 'a count of zero is a real count');
  const a = cleanAdjust({ kind: 'damaged', qty: 2, reason: ' נפל ' });
  assert.ok(a.ok && a.qty === 2 && a.reason === 'נפל');
});

// ── at the till ─────────────────────────────────────────────────────────────
await ok('a product line carries kind and product_id, and the units add up across lines', () => {
  const it = productItem(prod(), 2);
  assert.equal(it.kind, PRODUCT_ITEM_KIND);
  assert.equal(it.product_id, PID);
  assert.equal(it.qty, 2);
  assert.equal(it.price, 180);
  assert.ok(isProductItem(it));
  assert.equal(unitsInCart([it, productItem(prod(), 1), { name: 'טיפול', qty: 4 }], PID), 3);
});
await ok('selling at zero is allowed with a warning, and stock may go negative', () => {
  const zero = stockWarning(prod({ stock: 0 }), 1);
  assert.ok(zero && /אפשר למכור/.test(zero) && /מתחת לאפס/.test(zero), 'a warning that says the sale goes through');
  assert.ok(stockWarning(prod({ stock: -2 }), 1));
  assert.ok(/נשארו 2 יחידות/.test(String(stockWarning(prod({ stock: 2 }), 3))));
  assert.equal(stockWarning(prod({ stock: 5 }), 5), null);
  // The till's picker and warnings never refuse: no code path in them disables saving the receipt.
  const till = rd('app/ProductsTill.jsx');
  assert.ok(!/disabled/.test(till), 'the till pieces never disable anything');
  assert.match(SQL, /stock\s+integer not null default 0 check \(stock between -100000/, 'the column allows negative stock');
  const note = saleOutcomeNote([{ result: 'ok', stock_after: -1, name: 'סרום' }]);
  assert.ok(note && /סרום/.test(note) && /מתחת לאפס/.test(note));
  assert.equal(saleOutcomeNote([{ result: 'ok', stock_after: 3 }]), null);
  assert.ok(/לא נמצא/.test(String(saleOutcomeNote([{ result: 'not_found' }]))));
});
await ok('a products-only receipt is not a visit; a mixed one is', () => {
  const only = { items: JSON.stringify([productItem(prod(), 1)]) };
  const mixed = { items: JSON.stringify([{ name: 'טיפול פנים', price: 280, qty: 1 }, productItem(prod(), 1)]) };
  assert.equal(isProductOnlyReceipt(only), true);
  assert.equal(isProductOnlyReceipt(mixed), false);
  assert.equal(isProductOnlyReceipt({ items: '[]' }), false);
  assert.equal(hasProductItems(mixed), true);
  assert.equal(hasProductItems({ items: 'not json' }), false);
});

// ── loyalty ─────────────────────────────────────────────────────────────────
await ok('a products-only sale never earns a loyalty stamp; a treatment with a product does', () => {
  const base = { id: 'r1', client_id: 'c1', amount: 180, payment_method: 'מזומן', created_at: '2026-11-08T10:00:00Z' };
  const only = { ...base, service: 'קרם לחות', items: JSON.stringify([productItem(prod(), 1)]) };
  assert.equal(isStampReceipt(only, {}), false);
  assert.equal(isStampReceipt(only, { serviceNames: ['קרם לחות'] }), false, 'even if a service had the same name');
  assert.equal(isStampReceipt({ ...only, appointment_id: 'a1' }, {}), false, 'even linked to an appointment');
  const mixed = { ...base, amount: 460, service: 'טיפול פנים, קרם לחות', items: JSON.stringify([{ name: 'טיפול פנים', price: 280, qty: 1 }, productItem(prod(), 1)]) };
  assert.equal(isStampReceipt(mixed, { serviceNames: ['טיפול פנים'] }), true);
});

// ── reports ─────────────────────────────────────────────────────────────────
const NOW = new Date('2026-11-20T10:00:00Z');
const rcpt = (id: string, at: string, amount: number, items: unknown[]) => ({ id, created_at: at, amount, service: '', items: JSON.stringify(items) });
const facial = { name: 'טיפול פנים', price: 280, qty: 1 };
await ok('line shares: a discount comes off every line in proportion, and the parts add up', () => {
  const r = rcpt('m', '2026-11-02T08:00:00Z', 414, [facial, productItem(prod(), 1)]); // 460 less 10%
  const sh = lineShares(r);
  assert.equal(Math.round(sh.reduce((s, l) => s + l.income, 0) * 100) / 100, 414);
  assert.equal(Math.round(productShares(r).income * 100) / 100, 162);
  assert.equal(productShares(r).units, 1);
});
await ok('the monthly report: products are income, shown separately, never the top treatment, not a treatment', () => {
  const receipts = [
    rcpt('a', '2026-11-02T08:00:00Z', 280, [facial]),
    rcpt('b', '2026-11-03T08:00:00Z', 900, [{ ...productItem(prod(), 5), price: 180 }]), // products only, more money than any treatment
    rcpt('c', '2026-11-04T08:00:00Z', 460, [facial, productItem(prod(), 1)]),
  ];
  const r = monthlyReport({ receipts, status: 'exempt', vatRate: 0.18, now: NOW });
  assert.equal(r.income, 280 + 900 + 460, 'every receipt counts once in the money');
  assert.equal(r.productIncome, 1080);
  assert.equal(r.productUnits, 6);
  assert.equal(r.count, 2, 'the products-only sale is not a treatment');
  assert.equal(r.top?.name, 'טיפול פנים', 'a product never wins the top treatment');
  assert.ok(r.sentences.some((s) => /₪1,080 ממכירת מוצרים \(6 מוצרים\)/.test(s)), r.sentences.join(' | '));
  assert.equal(topTreatment([rcpt('x', '2026-11-03T08:00:00Z', 900, [productItem(prod(), 5)])]), null);
  assert.deepEqual(treatmentShares(rcpt('y', '2026-11-03T08:00:00Z', 460, [facial, productItem(prod(), 1)])).map((t) => t.name), ['טיפול פנים']);
  const only = monthlyReport({ receipts: [receipts[1]], status: 'exempt', vatRate: 0.18, now: NOW });
  assert.ok(only.sentences.some((s) => s === 'עוד לא נרשמו טיפולים החודש, רק מכירת מוצרים.'), only.sentences.join(' | '));
  const vat = monthlyReport({ receipts, status: 'licensed', vatRate: 0.18, now: NOW });
  assert.equal(vat.productIncome, Math.round(1080 / 1.18), 'the product part goes through the same VAT treatment as the whole');
});
await ok('the products view: top sellers, revenue this month, low stock; voided and last month left out', () => {
  const products = [prod(), prod({ id: PID2, name: 'סרום', stock: 1, low_stock_threshold: 2 }), prod({ id: 'z', name: 'בארכיון', stock: 0, archived_at: '2026-01-01' })];
  const receipts = [
    rcpt('a', '2026-11-02T08:00:00Z', 360, [productItem(prod(), 2)]),
    rcpt('b', '2026-11-03T08:00:00Z', 250, [{ ...productItem(prod({ id: PID2, name: 'סרום' }), 1), price: 250 }]),
    rcpt('v', '2026-11-04T08:00:00Z', 900, [productItem(prod({ id: PID2, name: 'סרום' }), 5)]),
    rcpt('old', '2026-10-30T08:00:00Z', 180, [productItem(prod(), 1)]),
  ];
  const m = productsMonth({ receipts, voids: [{ receipt_id: 'v' }], products, now: NOW });
  assert.equal(m.income, 610);
  assert.equal(m.units, 3);
  assert.deepEqual(m.top.map((t) => [t.name, t.units, t.income]), [['קרם לחות', 2, 360], ['סרום', 1, 250]]);
  assert.deepEqual(m.low.map((l) => l.name), ['סרום'], 'an archived product is not on the low list');
});
await ok('low stock: at or below the threshold, one attention line whose key changes with the numbers', () => {
  assert.equal(isLowStock(prod({ stock: 2 })), true);
  assert.equal(isLowStock(prod({ stock: 3 })), false);
  assert.equal(isLowStock(prod({ stock: 0, low_stock_threshold: 0 })), true, 'a threshold of 0 still tells her when it runs out');
  const a = lowStockAttention([prod({ stock: 1 }), prod({ id: PID2, name: 'סרום', stock: -1 })]);
  assert.ok(a && a.count === 2 && a.names.startsWith('\u2068סרום\u2069 (-1)'), 'names are bidi-isolated so a Latin name keeps its number on the right side');
  const b = lowStockAttention([prod({ stock: 0 }), prod({ id: PID2, name: 'סרום', stock: -1 })]);
  assert.notEqual(a?.key, b?.key, 'a new sale brings a dismissed line back');
  assert.equal(lowStockAttention([prod({ stock: 9 })]), null);
  const note = lowStockNote({ name: 'סרום', stock: 0 });
  assert.ok(/אזל/.test(note.title));
});

// ── public pages: display fields of active products only ─────────────────────
await ok('the public view carries name, brand, price and step types, never cost, stock, threshold, SKU or id', () => {
  const v = publicProductView({ ...prod(), tenant_id: T, secret_new_column: 'x' }) as Record<string, unknown>;
  assert.deepEqual(Object.keys(v).sort(), ['brand', 'name', 'price', 'types']);
  assert.equal(publicProductView(prod({ archived_at: '2026-11-01' })), null, 'archived is not shown');
  for (const col of ['cost_price', 'stock', 'low_stock_threshold', 'sku', 'id', 'tenant_id']) assert.ok(!PUBLIC_PRODUCT_COLS.split(/,\s*/).includes(col), col);
  assert.ok(PRODUCT_COLS.includes('cost_price'), 'her own screen does read cost');
});
await ok('the public loader selects only display columns, only active rows, only with the flag on', async () => {
  const calls: { table: string; select?: string; filters: string[] }[] = [];
  const fake = (settings: unknown, rows: unknown[] | null, err: unknown = null) => ({
    from(table: string) {
      const c = { table, select: undefined as string | undefined, filters: [] as string[] };
      calls.push(c);
      const q: Record<string, unknown> = {
        select(s: string) { c.select = s; return q; },
        eq(k: string, v: unknown) { c.filters.push(`${k}=${v}`); return q; },
        is(k: string, v: unknown) { c.filters.push(`${k} is ${v}`); return q; },
        order() { return q; },
        async maybeSingle() { return { data: settings, error: null }; },
        async limit() { return { data: rows, error: err }; },
      };
      return q;
    },
  });
  const rows = [{ name: 'קרם לחות', brand: 'Lumi', price: 180, routine_types: ['moisturizer'], cost_price: 70, stock: 3 }, { name: 'בלי תיוג', brand: null, price: 50, routine_types: [] }];
  const got = await loadPublicProducts(fake(on, rows), T);
  assert.deepEqual(got, [{ name: 'קרם לחות', brand: 'Lumi', price: 180, types: ['moisturizer'] }], 'even a row that carried cost and stock comes out without them');
  const pc = calls.find((c) => c.table === 'products')!;
  assert.equal(pc.select, PUBLIC_PRODUCT_COLS);
  assert.ok(pc.filters.includes(`tenant_id=${T}`) && pc.filters.includes('archived_at is null'));
  assert.equal((await loadPublicProducts(fake({ automations: {} }, rows), T)).length, 1, 'nothing stored: on by default');
  assert.deepEqual(await loadPublicProducts(fake({ automations: { feature_flags: { products: false } } }, rows), T), [], 'platform off: nothing');
  assert.deepEqual(await loadPublicProducts(fake({ automations: { products: { enabled: false } } }, rows), T), [], 'her switch off: nothing');
  assert.deepEqual(await loadPublicProducts(fake(on, null, { code: 'PGRST205', message: "Could not find the table 'public.products'" }), T), [], 'before the migration: nothing, no error');
});
await ok('the public route: signed scan link only, rate limited, a closed business shows none, never writes', () => {
  assert.match(PUBLIC_ROUTE, /checkIpLimit\(request, 'products-view'\)/);
  assert.match(PUBLIC_ROUTE, /checkTenantLimit\(tenantId, 'products-view'\)/);
  assert.match(PUBLIC_ROUTE, /verifyScanLink\(tenantId/);
  assert.match(PUBLIC_ROUTE, /tenantIsBlocked/);
  assert.ok(!/\.insert\(|\.update\(|\.rpc\(/.test(PUBLIC_ROUTE));
  assert.ok('products-view' in RATE_POLICIES && 'product-write' in RATE_POLICIES);
});
await ok('the scan recommends only products she tagged for a step the routine names, each once, at most four', () => {
  assert.deepEqual(routineTypesOf('סרום niacinamide 5%'), ['serum']);
  assert.deepEqual(routineTypesOf('קרם הגנה SPF 50'), ['spf']);
  assert.deepEqual(routineTypesOf('ג׳ל ניקוי עדין'), ['cleanser']);
  const shelf = [
    { name: 'סרום הארה', brand: 'Lumi', price: 220, types: ['serum', 'vitamin_c'] },
    { name: 'קרם לחות', brand: null, price: 180, types: ['moisturizer'] },
    { name: 'מסכה', brand: null, price: 90, types: ['mask'] },
  ] as never;
  const recs = recommendProducts({ morning: ['ניקוי עדין', 'סרום vitamin C', 'קרם לחות קל'], evening: ['סרום niacinamide'] }, shelf);
  assert.deepEqual(recs.map((r) => r.name), ['סרום הארה', 'קרם לחות'], 'the mask is not in the routine, the serum appears once');
  assert.deepEqual(Object.keys(recs[0]).sort(), ['brand', 'name', 'price', 'step']);
  assert.deepEqual(recommendProducts({ morning: ['שתי מים'] }, shelf), []);
  assert.ok(/סרום הארה \(Lumi\)/.test(orderText(recs, 'סטודיו נועה')));
  assert.equal(ROUTINE_TYPES.length >= 8, true);
  const page = rd('app/skin-scan/page.jsx');
  assert.match(page, /המוצרים שהיא ממליצה לך/);
  assert.match(page, /wa\.me\/\$\{wa\}\?text=/, 'order at the business through her WhatsApp');
  assert.ok(!/cost_price|stock/.test(page.slice(page.indexOf('5b) HER PRODUCTS'), page.indexOf('6) NEXT STEP'))), 'the block reads no private field');
});

// ── the service: stock moves only through the database, keyed ──────────────
type Call = { fn: string; args: Record<string, unknown> };
function fakeRepo(o: { rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null }; write?: (row: Record<string, unknown>, attempt: number) => { row: ProductRow | null; error: { code?: string; message?: string } | null }; twin?: ProductRow | null } = {}) {
  const calls: Call[] = [];
  const writes: Record<string, unknown>[] = [];
  const repo: ProductRepo = {
    async list() { return { rows: [], error: null }; },
    async findRecentDuplicate() { return o.twin || null; },
    async insert(row) { writes.push({ ...row }); return o.write ? o.write(row, writes.length) : { row: { ...prod(), ...row, id: PID } as ProductRow, error: null }; },
    async update(_t, _id, patch) { writes.push({ ...patch }); return o.write ? o.write(patch, writes.length) : { row: { ...prod(), ...patch } as ProductRow, error: null }; },
    async rpc(fn, args) { calls.push({ fn, args }); return o.rpc ? o.rpc(fn, args) : { data: [{ result: 'ok', stock_after: 5 }], error: null }; },
  };
  return { repo, calls, writes };
}
const input = () => { const c = cleanProductInput({ name: 'קרם', brand: 'Lumi', price: 100, category: 'פנים', routine_types: ['serum'] }); if (!c.ok) throw new Error(); return c.value; };

await ok('a sale sends only the receipt id: the database reads the receipt\'s own items', async () => {
  const f = fakeRepo({ rpc: () => ({ data: [{ line_no: 2, product_id: PID, result: 'ok', qty: 1, stock_after: 2, crossed_low: true }], error: null }) });
  const r = await applyReceipt(f.repo, { tenantId: T, userId: 'u', receiptId: 'r1' });
  assert.deepEqual(f.calls, [{ fn: 'product_stock_apply_receipt', args: { p_tenant: T, p_receipt: 'r1', p_by: 'u' } }]);
  assert.ok(r.status === 'ok' && r.crossed.length === 1 && r.crossed[0] === PID);
});
await ok('a retried sale changes nothing and notifies nothing (the database answers already)', async () => {
  const f = fakeRepo({ rpc: () => ({ data: [{ line_no: 2, product_id: PID, result: 'already', qty: 1, stock_after: 2, crossed_low: false }], error: null }) });
  const r = await applyReceipt(f.repo, { tenantId: T, userId: 'u', receiptId: 'r1' });
  assert.ok(r.status === 'ok' && r.crossed.length === 0);
  // Even if the database said crossed_low on an 'already' row, the service would not notify again.
  const g = fakeRepo({ rpc: () => ({ data: [{ line_no: 2, product_id: PID, result: 'already', crossed_low: true }], error: null }) });
  const r2 = await applyReceipt(g.repo, { tenantId: T, userId: 'u', receiptId: 'r1' });
  assert.ok(r2.status === 'ok' && r2.crossed.length === 0);
});
await ok('a void restores through the database, and a second restore is already', async () => {
  const f = fakeRepo({ rpc: () => ({ data: [{ line_no: 2, product_id: PID, result: 'already', qty: 1, stock_after: 5 }], error: null }) });
  const r = await restoreReceipt(f.repo, { tenantId: T, userId: 'u', receiptId: 'r1' });
  assert.deepEqual(f.calls[0], { fn: 'product_stock_restore_receipt', args: { p_tenant: T, p_receipt: 'r1', p_by: 'u' } });
  assert.ok(r.status === 'ok' && r.lines[0].result === 'already');
  assert.deepEqual(readMoveLines(null), []);
});
await ok('a manual move is keyed by the form, with her reason; a retry is the same key', async () => {
  const f = fakeRepo();
  await adjustStock(f.repo, { tenantId: T, userId: 'u', productId: PID, kind: 'received', qty: 6, reason: 'משלוח מהספק', key: 'form-key-123' });
  await adjustStock(f.repo, { tenantId: T, userId: 'u', productId: PID, kind: 'received', qty: 6, reason: 'משלוח מהספק', key: 'form-key-123' });
  assert.equal(f.calls[0].args.p_key, 'adj:form-key-123');
  assert.equal(f.calls[1].args.p_key, f.calls[0].args.p_key);
  assert.equal(f.calls[0].args.p_delta, 6);
  assert.match(String(f.calls[0].args.p_reason), /קיבלתי משלוח: משלוח מהספק/);
  await adjustStock(f.repo, { tenantId: T, userId: 'u', productId: PID, kind: 'damaged', qty: 2, reason: 'נשבר', key: 'form-key-456' });
  assert.equal(f.calls[2].args.p_delta, -2);
  await adjustStock(f.repo, { tenantId: T, userId: 'u', productId: PID, kind: 'count', qty: 4, reason: 'ספירה', key: 'form-key-789' });
  assert.equal(f.calls[3].args.p_set, 4);
  assert.equal(f.calls[3].args.p_delta, null);
});
await ok('opening stock is one ledger move keyed by the product; a double tap on create is the same product', async () => {
  const f = fakeRepo();
  const r = await createProduct(f.repo, { tenantId: T, userId: 'u', input: input(), openingStock: 7 });
  assert.equal(r.status, 'ok');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].args.p_key, `open:${PID}`);
  assert.equal(f.calls[0].args.p_kind, 'received');
  assert.ok(!('stock' in f.writes[0]), 'the insert never writes a stock number');
  const g = fakeRepo({ twin: prod() });
  const r2 = await createProduct(g.repo, { tenantId: T, userId: 'u', input: input(), openingStock: 7 });
  assert.ok(r2.status === 'ok' && 'already' in r2 && r2.already === true);
  assert.equal(g.calls.length, 0, 'no second opening move');
  assert.equal(g.writes.length, 0, 'no second product');
});
await ok('a missing optional column drops ONLY that column; a missing required one saves nothing', async () => {
  const f = fakeRepo({ write: (row, attempt) => attempt === 1 ? { row: null, error: { code: 'PGRST204', message: "Could not find the 'routine_types' column of 'products' in the schema cache" } } : { row: { ...prod(), ...row } as ProductRow, error: null } });
  const r = await writeProduct(f.repo, T, null, input());
  assert.ok(r.status === 'ok');
  if (r.status !== 'ok') return;
  assert.deepEqual(r.dropped, ['routine_types']);
  assert.ok(!('routine_types' in f.writes[1]));
  for (const k of ['name', 'brand', 'category', 'price', 'cost_price', 'sku', 'low_stock_threshold']) assert.ok(k in f.writes[1], `${k} kept`);
  const g = fakeRepo({ write: () => ({ row: null, error: { code: '42703', message: 'column "low_stock_threshold" of relation "products" does not exist' } }) });
  assert.equal((await writeProduct(g.repo, T, null, input())).status, 'missing', 'a required column is not quietly dropped');
  assert.equal(g.writes.length, 1);
  const h = fakeRepo({ write: () => ({ row: null, error: { code: '42703', message: 'something odd' } }) });
  assert.equal((await writeProduct(h.repo, T, null, input())).status, 'missing', 'a column it cannot name is not guessed');
  const d = fakeRepo({ write: () => ({ row: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "products_sku_uniq"' } }) });
  assert.equal((await writeProduct(d.repo, T, null, input())).status, 'duplicate-sku');
});

// ── before the migration ────────────────────────────────────────────────────
await ok('before the migration: businesses see nothing at all, and every path changes nothing', async () => {
  const missing = { code: 'PGRST205', message: "Could not find the table 'public.products' in the schema cache" };
  assert.ok(isMissingProductSchema(missing));
  assert.ok(isMissingProductSchema({ code: 'PGRST202', message: 'Could not find the function public.product_stock_apply_receipt' }));
  assert.ok(!isMissingProductSchema({ code: '23505', message: 'duplicate' }));
  const f = fakeRepo({ rpc: () => ({ data: null, error: missing }), write: () => ({ row: null, error: missing }) });
  assert.equal((await applyReceipt(f.repo, { tenantId: T, userId: 'u', receiptId: 'r' })).status, 'missing');
  assert.equal((await restoreReceipt(f.repo, { tenantId: T, userId: 'u', receiptId: 'r' })).status, 'missing');
  assert.equal((await adjustStock(f.repo, { tenantId: T, userId: 'u', productId: PID, kind: 'received', qty: 1, reason: 'x', key: 'kkkkkkkk' })).status, 'missing');
  assert.equal((await createProduct(f.repo, { tenantId: T, userId: 'u', input: input(), openingStock: 2 })).status, 'missing');
  assert.match(NEEDS_MIGRATION_HE, /kalmea-sql-products\.txt/);
  assert.match(NEEDS_MIGRATION_HE, /שום דבר אחר לא השתנה/);
  // No screen shows the migration sentence: the panel, the settings switch, the till and the attention line render nothing.
  const panel = rd('app/ProductsPanel.jsx');
  assert.match(panel, /api\.status === 'migration' \|\| api\.status === 'idle'\) return null;/);
  assert.ok(!/NEEDS_MIGRATION_HE/.test(panel + rd('app/ProductsTill.jsx') + rd('app/ProductSettings.jsx') + rd('app/beautyos.jsx')));
  assert.match(rd('app/ProductSettings.jsx'), /api\.status !== 'ready'\) return null;/);
  // A business with no products: a friendly first-product invitation, and nothing in the till or on the scan page.
  assert.match(panel, /products\.length === 0 && !form && \(/);
  assert.match(panel, /הוסיפי את המוצר הראשון/);
  assert.match(rd('app/ProductsTill.jsx'), /if \(!list\.length\) return null;/);
  assert.match(rd('app/skin-scan/page.jsx'), /\{recs\.length > 0 && \(/);
  assert.deepEqual(recommendProducts({ morning: ['סרום'] }, []), []);
  assert.match(rd('app/beautyos.jsx'), /productsApi\.visible&&productsApi\.status==="ready"\?lowStockAttention/);
  assert.ok((ROUTE.match(/return needsMigration\(\)/g) || []).length >= 8, 'every action degrades the same way');
  const hook = rd('app/useProducts.js');
  assert.match(hook, /needsMigration\) \{ setState\(\{ status: 'migration'/);
  // The till offers products only once they are loaded: no picker, no warning before the migration.
  assert.match(rd('app/ProductsTill.jsx'), /api\.status !== 'ready'\) return null/);
  // The receipt is saved first and the stock call never blocks it.
  const app = rd('app/beautyos.jsx');
  const i = app.indexOf('productsApi.afterReceipt(data[0], toast);');
  assert.ok(i > 0 && i > app.indexOf('setReceipts(prev=>[...prev,data[0]]);', i - 400), 'stock moves after the receipt exists');
  assert.ok(!/await productsApi\.afterReceipt/.test(app), 'never awaited inside the save');
});

// ── security: plan gating, tenant from the session, no browser writes ──────
await ok('the owner route: session tenant, plan checked before ANY service-role read, demo never writes', () => {
  const who = ROUTE.slice(ROUTE.indexOf('async function who()'), ROUTE.indexOf('export async function GET'));
  const guard = who.indexOf('requireActiveTenant(session)');
  assert.ok(guard > 0, 'the plan guard is in who()');
  assert.ok(guard < who.indexOf('admin()'), 'before the service-role client exists');
  assert.ok(who.indexOf('callerTenantId(session)') < guard, 'the tenant comes from the session');
  assert.match(who, /if \(!isDemoTenantId\(tenantId\)\) \{\s*const guard = await requireActiveTenant/);
  assert.match(ROUTE, /export async function GET\(\) \{\s*try \{\s*const w = await who\(\);/);
  assert.match(ROUTE, /export async function POST\(request: Request\) \{\s*try \{\s*const w = await who\(\);/);
  assert.match(ROUTE, /if \(isDemoTenantId\(tenantId\)\) return json\(\{ success: false, demo: true/);
  assert.ok(!/b\.tenant|tenantId: b\.|tenant_id: b\./.test(ROUTE), 'the body never names the tenant');
  assert.ok(!/p_tenant: b\./.test(ROUTE));
  assert.match(ROUTE, /whatsapp: false/, 'the low-stock note is in-app and push only, never WhatsApp');
  assert.ok(!/stock:/.test(ROUTE.slice(ROUTE.indexOf("action === 'create' || action === 'update'"), ROUTE.indexOf("action === 'archive'"))), 'the catalog save never sets stock');
  assert.ok(!/from\(['"]products['"]\)\.(insert|update)/.test(rd('app/ProductsPanel.jsx') + rd('app/useProducts.js') + rd('app/beautyos.jsx')), 'no browser write to products');
  assert.ok(!/product_stock_/.test(rd('app/beautyos.jsx')), 'the browser never calls a stock function');
});
await ok('the migration: one locked, keyed move; restore once; service role only; tenant RLS and the trial gate', () => {
  assert.match(SQL, /for update;/);
  assert.match(SQL, /Under the lock, the key again/);
  assert.match(SQL, /create unique index if not exists product_stock_ledger_idem_uniq on public\.product_stock_ledger \(tenant_id, idem_key\)/);
  assert.match(SQL, /create unique index if not exists product_stock_ledger_reverse_uniq on public\.product_stock_ledger \(reverses_id\) where reverses_id is not null/);
  assert.match(SQL, /'sale:' \|\| p_receipt::text \|\| ':' \|\| v_i::text/);
  assert.match(SQL, /'restore:' \|\| s\.id::text/);
  assert.match(SQL, /exception when unique_violation then/);
  assert.match(SQL, /if exists \(select 1 from public\.receipt_voids v where v\.receipt_id = p_receipt\) then\s*return query select null::integer, null::uuid, 'voided'/);
  for (const fn of ['product_stock_move', 'product_stock_apply_receipt', 'product_stock_restore_receipt', 'product_stock_sync']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`), fn);
    assert.match(SQL, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`), fn);
  }
  assert.ok(!/grant execute on function public\.product_receipt_items/.test(SQL));
  assert.match(SQL, /create policy %I on public\.%I for select to authenticated using \(tenant_id = public\.get_user_tenant_id\(\)\)/);
  assert.match(SQL, /revoke all on public\.products from anon, authenticated;/);
  assert.match(SQL, /grant select on public\.products to authenticated;/);
  assert.ok(!/grant (insert|update|delete)[^;]*to (anon|authenticated)/i.test(SQL));
  assert.ok(!/to anon/.test(SQL.replace(/revoke[^;]*;/g, '')), 'nothing granted to anon');
  assert.match(SQL, /as restrictive for insert to authenticated with check \(public\.is_tenant_active\(\)\)/);
  assert.match(SQL, /_require_active_select/);
  assert.match(SQL, /00000000-0000-0000-0000-000000000001/);
  assert.match(SQL, /product_stock_ledger\.receipt_id must belong to the same business/);
  assert.match(SQL, /products\.tenant_id cannot change/);
  assert.match(SQL, /product_stock_ledger_manual_reason check \(kind in \('sale', 'void_restore'\) or length\(btrim\(coalesce\(reason, ''\)\)\) > 0\)/, 'a manual move needs a reason');
  assert.ok(!/\bdelete from\b|drop table/i.test(SQL.split('-- ── ROLLBACK')[0]), 'the migration deletes nothing');
  assert.ok(REFERENCED_TABLES.includes('products') && REFERENCED_TABLES.includes('product_stock_ledger'));
});
await ok('the clean copy instructions: no em dashes or long dashes in product copy', () => {
  for (const f of ['lib/products.ts', 'app/ProductsPanel.jsx', 'app/ProductsTill.jsx', 'app/useProducts.js', 'lib/productService.ts']) {
    const hebrewLines = rd(f).split('\n').filter((l) => /[֐-׿]/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    for (const l of hebrewLines) assert.ok(!/[–—]/.test(l), `${f}: ${l.trim().slice(0, 60)}`);
  }
});

console.log(`\n${n} products checks passed`);
