'use client';
// app/GrowRegistration.jsx
//
// Inside the Grow card (app/GrowCard.jsx), for a business with no Grow account: open one from here, through Grow's lead
// registration (GetLink, lib/grow/registration.ts). She types her ID / business number and her mobile; Grow texts the form
// link to that mobile, and she fills it from that phone (or right here, in Grow's form inside the card).
// States after she starts:
//   waiting   the request is with Grow; she can open the form here, or fix a wrong mobile (same business number, right
//             mobile: Grow updates the same lead)
//   rejected  Grow said no, with Grow's words when it gave any; she can try again or leave details instead
//   (approved never shows here: the card switches to "connected" by itself, with clearing on)
// Grow's GetLink errors come back in plain Hebrew; "already has a Grow account" (149) offers the "I have Grow" door.
import { useEffect, useRef, useState } from 'react';

const digits = (v) => String(v || '').replace(/\D/g, '');

/** Grow's form in an iframe posts { action: 'success' | 'close', source: 'growRegister' }. Only from the form's own origin. */
function GrowFormFrame({ url, onSuccess, onClose }) {
  const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
  const cb = useRef({ onSuccess, onClose });
  useEffect(() => { cb.current = { onSuccess, onClose }; });
  useEffect(() => {
    const onMsg = (e) => {
      if (!origin || e.origin !== origin) return;
      let d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      if (!d || d.source !== 'growRegister') return;
      if (d.action === 'success') cb.current.onSuccess();
      else if (d.action === 'close') cb.current.onClose();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [origin]);
  if (!origin) return null;
  return (
    <div data-testid="grow-reg-frame" style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: '#fff' }}>
      <iframe src={url} title="טופס ההרשמה של Grow" style={{ width: '100%', height: 640, border: 0, display: 'block' }} />
      <button type="button" onClick={onClose} style={{ width: '100%', minHeight: 44, border: 0, borderTop: '1px solid var(--line-2)', background: 'var(--surface-2)', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>סגירת הטופס</button>
    </div>
  );
}

export default function GrowRegistration({ registration, pc, pcTint, isDemo, busy, onStart, onFallback, onHaveAccount, onFormDone, frameOrigin }) {
  const [form, setForm] = useState({ businessNumber: '', phone: '' });
  const [failure, setFailure] = useState(null); // { code, error, growId }
  const [sent, setSent] = useState(null); // { phoneMasked, url } right after a successful GetLink
  const [fixPhone, setFixPhone] = useState(false);
  const [frame, setFrame] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 };
  const inp = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const ltr = { direction: 'ltr', textAlign: 'left' };
  const primary = { background: pcTint, border: `1px solid ${pc}`, borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--pc-text, var(--ink))', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
  const ghost = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };
  const bn = digits(form.businessNumber);
  const ph0 = digits(form.phone);
  const ph = ph0.startsWith('972') ? '0' + ph0.slice(3) : ph0;
  const ok = bn.length >= 5 && bn.length <= 9 && /^05\d{8}$/.test(ph);

  const start = async () => {
    setFailure(null);
    const r = await onStart({ businessNumber: bn, phone: ph });
    if (!r) return;
    if (r.success) { setSent({ phoneMasked: r.phoneMasked || '', url: r.url || '' }); setFixPhone(false); }
    else setFailure({ code: r.code || '', error: r.error || 'לא הצלחנו לפתוח את ההרשמה, נסי שוב', growId: r.growId || '' });
  };

  const fields = (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={form.businessNumber} onChange={set('businessNumber')} placeholder="תעודת זהות או מספר עוסק" aria-label="תעודת זהות או מספר עוסק" inputMode="numeric" autoComplete="off" style={{ ...inp, ...ltr }} />
        <input value={form.phone} onChange={set('phone')} placeholder="נייד (05X-XXXXXXX)" aria-label="נייד" inputMode="tel" autoComplete="tel" style={{ ...inp, ...ltr }} />
      </div>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.6 }}>
        Grow תשלח SMS עם קישור לטופס לנייד הזה. חשוב: למלא את הטופס מהטלפון הזה עצמו.
      </p>
      {failure && (
        <div data-testid="grow-reg-error" role="alert" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: 8 }}>
          <p style={{ ...text, color: 'var(--ink)', fontWeight: 700 }}>{failure.error}</p>
          {failure.code === 'exists' && onHaveAccount && (
            <button type="button" style={{ ...primary, marginTop: 8 }} onClick={onHaveAccount}>יש לי חשבון Grow</button>
          )}
          {failure.growId && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 4 }}>קוד מ-Grow: {failure.growId}</p>}
        </div>
      )}
    </>
  );

  const waiting = sent || (registration && registration.status === 'waiting');
  if (waiting && !fixPhone) {
    const url = (sent && sent.url) || (registration && registration.url) || '';
    // In the card only when the page's CSP allows exactly that origin; otherwise Grow's own page in a new tab.
    const canFrame = (() => { try { return !!url && !!frameOrigin && new URL(url).origin === frameOrigin; } catch { return false; } })();
    return (
      <div data-testid="grow-reg-waiting">
        <p style={{ ...text, fontWeight: 700, color: 'var(--ink)' }}>⏳ הבקשה לפתיחת חשבון אצל Grow</p>
        <p style={text}>
          {sent && sent.phoneMasked
            ? <>Grow שולחת SMS לנייד <span dir="ltr">{sent.phoneMasked}</span> עם קישור לטופס. כדאי למלא אותו מהטלפון הזה.</>
            : 'Grow שלחה SMS עם קישור לטופס.'}
          {' '}אחרי שתמלאי, Grow בודקת את הפרטים, בדרך כלל תוך כמה ימי עבודה. כשהחשבון יאושר, הסליקה תופעל כאן לבד.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {canFrame && !frame && <button type="button" style={primary} onClick={() => setFrame(true)}>למלא את הטופס כאן</button>}
          {url && !canFrame && <a href={url} target="_blank" rel="noreferrer" style={primary}>לפתוח את הטופס</a>}
          <button type="button" style={ghost} onClick={() => { setFixPhone(true); setFrame(false); }}>הנייד לא נכון?</button>
        </div>
        {canFrame && frame && (
          <GrowFormFrame url={url} onClose={() => setFrame(false)} onSuccess={() => { setFrame(false); onFormDone?.(); }} />
        )}
      </div>
    );
  }

  if (fixPhone) {
    return (
      <div data-testid="grow-reg-fix-phone">
        <p style={{ ...text, marginBottom: 10 }}>אותו מספר עוסק, והנייד הנכון: Grow תעדכן את אותה בקשה ותשלח SMS חדש.</p>
        {fields}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy || isDemo || !ok} onClick={start} style={{ ...primary, opacity: busy || isDemo || !ok ? 0.6 : 1 }}>{busy ? 'שולחת…' : 'עדכון הנייד'}</button>
          <button type="button" style={ghost} onClick={() => setFixPhone(false)}>חזרה</button>
        </div>
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
      {fields}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || isDemo || !ok} onClick={start} style={{ ...primary, opacity: busy || isDemo || !ok ? 0.6 : 1 }}>{busy ? 'פותחת את ההרשמה…' : 'פתיחת חשבון ב-Grow'}</button>
        <button type="button" style={ghost} onClick={onFallback}>להשאיר פרטים במקום</button>
      </div>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.6 }}>אין כאן כרטיס אשראי ואין חיוב.</p>
    </div>
  );
}
