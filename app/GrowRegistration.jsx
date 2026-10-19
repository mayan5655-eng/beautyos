'use client';
// app/GrowRegistration.jsx
//
// Inside the Grow card (app/GrowCard.jsx), for a business with no Grow account: open one from here, through Grow's own
// registration form (lib/grow/registration.ts). Three honest states after she starts:
//   waiting   the request is with Grow; a link back to the form in case she did not finish it
//   rejected  Grow said no, with Grow's words when it gave any; she can try again or leave details instead
//   (approved never shows here: the card switches to "connected" by itself, with clearing on)
// When the registration link is not available on this deployment the card keeps the older "leave your details" form.
import { useState } from 'react';

export default function GrowRegistration({ registration, pc, pcTint, isDemo, busy, onStart, onFallback }) {
  const [form, setForm] = useState({ fullName: '', phone: '', businessName: '', email: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 };
  const inp = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const ltr = { direction: 'ltr', textAlign: 'left' };
  const primary = { background: pcTint, border: `1px solid ${pc}`, borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--pc-text, var(--ink))', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
  const ghost = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };
  const ok = form.fullName.trim().split(/\s+/).length >= 2 && form.phone.replace(/\D/g, '').length >= 9 && form.businessName.trim().length >= 2;

  if (registration && registration.status === 'waiting') {
    return (
      <div data-testid="grow-reg-waiting">
        <p style={{ ...text, fontWeight: 700, color: 'var(--ink)' }}>⏳ הבקשה לפתיחת חשבון אצל Grow</p>
        <p style={text}>Grow בודקת את הפרטים, בדרך כלל תוך כמה ימי עבודה. כשהחשבון יאושר, הסליקה תופעל כאן לבד ונודיע לך.</p>
        {registration.url && (
          <p style={{ ...text, marginTop: 6 }}>לא סיימת למלא את הטופס? <a href={registration.url} target="_blank" rel="noreferrer" style={{ color: 'var(--pc-text, var(--ink))', fontWeight: 700 }}>להמשיך את ההרשמה</a></p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="grow-reg-form">
      {registration && registration.status === 'rejected' && (
        <div data-testid="grow-reg-rejected" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 10 }}>
          <p style={{ ...text, fontWeight: 700, color: 'var(--ink)' }}>Grow לא אישרה את פתיחת החשבון</p>
          {registration.message && <p style={text}>מה שנמסר מ-Grow: {registration.message}</p>}
          <p style={text}>אפשר לנסות שוב עם פרטים מעודכנים, או להשאיר פרטים ונעזור.</p>
        </div>
      )}
      <p style={{ ...text, marginBottom: 10 }}>פותחים חשבון סליקה ב-Grow בטופס של Grow עצמה. אחרי האישור, הסליקה נפתחת כאן אוטומטית: התשלומים נכנסים לחשבון שלך, ו-Grow מפיקה את הקבלה.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={form.fullName} onChange={set('fullName')} placeholder="שם פרטי ושם משפחה" aria-label="שם פרטי ושם משפחה" autoComplete="name" style={inp} />
        <input value={form.phone} onChange={set('phone')} placeholder="נייד" aria-label="נייד" inputMode="tel" autoComplete="tel" style={{ ...inp, ...ltr }} />
        <input value={form.businessName} onChange={set('businessName')} placeholder="שם העסק" aria-label="שם העסק" style={inp} />
        <input value={form.email} onChange={set('email')} placeholder="אימייל (לא חובה)" aria-label="אימייל" inputMode="email" autoComplete="email" style={{ ...inp, ...ltr }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || isDemo || !ok} onClick={() => onStart(form)} style={{ ...primary, opacity: busy || isDemo || !ok ? 0.6 : 1 }}>{busy ? 'פותחת את הטופס…' : 'פתיחת חשבון ב-Grow'}</button>
        <button type="button" style={ghost} onClick={onFallback}>להשאיר פרטים במקום</button>
      </div>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.6 }}>הטופס נפתח בלשונית חדשה, באתר של Grow. אין כאן כרטיס אשראי ואין חיוב.</p>
    </div>
  );
}
