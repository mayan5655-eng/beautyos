'use client';

// app/GrowCard.jsx
//
// Settings > Connections: card payments through Grow. Opt-in per business; each cosmetician clears to HER OWN
// Grow account (money never passes through Kalmea) and Grow issues the legal receipt.
//
// Three honest states:
//   - the platform is not connected yet (Kalmea's own Grow credentials are not in the environment): says so, in
//     her words, and offers nothing to press;
//   - the platform is ready but she has not connected: asks for her Grow business id and a switch;
//   - connected: on/off, and her last Grow payments with the legal-receipt link inside Kalmea.

import { useCallback, useEffect, useState } from 'react';

const STATUS_HE = { created: 'ממתין לתשלום', paid: 'שולם', failed: 'נכשל', cancelled: 'בוטל' };
const money = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;

export default function GrowCard({ pc, pcTint, toast, isDemo }) {
  const [s, setS] = useState(null);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/grow/status');
      const j = await r.json();
      setS(j && j.success ? j : { failed: true });
    } catch { setS({ failed: true }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (body) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/grow/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'השמירה נכשלה', 'error'); return; }
      toast?.('נשמר');
      setUserId('');
      await load();
    } finally { setBusy(false); }
  };

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 12 };
  const inp = { flex: 1, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: 'ltr', textAlign: 'left', background: 'var(--surface-2)' };

  let body;
  if (!s) body = <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>טוענת…</p>;
  else if (s.failed) body = <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>לא הצלחנו לטעון את מצב Grow כרגע.</p>;
  else if (!s.platform.configured || s.tableReady === false) {
    body = (
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }}>
        הסליקה בכרטיס אשראי דרך Grow עוד לא מחוברת במערכת. כשהיא תהיה זמינה תוכלי להפעיל אותה כאן, והכסף ייכנס ישירות לחשבון ה-Grow שלך.
        עד אז הקופה ממשיכה לעבוד כרגיל.
      </p>
    );
  } else if (!s.account.connected) {
    body = (
      <>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 10 }}>
          את סולקת לחשבון ה-Grow שלך, ו-Grow מפיקה את הקבלה החוקית. הקבלות והתשלומים יופיעו גם כאן. כדי להתחיל, הדביקי את מזהה העסק שקיבלת מ-Grow.
        </p>
        {!isDemo && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={userId} onChange={(e) => setUserId(e.target.value.trim())} placeholder="מזהה עסק ב-Grow" aria-label="מזהה עסק ב-Grow" style={inp} />
            <button type="button" disabled={busy || userId.length < 4} onClick={() => save({ userId, enabled: true })} style={{ background: pcTint, border: `1px dashed ${pc}`, borderRadius: 'var(--r-sm)', padding: '0 14px', color: pc, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>חיבור</button>
          </div>
        )}
      </>
    );
  } else {
    body = (
      <>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: isDemo ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={s.account.enabled} disabled={busy || isDemo} onChange={(e) => save({ enabled: e.target.checked })} style={{ accentColor: pc }} />
          <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>חיוב בכרטיס אשראי מהקופה <span style={{ color: 'var(--ink-3)' }}>({s.account.userIdMasked})</span></span>
        </label>
        {s.payments.length > 0 ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.payments.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', background: pcTint, borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
                <span>{p.client_name || 'לקוחה'} · {money(p.amount)}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <b style={{ color: p.status === 'paid' ? 'var(--success)' : 'var(--ink-3)' }}>{STATUS_HE[p.status] || p.status}</b>
                  {p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noreferrer" style={{ color: pc, fontWeight: 700 }}>קבלה</a>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8 }}>עוד לא היו חיובים. בקופה יופיע כפתור &quot;חיוב בכרטיס אשראי&quot;.</p>
        )}
      </>
    );
  }

  return (
    <div data-testid="grow-card" style={box}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>סליקת אשראי (Grow)</p>
      {body}
    </div>
  );
}
