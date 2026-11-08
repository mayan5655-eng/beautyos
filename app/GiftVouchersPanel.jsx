'use client';
// app/GiftVouchersPanel.jsx
//
// Cashier screen: "שוברי מתנה". Her vouchers (sold online or here), each with its balance, expiry and status; selling one in person
// (a till sale with its own receipt, app/api/vouchers action 'sell'); voiding one (recorded, never deleted); and the wa.me link to
// hand a voucher over. On for every business by default (lib/giftVouchers.ts giftVouchersVisible: only an explicit false hides it).
// Before the migration runs it renders nothing at all (owner decision, 2026-11-08).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  giftVouchersVisible, voucherConfig, voucherStatus, STATUS_HE, formatCode, voucherTitle, dateHe, voucherShareText, waShareLink,
  MIN_AMOUNT, MAX_AMOUNT,
} from '@/lib/giftVouchers';

const money = (n) => `₪${(Math.round(Number(n) * 100) / 100).toLocaleString('he-IL')}`;
const METHODS = ['מזומן', 'אשראי', 'ביט', 'פייבוקס', 'העברה'];
const newKey = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
const EMPTY = { option: '', amount: '', method: 'מזומן', buyerName: '', buyerPhone: '', recipientName: '', message: '' };

export default function GiftVouchersPanel({ settings, services, pc, pcTint, toast, isDemo, onReceipt }) {
  const visible = giftVouchersVisible(settings);
  const cfg = useMemo(() => voucherConfig(settings), [settings]);
  const [data, setData] = useState(null); // { ready, vouchers, ledger } | { needsMigration, error }
  const [filter, setFilter] = useState('active');
  const [selling, setSelling] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saleKey, setSaleKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [sold, setSold] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [voidFor, setVoidFor] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/vouchers');
      const j = await r.json().catch(() => null);
      if (j?.needsMigration) { setData({ needsMigration: true, error: j.error }); return; }
      setData(r.ok && j?.success ? j : { error: j?.error || 'לא הצלחנו לטעון את השוברים' });
    } catch { setData({ error: 'לא הצלחנו לטעון את השוברים' }); }
  }, []);
  useEffect(() => { if (visible) load(); }, [visible, load]);
  // "מכירה בקופה" from the marketing card (app/GiftVoucherMarketingCard.jsx) lands here with the sale form open.
  useEffect(() => {
    if (!data?.ready) return;
    try { if (sessionStorage.getItem('kalmea:voucher-sell') === '1') { sessionStorage.removeItem('kalmea:voucher-sell'); setSelling(true); setSold(null); setTimeout(() => document.querySelector('[data-testid="gift-vouchers"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); } } catch { /* private mode: she taps "מכירת שובר" */ }
  }, [data?.ready]);

  // Before the migration runs nothing shows at all (owner decision, 2026-11-08): no sentence about a missing update.
  if (!visible || data?.needsMigration) return null;

  const options = (() => {
    const out = cfg.amounts.map((a) => ({ key: `a:${a}`, label: money(a) }));
    for (const id of cfg.services) {
      const s = (services || []).find((x) => String(x.id) === id);
      if (s && s.active !== false && Number(s.price) > 0) out.push({ key: `s:${id}`, label: `${s.name} (${money(s.price)})` });
    }
    return out;
  })();
  const now = new Date();
  const vouchers = data?.vouchers || [];
  const counts = { active: 0, used: 0, expired: 0, void: 0 };
  let outstanding = 0;
  for (const v of vouchers) { const st = voucherStatus(v, now); counts[st]++; if (st === 'active') outstanding += Number(v.balance) || 0; }
  const shown = vouchers.filter((v) => filter === 'all' || voucherStatus(v, now) === filter);
  const ledgerOf = (id) => (data?.ledger || []).filter((l) => String(l.voucher_id) === String(id));

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14 };
  const chip = (on) => ({ padding: '8px 12px', minHeight: 40, borderRadius: 'var(--r-full)', border: `1px solid ${on ? pc : 'var(--line-2)'}`, background: on ? pcTint : 'transparent', color: 'var(--ink)', fontWeight: on ? 700 : 500, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' });
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const btn = { padding: '10px 14px', minHeight: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
  const primary = { ...btn, background: pc, color: 'var(--pc-contrast, #1F3A30)', border: 'none' };

  const amountOk = form.option || (Number(form.amount) >= MIN_AMOUNT && Number(form.amount) <= MAX_AMOUNT);
  const canSell = !busy && amountOk && form.buyerName.trim() && !isDemo;

  const sell = async () => {
    if (!canSell) return;
    setBusy(true);
    try {
      const r = await fetch('/api/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'sell', saleKey, option: form.option || undefined, amount: form.option ? undefined : Number(form.amount), paymentMethod: form.method,
        buyerName: form.buyerName, buyerPhone: form.buyerPhone, recipientName: form.recipientName, message: form.message,
      }) });
      const j = await r.json().catch(() => null);
      // A failed sale gets a fresh key: a retry is a NEW sale, never the old one handed back (the server voids a half-written one).
      if (!r.ok || !j?.success) { if (j?.retryWithNewSale === true) setSaleKey(newKey()); /* same key on a 500 or a sale still being written: the retry finds that voucher, never a second one */ toast?.(j?.error || 'לא הצלחנו למכור את השובר. שום דבר לא נרשם, אפשר לנסות שוב.', 'error'); await load(); return; }
      if (j.receipt) onReceipt?.(j.receipt);
      setSold(j.voucher);
      setSelling(false); setForm(EMPTY); setSaleKey(newKey());
      toast?.(`השובר נמכר ונרשם בקופה, ${money(j.voucher?.initial_amount)}`);
      await load();
    } finally { setBusy(false); }
  };

  const doVoid = async (v) => {
    if (!voidReason.trim()) { toast?.('כתבי בקצרה למה מבטלים, זה נשמר ברישום', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void', voucherId: v.id, reason: voidReason }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו לבטל, נסי שוב', 'error'); return; }
      toast?.('השובר בוטל. הוא נשאר ברשימה עם הסיבה.');
      setVoidFor(null); setVoidReason('');
      await load();
    } finally { setBusy(false); }
  };

  const reverse = async (l) => {
    setBusy(true);
    try {
      const r = await fetch('/api/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reverse', ledgerId: l.id }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו להחזיר את הסכום', 'error'); return; }
      toast?.(`הסכום הוחזר לשובר. היתרה עכשיו ${money(j.balance)}`);
      await load();
    } finally { setBusy(false); }
  };

  const linkOf = (v) => (typeof window !== 'undefined' ? `${window.location.origin}/v/${v.token}` : `/v/${v.token}`);
  const share = (v) => waShareLink(voucherShareText({ businessName: settings?.business_name || '', recipientName: v.recipient_name || '', url: linkOf(v) }));

  return (
    <div data-testid="gift-vouchers" style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>🎁 שוברי מתנה</p>
        {data?.ready && !selling && <button type="button" data-testid="voucher-sell-open" style={btn} onClick={() => { setSelling(true); setSold(null); }}>מכירת שובר</button>}
      </div>

      {!data && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginTop: 6 }}>טוענת…</p>}
      {data && !data.ready && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 6 }}>{data.error} <button type="button" style={{ ...btn, minHeight: 32, padding: '4px 10px' }} onClick={load}>לנסות שוב</button></p>}

      {data?.ready && (
        <>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 4 }}>
            {counts.active > 0 ? `${counts.active} שוברים פעילים, יתרה פתוחה ${money(outstanding)}. ` : 'עוד אין שוברים פעילים. '}
            כסף על שובר נספר בהכנסות ביום שנמכר. כשמממשים אותו בקופה הוא יורד מהתשלום, ולא נספר שוב.
          </p>

          {selling && (
            <div data-testid="voucher-sell-form" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 12 }}>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>על מה השובר?</p>
              <div role="radiogroup" aria-label="סוג השובר" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {options.map((o) => <button key={o.key} type="button" role="radio" aria-checked={form.option === o.key} style={chip(form.option === o.key)} onClick={() => setForm((f) => ({ ...f, option: o.key, amount: '' }))}>{o.label}</button>)}
                <button type="button" role="radio" aria-checked={!form.option} style={chip(!form.option)} onClick={() => setForm((f) => ({ ...f, option: '' }))}>סכום אחר</button>
              </div>
              {!form.option && <input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder={`סכום ב-₪, בין ${MIN_AMOUNT} ל-${MAX_AMOUNT}`} aria-label="סכום השובר" inputMode="decimal" style={{ ...inp, direction: 'ltr', textAlign: 'right' }} />}
              <input value={form.buyerName} onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))} placeholder="מי קונה (שם)" aria-label="שם הקונה" maxLength={60} style={inp} />
              <input value={form.buyerPhone} onChange={(e) => setForm((f) => ({ ...f, buyerPhone: e.target.value }))} placeholder="הטלפון שלה (לא חובה)" aria-label="טלפון הקונה" inputMode="tel" style={{ ...inp, direction: 'ltr', textAlign: 'right' }} />
              <input value={form.recipientName} onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))} placeholder="למי השובר (לא חובה)" aria-label="שם המקבלת" maxLength={60} style={inp} />
              <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="ברכה קצרה (לא חובה)" aria-label="ברכה" maxLength={300} rows={2} style={{ ...inp, minHeight: 64, resize: 'vertical' }} />
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>איך שילמו?</p>
              <div role="radiogroup" aria-label="אמצעי תשלום" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {METHODS.map((m) => <button key={m} type="button" role="radio" aria-checked={form.method === m} style={chip(form.method === m)} onClick={() => setForm((f) => ({ ...f, method: m }))}>{m}</button>)}
              </div>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: 0 }}>בתוקף {cfg.validityMonths} חודשים מהיום. התשלום נרשם בקופה כמכירת שובר, לא כטיפול, ולא נספר בכרטיסיית הנאמנות.</p>
              {isDemo && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>זו תצוגה. במערכת שלך המכירה נרשמת באמת.</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" data-testid="voucher-sell" disabled={!canSell} onClick={sell} style={{ ...primary, opacity: canSell ? 1 : 0.55 }}>{busy ? 'רושמת…' : 'מכירה ורישום תשלום'}</button>
                <button type="button" style={btn} onClick={() => { setSelling(false); setForm(EMPTY); }}>ביטול</button>
              </div>
            </div>
          )}

          {sold && (
            <div data-testid="voucher-sold" style={{ marginTop: 10, background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>השובר מוכן, קוד <span dir="ltr">{formatCode(sold.code)}</span></p>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: '0 0 8px', lineHeight: 1.6 }}>אפשר לשלוח לקונה את הדף של השובר, והיא תעביר אותו הלאה. שום דבר לא נשלח לבד.</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <a href={share(sold)} target="_blank" rel="noreferrer" style={{ ...btn, background: '#0B7A3E', color: '#fff', border: 'none' }}>שליחה בוואטסאפ</a>
                <a href={`/v/${sold.token}`} target="_blank" rel="noreferrer" style={btn}>לדף השובר</a>
                <button type="button" style={btn} onClick={() => setSold(null)}>סיום</button>
              </div>
            </div>
          )}

          {vouchers.length > 0 && (
            <div role="tablist" aria-label="סינון" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {[['active', 'פעילים'], ['used', 'נוצלו'], ['expired', 'פג תוקף'], ['void', 'בוטלו'], ['all', 'הכל']].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} style={chip(filter === k)} onClick={() => setFilter(k)}>{l}{k !== 'all' ? ` (${counts[k]})` : ''}</button>
              ))}
            </div>
          )}

          <div data-testid="voucher-list" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.length === 0 && vouchers.length > 0 && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>אין שוברים כאן.</p>}
            {shown.map((v) => {
              const st = voucherStatus(v, now);
              const open = openId === v.id;
              const led = ledgerOf(v.id);
              const reversed = new Set(led.filter((l) => l.kind === 'reverse').map((l) => String(l.reverses_id)));
              return (
                <div key={v.id} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', border: '1px solid var(--line)' }}>
                  <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : v.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', alignItems: 'center' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, color: 'var(--ink)', fontSize: 'var(--t-sm)' }}>{voucherTitle(v)}{v.recipient_name ? ` · ל${v.recipient_name}` : ''}</span>
                      <span style={{ display: 'block', fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 2 }}>
                        <span dir="ltr">{formatCode(v.code)}</span> · {v.sold_via === 'online' ? 'נקנה אונליין' : 'נמכר בקופה'} · עד {dateHe(v.expires_at)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'left', flexShrink: 0 }}>
                      <span style={{ display: 'block', fontFamily: "var(--font-frank),'Frank Ruhl Libre',serif", fontWeight: 700, color: 'var(--ink)' }}>{money(v.balance)}</span>
                      <span style={{ display: 'block', fontSize: 'var(--t-xs)', fontWeight: 700, color: st === 'active' ? 'var(--success)' : 'var(--ink-3)' }}>{STATUS_HE[st]}</span>
                    </span>
                  </button>
                  {open && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.7 }}>
                      <p style={{ margin: 0 }}>נמכר ב-{dateHe(v.created_at)}{v.buyer_name ? ` ל${v.buyer_name}` : ''}{v.buyer_phone ? <> · <span dir="ltr">{v.buyer_phone}</span></> : null}</p>
                      {v.message && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>״{v.message}״</p>}
                      {v.status === 'void' && <p style={{ margin: '4px 0 0', color: 'var(--danger)' }}>בוטל ב-{dateHe(v.voided_at)}: {v.void_reason}</p>}
                      {led.filter((l) => l.kind === 'redeem' || l.kind === 'reverse').map((l) => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 4 }}>
                          <span>{dateHe(l.created_at)} · {l.kind === 'redeem' ? `מומש ${money(-Number(l.amount))}` : `הוחזר ${money(l.amount)}`}{l.kind === 'redeem' && !l.receipt_id && !reversed.has(String(l.id)) ? ' · בלי תשלום רשום' : ''}</span>
                          {l.kind === 'redeem' && !l.receipt_id && !reversed.has(String(l.id)) && !isDemo && <button type="button" disabled={busy} style={{ ...btn, minHeight: 32, padding: '4px 10px' }} onClick={() => reverse(l)}>החזרה לשובר</button>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {st === 'active' && <a href={share(v)} target="_blank" rel="noreferrer" style={{ ...btn, minHeight: 36, padding: '6px 12px', background: '#0B7A3E', color: '#fff', border: 'none' }}>שליחה בוואטסאפ</a>}
                        <a href={`/v/${v.token}`} target="_blank" rel="noreferrer" style={{ ...btn, minHeight: 36, padding: '6px 12px' }}>לדף השובר</a>
                        {v.status !== 'void' && !isDemo && voidFor !== v.id && <button type="button" style={{ ...btn, minHeight: 36, padding: '6px 12px', color: 'var(--danger)' }} onClick={() => { setVoidFor(v.id); setVoidReason(''); }}>ביטול השובר</button>}
                      </div>
                      {voidFor === v.id && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="למה מבטלים? (נשמר ברישום)" aria-label="סיבת הביטול" maxLength={200} style={inp} />
                          <p style={{ margin: 0 }}>השובר יפסיק לעבוד בקופה ובדף שלו. הוא לא נמחק, והתשלום שנרשם עליו לא משתנה. אם צריך להחזיר כסף, מבטלים גם את התשלום בקופה.</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" disabled={busy} style={{ ...btn, background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={() => doVoid(v)}>לבטל את השובר</button>
                            <button type="button" style={btn} onClick={() => setVoidFor(null)}>חזרה</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
