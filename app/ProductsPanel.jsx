'use client';
// app/ProductsPanel.jsx
//
// Cashier screen: "מוצרים ומלאי". Her catalog (add, edit, archive, never delete), stock with a reason for every manual move
// (a delivery, damage, a count), the stock ledger per product, the home-routine tags the skin scan reads, and a short month view:
// product revenue, top sellers, what is low. On by default; renders NOTHING when the platform switched it off, while it loads, and
// before the migration runs (a business never sees a sentence about a database update). Every write goes to /api/products; no stock number is written from here.
import { useMemo, useState } from 'react';
import { ROUTINE_TYPES, ADJUST_KINDS, ADJUST_HE, LEDGER_HE, DEFAULT_LOW_THRESHOLD, isActiveProduct, isLowStock, stockOf, thresholdOf } from '@/lib/products';
import { productsMonth } from '@/lib/productReport';

const money = (n) => `₪${(Math.round(Number(n) * 100) / 100).toLocaleString('he-IL')}`;
const newKey = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
const EMPTY = { name: '', brand: '', category: '', price: '', cost_price: '', sku: '', openingStock: '', low_stock_threshold: String(DEFAULT_LOW_THRESHOLD), routine_types: [] };
const dateHe = (iso) => { try { return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); } catch { return ''; } };
const DROPPED_HE = { routine_types: 'שלבי השגרה', category: 'הקטגוריה', sku: 'הברקוד', cost_price: 'מחיר העלות' };

