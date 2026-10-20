'use client';
// app/GrowPaymentRequests.jsx
//
// Cashier screen: "בקשת תשלום בקישור". A Grow payment link for one of her clients, for a deposit or the full amount
// (lib/grow/paymentRequest.ts, app/api/grow/payment-request). She sends it from her own WhatsApp; the list below shows each
// request and turns "שולמה" by itself when Grow's callback arrives. Renders NOTHING unless Grow is switched on for this
// deployment and she connected and enabled it, so nobody else sees any change.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { METHOD_LABEL_HE, methodProblem } from '@/lib/grow/methods';
import { isPaymentRequest, isDepositRequest, REQUEST_STATUS_HE } from '@/lib/grow/paymentRequest';

const money = (n) => `₪${Math.round(Number(n) * 100) / 100}`;

export default function GrowPaymentRequests({ clients, pc, pcTint, toast }) {
  const [s, setS] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ clientId: '', amount: '', kind: 'deposit', method: 'card', note: '' });
  const [made, setMade] = useState(null); // { url, waLink, message }

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/grow/status');
      const j = await r.json().catch(() => null);
      setS(r.ok && j?.success ? j : null);
    } catch { setS(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const requests = useMemo(() => (s?.payments || []).filter((p) => isPaymentRequest(p.description)).slice(0, 8), [s]);
  const waiting = requests.some((p) => p.status === 'created');
  // While a request waits for its client, look again every 15 seconds so "שולמה" appears without a reload.
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const ready = s && s.platform?.configured && s.account?.connected && s.account?.enabled;
  if (!ready) return null;

  const methods = Array.isArray(s.methods) && s.methods.length ? s.methods : ['card'];
  const matches = q.trim().length >= 1
    ? (clients || []).filter((c) => c.phone && String(c.name || '').includes(q.trim())).slice(0, 6)
    : [];
  const chosen = (clients || []).find((c) => String(c.id) === String(form.clientId));
  const amount = Number(form.amount);
  const problem = amount > 0 ? methodProblem(form.method, amount) : '';
  const canSend = chosen && amount > 0 && !problem && !busy;

  const create = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const r = await fetch('/api/grow/payment-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: form.clientId, amount, kind: form.kind, method: form.method, note: form.note }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו ליצור את הקישור, נסי שוב', 'error'); return; }
      setMade({ url: j.url, waLink: j.waLink, message: j.message });
      await load();
    } finally { setBusy(false); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast?.('הועתק'); } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); }
  };
  const reset = () => { setMade(null); setForm({ clientId: '', amount: '', kind: 'deposit', method: 'card', note: '' }); setQ(''); };

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14 };
  const chip = (on) => ({ padding: '8px 14px', minHeight: 40, borderRadius: 'var(--r-full)', border: `1px solid ${on ? pc : 'var(--line-2)'}`, background: on ? pcTint : 'transparent', color: 'var(--ink)', fontWeight: on ? 700 : 500, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' });
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const btn = { padding: '10px 14px', minHeight: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };

  return (
    <div data-testid="grow-requests" style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>בקשת תשלום בקישור</p>
        {!open && <button type="button" style={btn} onClick={() => setOpen(true)}>בקשה חדשה</button>}
      </div>
      {s.mode === 'mock' && <p style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>מצב בדיקה: לא נגבה כסף אמיתי</p>}
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 4 }}>קישור לתשלום מאובטח ב-Grow, למקדמה או לסכום מלא. את שולחת אותו מהוואטסאפ שלך, וכשהלקוחה משלמת זה מופיע כאן לבד.</p>

      {open && !made && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {chosen ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: pcTint, borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{chosen.name}</span>
              <button type="button" style={{ ...btn, minHeight: 32, padding: '4px 10px' }} onClick={() => setForm((f) => ({ ...f, clientId: '' }))}>החלפה</button>
            </div>
          ) : (
            <div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לקוחה לפי שם" aria-label="חיפוש לקוחה" style={inp} />
              {matches.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {matches.map((c) => (
                    <button key={c.id} type="button" style={{ ...btn, justifyContent: 'flex-start' }} onClick={() => { setForm((f) => ({ ...f, clientId: String(c.id) })); setQ(''); }}>{c.name}</button>
                  ))}
                </div>
              )}
              {q.trim() && matches.length === 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6 }}>לא נמצאה לקוחה עם טלפון בשם הזה.</p>}
            </div>
          )}
          <div role="radiogroup" aria-label="סוג הבקשה" style={{ display: 'flex', gap: 6 }}>
            <button type="button" role="radio" aria-checked={form.kind === 'deposit'} style={chip(form.kind === 'deposit')} onClick={() => setForm((f) => ({ ...f, kind: 'deposit' }))}>מקדמה</button>
            <button type="button" role="radio" aria-checked={form.kind === 'full'} style={chip(form.kind === 'full')} onClick={() => setForm((f) => ({ ...f, kind: 'full' }))}>תשלום מלא</button>
          </div>
          <input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="סכום ב-₪" aria-label="סכום" inputMode="decimal" style={{ ...inp, direction: 'ltr', textAlign: 'right' }} />
          {methods.length > 1 && (
            <div role="radiogroup" aria-label="איך הלקוחה משלמת" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={form.method === m} style={chip(form.method === m)} onClick={() => setForm((f) => ({ ...f, method: m }))}>{METHOD_LABEL_HE[m] || m}</button>)}
            </div>
          )}
          <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="על מה (לא חובה), למשל: טיפול פנים ביום חמישי" aria-label="על מה" maxLength={40} style={inp} />
          {form.kind === 'deposit' && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6 }}>מקדמה ששולמה נשמרת כקרדיט של הלקוחה, ובקופה מנכים אותה מהטיפול בלחיצה.</p>}
          {problem && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{problem}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={!canSend} onClick={create} style={{ ...btn, background: pc, color: 'var(--pc-contrast, #1F3A30)', border: 'none', opacity: canSend ? 1 : 0.55 }}>{busy ? 'יוצרת קישור…' : 'יצירת קישור לתשלום'}</button>
            <button type="button" style={btn} onClick={() => { setOpen(false); reset(); }}>ביטול</button>
          </div>
        </div>
      )}

      {made && (
        <div data-testid="grow-request-made" style={{ marginTop: 10, background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>הקישור מוכן. שלחי אותו ללקוחה:</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {made.waLink && <a href={made.waLink} target="_blank" rel="noreferrer" style={{ ...btn, background: '#0B7A3E', color: '#fff', border: 'none' }}>שליחה בוואטסאפ</a>}
            <button type="button" style={btn} onClick={() => copy(made.message || made.url)}>העתקת ההודעה</button>
            <button type="button" style={btn} onClick={() => { reset(); setOpen(false); }}>סיום</button>
          </div>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.6 }}>הקישור של Grow בתוקף זמן קצר אחרי שהוא נפתח. אם הלקוחה מגיעה אליו מאוחר, אפשר ליצור קישור חדש.</p>
        </div>
      )}

      {requests.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {requests.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
              <span>{p.client_name || 'לקוחה'} · {isDepositRequest(p.description) ? 'מקדמה' : 'תשלום'} {money(p.amount)}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <b style={{ color: p.status === 'paid' ? 'var(--success)' : 'var(--ink-3)' }}>{REQUEST_STATUS_HE[p.status] || p.status}</b>
                {p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noreferrer" style={{ color: 'var(--pc-text, var(--ink))', fontWeight: 700 }}>קבלה</a>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
