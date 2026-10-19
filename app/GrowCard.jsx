'use client';

// app/GrowCard.jsx
//
// Settings > Connections: card payments through Grow. Opt-in per business; each cosmetician clears to HER OWN
// Grow account (money never passes through Kalmea) and Grow issues the legal receipt.
//
// The whole card is invisible unless the deployment has switched the Grow screens on (GROW_UI_ENABLED, default off): /api/grow/status
// answers 404 and nothing renders. When it is on, the honest states are:
//   - the payment tables are not created yet: says so, offers nothing to press;
//   - not connected: two doors. (a) "I have a Grow account": she pastes her Grow business id (only when the platform can charge).
//     (b) "I don't have Grow yet": she opens Grow's own registration form from here (app/GrowRegistration.jsx), and the card
//         shows waiting / rejected until Grow approves; then it turns connected with clearing on. Where that link is not
//         available, she leaves her name, phone, business name and business id, and we pass them on to Grow;
//   - connected: on/off, a disconnect button, and her last Grow payments with the Grow receipt link inside Kalmea.
// In mock mode (a test run) the card says so: nobody is ever charged.

import { useCallback, useEffect, useState } from 'react';
import CancelPolicyCard from './CancelPolicyCard';
import GrowRegistration from './GrowRegistration';
import { METHOD_LABEL_HE } from '@/lib/grow/methods';

const STATUS_HE = { created: 'ממתין לתשלום', paid: 'שולם', failed: 'נכשל', cancelled: 'בוטל' };
const money = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;

