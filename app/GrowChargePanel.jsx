'use client';

// app/GrowChargePanel.jsx
//
// In the cashier, after a treatment: "charge by card through Grow". It renders NOTHING unless the business has
// Grow connected and switched on (and the platform is configured), so a cosmetician who never opted in sees no
// change in her cashier.
//
// Pressing it asks Grow for a payment page on HER account and shows the link; nobody is charged until the client
// pays on that page. Nothing is sent from here: she opens or shares the link herself. When the callback marks the
// payment paid the receipt is created for her automatically, so this panel tells her NOT to also press the normal
// "record payment" button for the same visit.

import { useEffect, useRef, useState } from 'react';

const money = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;

export default function GrowChargePanel({ amount, description, client, appointmentId, pc, pcTint, toast, onPaid }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null); // { url, paymentId }
  const [state, setState] = useState('idle'); // idle | waiting | paid
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/grow/status').then((r) => r.json()).then((j) => {
      if (alive && j?.success && j.platform?.configured && j.account?.connected && j.account.enabled) setReady(true);
    }).catch(() => {});
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, []);

  if (!ready) return null;

  const poll = (paymentId) => {
    let tries = 0;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      tries += 1;
      if (tries > 60) { clearInterval(timer.current); return; }
      try {
        const j = await (await fetch('/api/grow/status')).json();
        const p = (j?.payments || []).find((x) => x.id === paymentId);
        if (p && p.status === 'paid' && p.receipt_id) {
          clearInterval(timer.current);
          setState('paid');
          toast?.('התשלום התקבל והקבלה נרשמה');
          onPaid?.(p.receipt_id);
        }
      } catch { /* try again on the next tick */ }
    }, 4000);
  };

  const charge = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/grow/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description, clientName: client?.name || '', phone: client?.phone || '', clientId: client?.id ?? null, appointmentId: appointmentId ?? null }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו לפתוח דף תשלום', 'error'); return; }
      setLink({ url: j.url, paymentId: j.paymentId });
      setState('waiting');
      poll(j.paymentId);
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); toast?.('הקישור הועתק'); } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); }
  };

  return (
    <div data-testid="grow-charge" style={{ background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 10 }}>
      {state === 'idle' && (
        <button type="button" onClick={charge} disabled={busy || !(amount > 0)} className="primary-btn" style={{ width: '100%', padding: '10px 0', background: 'var(--surface)', color: pc, border: `1px solid ${pc}`, fontSize: 'var(--t-sm)', fontWeight: 700 }}>
          {busy ? 'פותחת דף תשלום…' : `חיוב בכרטיס אשראי ${money(amount)}`}
        </button>
      )}
      {state === 'waiting' && link && (
        <div>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>דף התשלום מוכן. הלקוחה משלמת בו, ואת לא צריכה לעשות עוד כלום.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a href={link.url} target="_blank" rel="noreferrer" className="primary-btn" style={{ padding: '8px 12px', background: pc, color: 'var(--pc-contrast)', borderRadius: 'var(--r-sm)', textDecoration: 'none', fontSize: 'var(--t-sm)', fontWeight: 700 }}>פתיחת דף התשלום</a>
            <button type="button" onClick={copy} style={{ padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>העתקת קישור</button>
          </div>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.6 }}>
            ברגע שהתשלום מתקבל, הקבלה נרשמת בקופה אוטומטית. אל תלחצי &quot;רשמי תשלום&quot; על אותו טיפול, כדי לא לרשום פעמיים.
          </p>
        </div>
      )}
      {state === 'paid' && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--success)', fontWeight: 700 }}>התשלום התקבל ✓ הקבלה נרשמה בקופה.</p>}
    </div>
  );
}
