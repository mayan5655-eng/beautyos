// app/api/products/route.ts
//
// The owner's side of products and inventory. Signed in; the tenant is ALWAYS the session's (get_user_tenant_id), never the body's.
//
//   GET                                             her catalog (cost and stock included: this is her own screen), the stock ledger
//                                                   of the last 90 days, and, first, the safety-net sync (product_stock_sync): a
//                                                   receipt whose stock call never arrived is applied, a voided one put back.
//   POST { action: 'create', product, openingStock }  a new product; opening stock is a ledger move, once.
//   POST { action: 'update', id, product }          edit the catalog fields. Stock is NOT a field here: it only moves through moves.
//   POST { action: 'archive' | 'unarchive', id }    hide or bring back. Never deleted (the ledger and old receipts point at it).
//   POST { action: 'adjust', id, kind, qty, reason, key }  a delivery, damage, a count, with her reason, in the ledger.
//   POST { action: 'sale', receiptId }              after the till saved a receipt: its product lines move stock, once each.
//   POST { action: 'restore', receiptId }           after a void: those lines go back, once each.
//
// Every request: the platform flag on, the plan active (requireActiveTenant, demo businesses excepted) BEFORE any service-role read,
// and every write refused for a demo business. Before add_products_inventory_2026-11-08.sql runs, every action answers
// needsMigration with a plain sentence and changes nothing.
import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { callerTenantId } from '@/lib/tenantScope';
import { requireActiveTenant } from '@/lib/planGuard';
import { isDemoTenantId } from '@/lib/demoTenants';
import { checkTenantLimit } from '@/lib/rateLimit';
import { notifyOwner } from '@/lib/ownerNotify';
import { productsVisible, cleanProductInput, cleanAdjust, isMissingProductSchema, NEEDS_MIGRATION_HE, stockOf } from '@/lib/products';
import { createProduct, writeProduct, adjustStock, applyReceipt, restoreReceipt, lowStockNote } from '@/lib/productService';
import { supabaseProductRepo } from '@/lib/productRepo';
import { admin, DEMO_NOTE } from '../grow/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const needsMigration = () => json({ success: false, needsMigration: true, error: NEEDS_MIGRATION_HE });
const oops = (where: string, e: unknown) => {
  console.error(`[products] ${where} failed:`, (e as { message?: string })?.message || e);
  return json({ success: false, error: 'משהו נתקע אצלנו. שום דבר לא השתנה, אפשר לנסות שוב בעוד רגע.' }, 500);
};

async function who() {
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: json({ success: false, error: 'לא מחוברת' }, 401) } as const;
  const tenantId = await callerTenantId(session);
  if (!tenantId) return { error: json({ success: false, error: 'לא זוהה עסק' }, 403) } as const;
  // Everything below is a service-role read or write that RLS cannot see, so the plan is checked FIRST, for reads too: a closed
  // business reads nothing from her business tables (add_closed_read_block_2026-10-25.sql). Same predicate and demo exception.
  if (!isDemoTenantId(tenantId)) {
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return { error: guard.response } as const;
  }
  const db = admin();
  // The whole settings row, like every other reader of the flags (a named optional column failed the read where it is missing).
  const { data: settings, error: settingsErr } = await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (settingsErr) return { error: oops('settings', settingsErr) } as const;
  if (!productsVisible(settings as never)) return { error: json({ success: false, hidden: true, error: 'מוצרים ומלאי לא פעילים בחשבון' }, 404) } as const;
  return { user, tenantId, db, settings, repo: supabaseProductRepo(db) } as const;
}

export async function GET() {
  try {
    const w = await who();
    if ('error' in w) return w.error;
    const { db, tenantId, repo } = w;
    // The safety net first (not for a demo business, which never writes). Idempotent in the database: it can run on every load.
    let synced = { applied: 0, restored: 0 };
    if (!isDemoTenantId(tenantId)) {
      const s = await repo.rpc('product_stock_sync', { p_tenant: tenantId, p_days: 14 });
      if (s.error && isMissingProductSchema(s.error)) return needsMigration();
      const row = Array.isArray(s.data) ? s.data[0] : s.data;
      if (!s.error && row) synced = { applied: Number((row as { applied?: unknown }).applied) || 0, restored: Number((row as { restored?: unknown }).restored) || 0 };
      if (s.error) console.warn('[products] sync failed:', s.error.message);
    }
    const list = await repo.list(tenantId);
    if (list.error && isMissingProductSchema(list.error)) return needsMigration();
    if (list.error) return oops('list', list.error);
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const led = await db.from('product_stock_ledger').select('id, product_id, kind, delta, stock_after, receipt_id, line_no, reason, created_at')
      .eq('tenant_id', tenantId).gte('created_at', since).order('created_at', { ascending: false }).limit(300);
    return json({ success: true, ready: true, products: list.rows, ledger: led.error ? [] : led.data || [], synced });
  } catch (e) {
    return oops('list', e);
  }
}

