'use client';
// app/useProducts.js
//
// Her products (lib/products.ts), for the till picker, the products screen and the low-stock line on her attention list. Reads
// and writes go through /api/products only (plan checked, service role); the browser never writes a stock number. Loads nothing
// unless the platform flag automations.feature_flags.products is on. Before the migration runs: status 'migration', and the till
// offers no products.
import { useCallback, useEffect, useRef, useState } from 'react';
import { productsVisible, hasProductItems, saleOutcomeNote } from '@/lib/products';

const post = async (body) => {
  const r = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return { ok: r.ok && !!j?.success, j: j || {} };
};

export default function useProducts(settings) {
  const visible = productsVisible(settings);
  const [state, setState] = useState({ status: 'idle', products: [], ledger: [], error: '' });
  const alive = useRef(true);
  // Set on every mount: React's development double-mount runs the cleanup once, and a ref left false would drop every answer.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/products');
      const j = await r.json().catch(() => null);
      if (!alive.current) return;
      if (j?.needsMigration) { setState({ status: 'migration', products: [], ledger: [], error: j.error }); return; }
      if (j?.hidden) { setState({ status: 'hidden', products: [], ledger: [], error: '' }); return; }
      if (!r.ok || !j?.success) { setState((s) => ({ ...s, status: s.status === 'ready' ? 'ready' : 'error', error: j?.error || 'לא הצלחנו לטעון את המוצרים' })); return; }
      setState({ status: 'ready', products: j.products || [], ledger: j.ledger || [], error: '' });
    } catch {
      if (alive.current) setState((s) => ({ ...s, status: s.status === 'ready' ? 'ready' : 'error', error: 'לא הצלחנו לטעון את המוצרים' }));
    }
  }, []);

  useEffect(() => { if (visible) reload(); }, [visible, reload]);

  // After the till saved a receipt: the server moves stock for that receipt's product lines, once each. A dropped connection is
  // caught by the next load (the database's sync applies any receipt whose call never arrived), so it is said, not retried here.
  const afterReceipt = useCallback(async (receipt, toast) => {
    if (!visible || !receipt?.id || !hasProductItems(receipt)) return;
    try {
      const { ok, j } = await post({ action: 'sale', receiptId: String(receipt.id) });
      if (!ok) { if (!j.needsMigration) toast?.('התשלום נרשם. המלאי יתעדכן בכניסה הבאה למוצרים ומלאי.', 'error'); return; }
      const names = new Map((state.products || []).map((p) => [String(p.id), p.name]));
      const note = saleOutcomeNote((j.lines || []).map((l) => ({ ...l, name: names.get(String(l.product_id)) })));
      if (note) toast?.(note, 'error');
    } catch {
      toast?.('התשלום נרשם. המלאי יתעדכן בכניסה הבאה למוצרים ומלאי.', 'error');
    }
    reload();
  }, [visible, state.products, reload]);

  // After a void: the stock of that receipt's products goes back, once (the database refuses a second time).
  const afterVoid = useCallback(async (receipt) => {
    if (!visible || !receipt?.id || !hasProductItems(receipt)) return;
    try { await post({ action: 'restore', receiptId: String(receipt.id) }); } catch { /* the next load's sync puts it back */ }
    reload();
  }, [visible, reload]);

  return { visible, ...state, reload, post, afterReceipt, afterVoid };
}