export default function ProductsPanel({ api, receipts, receiptVoids, pc, pcTint, toast, isDemo, defaultThreshold }) {
  const [filter, setFilter] = useState('active');
  const [form, setForm] = useState(null); // { id|null, ...fields }
  const [openId, setOpenId] = useState(null);
  const [adj, setAdj] = useState(null); // { id, kind, qty, reason, key }
  const [busy, setBusy] = useState(false);
  const products = api?.products || [];
  const month = useMemo(() => productsMonth({ receipts: receipts || [], voids: receiptVoids || [], products }), [receipts, receiptVoids, products]);

  if (!api?.visible || api.status === 'hidden' || api.status === 'migration' || api.status === 'idle') return null;

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14 };
  const chip = (on) => ({ padding: '8px 12px', minHeight: 40, borderRadius: 'var(--r-full)', border: `1px solid ${on ? pc : 'var(--line-2)'}`, background: on ? pcTint : 'transparent', color: 'var(--ink)', fontWeight: on ? 700 : 500, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' });
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const btn = { padding: '10px 14px', minHeight: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' };
  const primary = { ...btn, background: pc, color: 'var(--pc-contrast, #1F3A30)', border: 'none' };
  const label = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600, margin: '10px 0 4px', display: 'block' };
  const muted = { fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: 0 };

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>🧴 מוצרים ומלאי</p>
      {api.status === 'ready' && !form && <button type="button" data-testid="product-new" style={btn} disabled={isDemo} onClick={() => setForm({ id: null, ...EMPTY, low_stock_threshold: String(defaultThreshold ?? DEFAULT_LOW_THRESHOLD) })}>מוצר חדש</button>}
    </div>
  );

  if (api.status === 'error') {
    return (
      <div data-testid="products-panel" style={box}>
        {header}
        <p style={muted}>{api.error}</p>
        <button type="button" style={{ ...btn, marginTop: 8 }} onClick={api.reload}>לנסות שוב</button>
      </div>
    );
  }

  const save = async () => {
    if (busy || !form) return;
    setBusy(true);
    try {
      const product = { name: form.name, brand: form.brand, category: form.category, price: form.price, cost_price: form.cost_price, sku: form.sku, low_stock_threshold: form.low_stock_threshold, routine_types: form.routine_types };
      const { ok, j } = await api.post(form.id ? { action: 'update', id: form.id, product } : { action: 'create', product, openingStock: Number(form.openingStock || 0) });
      if (!ok) { toast?.(j.error || 'לא הצלחנו לשמור, נסי שוב', 'error'); return; }
      const lost = (j.dropped || []).map((c) => DROPPED_HE[c] || c);
      if (lost.length) toast?.(`המוצר נשמר, בלי ${lost.join(', ')}: השדה עוד לא קיים אצלך במסד הנתונים.`, 'error');
      else if (j.stockFailed) toast?.('המוצר נשמר, אבל מלאי הפתיחה לא נרשם. עדכני אותו ב"קיבלתי משלוח".', 'error');
      else toast?.(form.id ? 'המוצר עודכן' : 'המוצר נוסף לקטלוג');
      setForm(null);
      await api.reload();
    } finally { setBusy(false); }
  };

  const archive = async (p, on) => {
    setBusy(true);
    try {
      const { ok, j } = await api.post({ action: on ? 'archive' : 'unarchive', id: p.id });
      if (!ok) { toast?.(j.error || 'לא הצלחנו, נסי שוב', 'error'); return; }
      toast?.(on ? 'המוצר הועבר לארכיון. הוא לא יופיע בקופה, וההיסטוריה שלו נשמרת.' : 'המוצר חזר לקטלוג');
      await api.reload();
    } finally { setBusy(false); }
  };

  const adjust = async () => {
    if (busy || !adj) return;
    if (!adj.reason.trim()) { toast?.('כתבי בקצרה מה קרה, זה נשמר ביומן המלאי', 'error'); return; }
    setBusy(true);
    try {
      const { ok, j } = await api.post({ action: 'adjust', id: adj.id, kind: adj.kind, qty: Number(adj.qty), reason: adj.reason, key: adj.key });
      // A failed save keeps the same key: pressing again is the same adjustment, never a second one.
      if (!ok) { toast?.(j.error || 'לא הצלחנו לעדכן את המלאי, נסי שוב', 'error'); return; }
      toast?.(`המלאי עודכן. עכשיו במלאי: ${j.stock}`);
      setAdj(null);
      await api.reload();
    } finally { setBusy(false); }
  };

  const shown = products.filter((p) => (filter === 'archived' ? !isActiveProduct(p) : isActiveProduct(p)));
  const archivedCount = products.filter((p) => !isActiveProduct(p)).length;
  const ledgerOf = (id) => (api.ledger || []).filter((l) => String(l.product_id) === String(id)).slice(0, 8);
  const stockBadge = (p) => {
    const s = stockOf(p);
    const low = isLowStock(p);
    return <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-full)', background: s < 0 ? 'rgba(192,57,79,0.12)' : low ? 'var(--k-petal, #FBEDE9)' : 'var(--k-sage, #DCE4D5)', color: s < 0 ? 'var(--danger)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{s < 0 ? `מינוס ${-s}` : s === 0 ? 'אזל' : `במלאי ${s}`}</span>;
  };

  return (
    <div data-testid="products-panel" style={box}>
      {header}

      {/* No products yet: one warm invitation instead of an empty report. */}
      {products.length === 0 && !form && (
        <div data-testid="products-empty" style={{ textAlign: 'center', padding: '14px 6px 6px' }}>
          <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>מוכרת גם מוצרים?</p>
          <p style={{ ...muted, marginBottom: 12 }}>הוסיפי את המוצר הראשון שלך, והוא יופיע בקופה ליד הטיפולים, עם מלאי שמתעדכן לבד בכל מכירה.</p>
          <button type="button" data-testid="product-first" style={primary} disabled={isDemo} onClick={() => setForm({ id: null, ...EMPTY, low_stock_threshold: String(defaultThreshold ?? DEFAULT_LOW_THRESHOLD) })}>הוסיפי את המוצר הראשון</button>
        </div>
      )}

      {/* The month, from her receipts (the same money as the income screen). */}
      {products.length > 0 && <div data-testid="products-report" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', margin: '8px 0 12px' }}>
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>החודש</p>
        {month.units === 0 ? <p style={muted}>עוד לא נמכרו מוצרים החודש.</p> : (
          <>
            <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink)', margin: '0 0 6px' }}>מכירת מוצרים הכניסה <b>{money(month.income)}</b> ({month.units === 1 ? 'מוצר אחד' : `${month.units} מוצרים`})</p>
            <p style={{ ...muted, marginBottom: 2 }}>הנמכרים ביותר:</p>
            {month.top.map((t, i) => (
              <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink)', padding: '2px 0' }}>
                <span style={{ minWidth: 0 }}>{i + 1}. <bdi>{t.name}</bdi></span>
                <span style={{ whiteSpace: 'nowrap' }}>{t.units} יח׳ · {money(t.income)}</span>
              </div>
            ))}
          </>
        )}
        {month.low.length > 0 && (
          <p data-testid="products-low" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', margin: '8px 0 0' }}>
            ⚠ מלאי נמוך: {month.low.map((l, i) => <span key={l.id}>{i ? ', ' : ''}<bdi>{l.name}</bdi> ({l.stock})</span>)}
          </p>
        )}
      </div>}

      {form && (
        <div data-testid="product-form" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginBottom: 12 }}>
          <label style={label}>שם המוצר<input style={inp} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="למשל: קרם לחות מרגיע" /></label>
          <label style={label}>מותג<input style={inp} value={form.brand} maxLength={60} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="לא חובה" /></label>
          <label style={label}>קטגוריה<input style={inp} value={form.category} maxLength={40} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="לא חובה, למשל: טיפוח פנים" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={label}>מחיר מכירה ₪<input style={inp} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            <label style={label}>מחיר עלות ₪<input style={inp} inputMode="decimal" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="רק את רואה" /></label>
            {!form.id && <label style={label}>כמה יש במלאי<input style={inp} inputMode="numeric" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: e.target.value.replace(/\D/g, '') })} placeholder="0" /></label>}
            <label style={label}>התראה כשנשארות<input style={inp} inputMode="numeric" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <label style={label}>ברקוד או מק״ט<input style={inp} value={form.sku} maxLength={40} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="לא חובה" /></label>
          <span style={label}>מתאים לשלב בשגרה הביתית (לסריקת העור)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ROUTINE_TYPES.map((t) => {
              const on = form.routine_types.includes(t.key);
              return <button key={t.key} type="button" style={chip(on)} aria-pressed={on} onClick={() => setForm({ ...form, routine_types: on ? form.routine_types.filter((k) => k !== t.key) : [...form.routine_types, t.key] })}>{t.he}</button>;
            })}
          </div>
          <p style={{ ...muted, marginTop: 6 }}>כשהסריקה ממליצה על שלב כזה, הלקוחה תראה את המוצר הזה עם השם, המותג והמחיר. לא מחיר עלות ולא מלאי.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" data-testid="product-save" style={primary} disabled={busy || !form.name.trim() || form.price === ''} onClick={save}>{form.id ? 'שמירת שינויים' : 'הוספה לקטלוג'}</button>
            <button type="button" style={btn} onClick={() => setForm(null)}>ביטול</button>
          </div>
        </div>
      )}

      {products.length > 0 && <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" style={chip(filter === 'active')} onClick={() => setFilter('active')}>פעילים</button>
        {archivedCount > 0 && <button type="button" style={chip(filter === 'archived')} onClick={() => setFilter('archived')}>ארכיון ({archivedCount})</button>}
      </div>}
      {products.length > 0 && shown.length === 0 && <p style={muted}>{filter === 'archived' ? 'אין מוצרים בארכיון.' : 'עוד אין מוצרים בקטלוג. הוסיפי את המוצרים שאת מוכרת, והם יופיעו בקופה ליד הטיפולים.'}</p>}
      {shown.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} data-testid="product-row" style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <button type="button" onClick={() => { setOpenId(open ? null : p.id); setAdj(null); }} aria-expanded={open} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right', color: 'var(--ink)', minHeight: 44 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-sm)' }}>{p.name}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{[p.brand, p.category].filter(Boolean).join(' · ') || ' '}</span>
              </span>
              <span style={{ fontWeight: 700, fontSize: 'var(--t-sm)' }}>{money(p.price)}</span>
              {stockBadge(p)}
            </button>
            {open && (
              <div style={{ marginTop: 8 }}>
                <p style={muted}>{p.cost_price != null && p.cost_price !== '' ? `עלות ${money(p.cost_price)} · רווח ליחידה ${money(Number(p.price) - Number(p.cost_price))}` : 'בלי מחיר עלות'}{p.sku ? ` · ברקוד ${p.sku}` : ''} · התראה ב-{thresholdOf(p)}</p>
                {(p.routine_types || []).length > 0 && <p style={muted}>בשגרה: {ROUTINE_TYPES.filter((t) => p.routine_types.includes(t.key)).map((t) => t.he).join(', ')}</p>}
                {!adj && isActiveProduct(p) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <button type="button" data-testid="product-adjust" style={btn} disabled={isDemo} onClick={() => setAdj({ id: p.id, kind: 'received', qty: '', reason: '', key: newKey() })}>עדכון מלאי</button>
                    <button type="button" style={btn} disabled={isDemo} onClick={() => setForm({ id: p.id, name: p.name, brand: p.brand || '', category: p.category || '', price: String(p.price), cost_price: p.cost_price == null ? '' : String(p.cost_price), sku: p.sku || '', openingStock: '', low_stock_threshold: String(thresholdOf(p)), routine_types: p.routine_types || [] })}>עריכה</button>
                    <button type="button" style={btn} disabled={isDemo || busy} onClick={() => archive(p, true)}>לארכיון</button>
                  </div>
                )}
                {!isActiveProduct(p) && <button type="button" style={{ ...btn, marginTop: 8 }} disabled={isDemo || busy} onClick={() => archive(p, false)}>החזרה לקטלוג</button>}
                {adj && adj.id === p.id && (
                  <div data-testid="adjust-form" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 10, marginTop: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ADJUST_KINDS.map((k) => <button key={k} type="button" style={chip(adj.kind === k)} onClick={() => setAdj({ ...adj, kind: k })}>{ADJUST_HE[k]}</button>)}
                    </div>
                    <label style={label}>{adj.kind === 'count' ? 'כמה ספרת על המדף' : adj.kind === 'received' ? 'כמה יחידות הגיעו' : 'כמה יחידות'}<input style={inp} inputMode="numeric" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value.replace(/\D/g, '') })} /></label>
                    <label style={label}>מה קרה (חובה)<input style={inp} maxLength={200} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder={adj.kind === 'received' ? 'למשל: משלוח מהספק' : adj.kind === 'damaged' ? 'למשל: נפל ונשבר' : 'למשל: ספירה חודשית'} /></label>
                    {adj.kind === 'count' && adj.qty !== '' && <p style={{ ...muted, marginTop: 4 }}>במלאי רשום {stockOf(p)}. אחרי הספירה: {Number(adj.qty)} ({Number(adj.qty) - stockOf(p) >= 0 ? '+' : ''}{Number(adj.qty) - stockOf(p)})</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button type="button" data-testid="adjust-save" style={primary} disabled={busy || adj.qty === '' || !adj.reason.trim()} onClick={adjust}>שמירה ביומן המלאי</button>
                      <button type="button" style={btn} onClick={() => setAdj(null)}>ביטול</button>
                    </div>
                  </div>
                )}
                {ledgerOf(p.id).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ ...muted, fontWeight: 700 }}>יומן מלאי</p>
                    {ledgerOf(p.id).map((l) => (
                      <p key={l.id} style={{ ...muted, display: 'flex', gap: 8 }}>
                        <span style={{ minWidth: 38 }}>{dateHe(l.created_at)}</span>
                        <span style={{ flex: 1 }}>{LEDGER_HE[l.kind] || l.kind}{l.reason && l.kind !== 'sale' && l.kind !== 'void_restore' ? `: ${String(l.reason).replace(/^[^:]+: /, '')}` : ''}</span>
                        <bdi dir="ltr" style={{ fontWeight: 700, color: Number(l.delta) < 0 ? 'var(--danger)' : 'var(--success)' }}>{Number(l.delta) > 0 ? `+${l.delta}` : l.delta}</bdi>
                        <span>← {l.stock_after}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