export async function POST(request: Request) {
  try {
    const w = await who();
    if ('error' in w) return w.error;
    const { db, tenantId, user, repo, settings } = w;
    if (isDemoTenantId(tenantId)) return json({ success: false, demo: true, error: DEMO_NOTE }, 403);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || '');

    if (action === 'create' || action === 'update') {
      const limited = checkTenantLimit(tenantId, 'product-write');
      if (limited) return limited;
      const c = cleanProductInput((b.product || {}) as Record<string, unknown>);
      if (!c.ok) return json({ success: false, error: c.error }, 400);
      if (action === 'create') {
        const opening = Number(b.openingStock ?? 0);
        if (!Number.isInteger(opening) || opening < 0 || opening > 100000) return json({ success: false, error: 'כמות פתיחה צריכה להיות מספר שלם, 0 ומעלה' }, 400);
        const r = await createProduct(repo, { tenantId, userId: user.id, input: c.value, openingStock: opening });
        if (r.status === 'missing') return needsMigration();
        if (r.status === 'duplicate-sku') return json({ success: false, error: 'כבר יש מוצר עם הברקוד או המק"ט הזה' }, 409);
        if (r.status !== 'ok') return oops('create', 'error' in r ? r.error : r.status);
        return json({ success: true, product: r.row, dropped: r.dropped, already: r.already, stockFailed: 'stockFailed' in r ? r.stockFailed : false });
      }
      const id = String(b.id || '');
      if (!UUID_RE.test(id)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      const r = await writeProduct(repo, tenantId, id, c.value);
      if (r.status === 'missing') return needsMigration();
      if (r.status === 'duplicate-sku') return json({ success: false, error: 'כבר יש מוצר עם הברקוד או המק"ט הזה' }, 409);
      if (r.status === 'not_found') return json({ success: false, error: 'המוצר לא נמצא' }, 404);
      if (r.status !== 'ok') return oops('update', r.error);
      return json({ success: true, product: r.row, dropped: r.dropped });
    }

    if (action === 'archive' || action === 'unarchive') {
      const id = String(b.id || '');
      if (!UUID_RE.test(id)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      const r = await repo.update(tenantId, id, { archived_at: action === 'archive' ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
      if (r.error && isMissingProductSchema(r.error)) return needsMigration();
      if (r.error) return oops(action, r.error);
      if (!r.row) return json({ success: false, error: 'המוצר לא נמצא' }, 404);
      return json({ success: true, product: r.row });
    }

    if (action === 'adjust') {
      const id = String(b.id || '');
      const key = String(b.key || '');
      if (!UUID_RE.test(id) || !KEY_RE.test(key)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      const a = cleanAdjust(b);
      if (!a.ok) return json({ success: false, error: a.error }, 400);
      const r = await adjustStock(repo, { tenantId, userId: user.id, productId: id, kind: a.kind, qty: a.qty, reason: a.reason, key });
      if (r.status === 'missing') return needsMigration();
      if (r.status === 'error') return oops('adjust', r.error);
      if (r.status === 'not_found') return json({ success: false, error: 'המוצר לא נמצא' }, 404);
      if (r.status !== 'ok' && r.status !== 'already') return json({ success: false, error: 'העדכון לא תקין' }, 400);
      if (r.status === 'ok' && r.crossedLow) await notifyLow(tenantId, [id], settings as object | null);
      return json({ success: true, stock: r.stockAfter, already: r.status === 'already' });
    }

    if (action === 'sale' || action === 'restore') {
      const receiptId = String(b.receiptId || '');
      if (!UUID_RE.test(receiptId)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      if (action === 'sale') {
        const r = await applyReceipt(repo, { tenantId, userId: user.id, receiptId });
        if (r.status === 'missing') return needsMigration();
        if (r.status === 'error') return oops('sale', r.error);
        if (r.crossed.length) await notifyLow(tenantId, r.crossed, settings as object | null);
        return json({ success: true, lines: r.lines });
      }
      const r = await restoreReceipt(repo, { tenantId, userId: user.id, receiptId });
      if (r.status === 'missing') return needsMigration();
      if (r.status === 'error') return oops('restore', r.error);
      return json({ success: true, lines: r.lines });
    }

    return json({ success: false, error: 'פעולה לא מוכרת' }, 400);
  } catch (e) {
    return oops('post', e);
  }
}

// One in-app notification (and push) per product that this move took to or below her threshold. Never WhatsApp, never a client.
async function notifyLow(tenantId: string, ids: string[], settingsRow: object | null) {
  try {
    const { data } = await admin().from('products').select('id, name, stock').eq('tenant_id', tenantId).in('id', ids);
    for (const p of (data || []) as { id: string; name: string; stock: number }[]) {
      const n = lowStockNote({ name: p.name, stock: stockOf(p) });
      await notifyOwner({ tenantId, kind: 'low_stock', title: n.title, body: n.body, settingsRow, url: '/dashboard', whatsapp: false });
    }
  } catch (e) {
    console.warn('[products] low-stock notification failed:', (e as { message?: string })?.message || e);
  }
}