export default function GrowCard({ pc, pcTint, toast, isDemo }) {
  const [s, setS] = useState(null);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState(null); // null | 'have' | 'register' | 'need'
  const [form, setForm] = useState({ name: '', phone: '', businessName: '', businessId: '' });
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/grow/status');
      const j = await r.json().catch(() => null);
      setS(r.ok && j && j.success ? j : { hidden: true });
    } catch { setS({ hidden: true }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (url, method, body, okMsg) => {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'הפעולה נכשלה, נסי שוב', 'error'); return false; }
      if (okMsg) toast?.(okMsg);
      await load();
      return true;
    } finally { setBusy(false); }
  };

  // Opens Grow's registration form in a new tab and shows "waiting" here.
  const startRegistration = async (form) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/grow/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו לפתוח את טופס ההרשמה, נסי שוב', 'error'); return; }
      window.open(j.url, '_blank', 'noopener');
      toast?.('טופס ההרשמה של Grow נפתח בלשונית חדשה');
      setDoor(null);
      await load();
    } finally { setBusy(false); }
  };

  // Nothing until we know the Grow screens are on for this deployment (a 404 or a failed read both mean "hidden").
  if (!s || s.hidden) return null;

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 12 };
  const inp = { flex: 1, minWidth: 0, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)' };
  const ltr = { direction: 'ltr', textAlign: 'left' };
  const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 };
  const ghost = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };
  const primary = { background: pcTint, border: `1px dashed ${pc}`, borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--pc-text, var(--ink))', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };
  const formOk = form.name.trim().length >= 2 && form.phone.replace(/\D/g, '').length >= 9 && form.businessName.trim().length >= 2 && /^\d{8,9}$/.test(form.businessId.replace(/\D/g, ''));

  let body;
  if (s.tableReady === false) {
    body = <p style={text}>הסליקה בכרטיס אשראי דרך Grow עוד לא הופעלה בחשבון. נעדכן כשהיא זמינה, ועד אז הקופה ממשיכה לעבוד כרגיל.</p>;
  } else if (s.account.connected) {
    body = (
      <>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: isDemo ? 'default' : 'pointer', minHeight: 44 }}>
          <input type="checkbox" checked={s.account.enabled} disabled={busy || isDemo} onChange={(e) => call('/api/grow/account', 'POST', { enabled: e.target.checked }, 'נשמר')} style={{ accentColor: pc, width: 20, height: 20 }} />
          <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>חיוב בכרטיס אשראי מהקופה <span style={{ color: 'var(--ink-3)' }}>({s.account.userIdMasked})</span></span>
        </label>
        {!s.platform.configured && <p style={{ ...text, marginTop: 6 }}>החיבור שלך שמור. הסליקה עצמה תתחיל לעבוד ברגע שהיא תופעל במערכת.</p>}
        {s.platform.configured && Array.isArray(s.methods) && s.methods.length > 0 && (
          <p data-testid="grow-methods" style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6 }}>לקוחות יכולות לשלם ב: {s.methods.map((m) => METHOD_LABEL_HE[m] || m).join(' · ')}</p>
        )}
        {s.payments.length > 0 ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.payments.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', background: pcTint, borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
                <span>{p.client_name || 'לקוחה'} · {money(p.amount)}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <b style={{ color: p.status === 'paid' ? 'var(--success)' : 'var(--ink-3)' }}>{STATUS_HE[p.status] || p.status}</b>
                  {p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noreferrer" style={{ color: 'var(--pc-text, var(--ink))', fontWeight: 700 }}>קבלה</a>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8 }}>עוד לא היו חיובים. בקופה יופיע כפתור &quot;חיוב בכרטיס אשראי&quot;.</p>
        )}
        <CancelPolicyCard pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemo} />
        {!isDemo && (
          <div style={{ marginTop: 12 }}>
            {!confirmOff ? (
              <button type="button" style={ghost} onClick={() => setConfirmOff(true)}>ניתוק מ-Grow</button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={text}>לנתק? התשלומים והקבלות שכבר נרשמו נשארים.</span>
                <button type="button" style={ghost} disabled={busy} onClick={async () => { if (await call('/api/grow/account', 'DELETE', null, 'Grow נותקה')) setConfirmOff(false); }}>כן, לנתק</button>
                <button type="button" style={ghost} onClick={() => setConfirmOff(false)}>ביטול</button>
              </div>
            )}
          </div>
        )}
      </>
    );
  } else if ((s.registration && door !== 'need') || door === 'register') {
    body = (
      <>
        <GrowRegistration registration={door === 'register' ? null : s.registration} pc={pc} pcTint={pcTint} isDemo={isDemo} busy={busy} onStart={startRegistration} onFallback={() => setDoor('need')} />
        {door === 'register' && <div style={{ marginTop: 8 }}><button type="button" style={ghost} onClick={() => setDoor(null)}>חזרה</button></div>}
      </>
    );
  } else if (s.request?.sent && door !== 'need') {
    body = (
      <>
        <p style={text}>קיבלנו את הפרטים שלך ונעביר אותם ל-Grow. כשהחשבון מוכן, תקבלי ממנה מזהה עסק: חזרי לכאן והדביקי אותו.</p>
        {!isDemo && s.platform.configured && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={userId} onChange={(e) => setUserId(e.target.value.trim())} placeholder="מזהה עסק ב-Grow" aria-label="מזהה עסק ב-Grow" style={{ ...inp, ...ltr }} />
            <button type="button" disabled={busy || userId.length < 4} onClick={async () => { if (await call('/api/grow/account', 'POST', { userId, enabled: true }, 'נשמר')) setUserId(''); }} style={primary}>חיבור</button>
          </div>
        )}
        <div style={{ marginTop: 8 }}><button type="button" style={ghost} onClick={() => setDoor('need')}>לעדכן את הפרטים ששלחתי</button></div>
      </>
    );
  } else if (door === 'have') {
    body = (
      <>
        <p style={{ ...text, marginBottom: 10 }}>הדביקי את מזהה העסק שקיבלת מ-Grow. את סולקת לחשבון שלך, ו-Grow מפיקה את הקבלה החוקית.</p>
        {!isDemo && (s.platform.configured ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={userId} onChange={(e) => setUserId(e.target.value.trim())} placeholder="מזהה עסק ב-Grow" aria-label="מזהה עסק ב-Grow" style={{ ...inp, ...ltr }} />
            <button type="button" disabled={busy || userId.length < 4} onClick={async () => { if (await call('/api/grow/account', 'POST', { userId, enabled: true }, 'נשמר')) setUserId(''); }} style={primary}>חיבור</button>
          </div>
        ) : (
          <p style={text}>החיבור עוד לא פתוח במערכת. כשיהיה, תוכלי להדביק את המזהה כאן.</p>
        ))}
        <div style={{ marginTop: 8 }}><button type="button" style={ghost} onClick={() => setDoor(null)}>חזרה</button></div>
      </>
    );
  } else if (door === 'need') {
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    body = (
      <>
        <p style={{ ...text, marginBottom: 10 }}>נשאיר ל-Grow את הפרטים שלך והם ייצרו איתך קשר לפתיחת חשבון. אין כאן כרטיס אשראי ואין חיוב.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={form.name} onChange={set('name')} placeholder="שם מלא" aria-label="שם מלא" autoComplete="name" style={inp} />
          <input value={form.phone} onChange={set('phone')} placeholder="נייד" aria-label="נייד" inputMode="tel" autoComplete="tel" style={{ ...inp, ...ltr }} />
          <input value={form.businessName} onChange={set('businessName')} placeholder="שם העסק" aria-label="שם העסק" style={inp} />
          <input value={form.businessId} onChange={set('businessId')} placeholder="מספר עוסק או ח.פ." aria-label="מספר עוסק או ח.פ." inputMode="numeric" style={{ ...inp, ...ltr }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy || isDemo || !formOk} onClick={async () => { if (await call('/api/grow/request', 'POST', form, 'הפרטים נשלחו')) setDoor(null); }} style={primary}>{busy ? 'שולחת…' : 'שליחת הפרטים'}</button>
          <button type="button" style={ghost} onClick={() => setDoor(null)}>חזרה</button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p style={{ ...text, marginBottom: 10 }}>את סולקת לחשבון ה-Grow שלך, ו-Grow מפיקה את הקבלה החוקית. הקבלות והתשלומים יופיעו גם כאן.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={primary} onClick={() => setDoor('have')}>יש לי חשבון Grow</button>
          <button type="button" style={ghost} onClick={() => setDoor(s.registrationAvailable ? 'register' : 'need')}>אין לי עדיין Grow</button>
        </div>
      </>
    );
  }

  return (
    <div data-testid="grow-card" style={box}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>סליקת אשראי (Grow)</p>
      {s.mode === 'mock' && <p data-testid="grow-mock" style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink)', background: 'var(--brand-tint, #FBEDE9)', borderRadius: 'var(--r-sm)', padding: '6px 10px', marginBottom: 8 }}>מצב בדיקה: לא נגבה כסף אמיתי</p>}
      {body}
    </div>
  );
}
