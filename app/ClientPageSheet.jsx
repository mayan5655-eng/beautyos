'use client';

// app/ClientPageSheet.jsx
//
// "שליחת הדף שלה": from a client card, the owner prepares the client's private results page and sends its link herself.
//
//   1. On open it only READS (POST /api/client-page {action:'status'}): is there a link, has she opened it, how many consented photos
//      would show. Nothing is created until the owner taps.
//   2. She writes the aftercare tips (one per line), taps "יצירת הקישור", and the server makes (or renews) the link.
//   3. The WhatsApp message is ready and the link is rendered as a real <a> BEFORE the tap (Safari and the Instagram browser block a
//      window opened after an await), plus a copy button (lib/copyText: the Instagram browser has no clipboard object).
//   4. "ביטול הקישור" turns it off at once.
// Nothing is sent from here: the owner opens WhatsApp and presses send herself. "נפתח" is the only thing we learn back.
import { useEffect, useState, useCallback } from 'react';
import Sheet from './Sheet';
import Spinner from './Spinner';
import { copyText } from '@/lib/copyText';

const TIPS = [
  'להימנע ממים חמים ומסאונה 24 שעות',
  'לא לגעת בפנים עם ידיים לא נקיות',
  'קרם הגנה כל יום, גם בחורף',
  'לשתות הרבה מים',
];

const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
};

async function call(clientId, action, extra = {}) {
  const r = await fetch('/api/client-page', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, action, ...extra }),
  });
  return r.json().catch(() => ({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }));
}

export default function ClientPageSheet({ client, onClose, toast, pc, pcDeep, pcTint }) {
  const [st, setSt] = useState(null);          // server answer, null = loading
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);
  const [aftercare, setAftercare] = useState('');
  const [busy, setBusy] = useState('');        // 'save' | 'revoke'
  const [showText, setShowText] = useState(false);

  const apply = useCallback((j, fillText) => {
    if (j?.needsMigration) { setNeedsMigration(true); setSt(false); return false; }
    if (!j?.success) { setError(j?.error || 'לא הצלחנו לטעון'); setSt((cur) => cur ?? false); return false; }
    setError('');
    setSt(j);
    if (fillText) setAftercare(j.aftercare || '');
    return true;
  }, []);

  useEffect(() => {
    let alive = true;
    call(client.id, 'status').then((j) => { if (alive) apply(j, true); });
    return () => { alive = false; };
  }, [client.id, apply]);

  const save = async () => {
    setBusy('save'); setError('');
    try { apply(await call(client.id, 'save', { aftercare }), false); } finally { setBusy(''); }
  };
  const revoke = async () => {
    if (!window.confirm('לבטל את הקישור? מי שיפתח אותו יראה שהוא כבר לא פעיל. אפשר ליצור קישור חדש בכל רגע.')) return;
    setBusy('revoke'); setError('');
    try { if (apply(await call(client.id, 'revoke'), false)) toast?.('הקישור בוטל', 'success'); } finally { setBusy(''); }
  };
  const copyLink = async () => {
    const ok = await copyText(st?.url || '');
    toast?.(ok ? 'הקישור הועתק' : 'לא הצלחנו להעתיק. אפשר ללחוץ ארוכות על הקישור ולהעתיק.', ok ? 'success' : 'info');
  };

  const active = st && st.state === 'active';
  const first = String(client.name || '').trim().split(/\s+/)[0];
  const btn = { display: 'block', width: '100%', minHeight: 44, borderRadius: 'var(--r-lg)', padding: '11px 0', fontSize: 'var(--t-sm)', fontWeight: 700, textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', boxSizing: 'border-box', border: 'none' };
  const ghost = { ...btn, background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line-2)' };
  const note = { fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.55, margin: 0 };

  return (
    <Sheet open onClose={onClose} width={400} zIndex={1250} className="pop-in" title={`הדף האישי של ${first || 'הלקוחה'}`} busy={!!busy}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="clientpage-sheet">
        {st === null && <p style={note}><Spinner inline label="בודקת" /></p>}

        {needsMigration && (
          <p data-testid="clientpage-needs-migration" style={{ ...note, color: 'var(--ink)', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 12 }}>
            הדף האישי עוד לא הופעל בחשבון (חסרה הרצת SQL: kalmea-sql-client-pages). אחרי שהיא תרוץ, הכפתור הזה יעבוד.
          </p>
        )}

        {st && (
          <>
            <p style={note}>דף פרטי שרק היא רואה, בקישור שאת שולחת לה: התמונות שהיא הסכימה להן, הטיפולים שעשיתן, ההמלצות שלך, וכפתור לקביעת הטיפול הבא.</p>

            <div data-testid="clientpage-photos" style={{ ...note, background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px', color: 'var(--ink)' }}>
              {st.photos?.shown > 0
                ? `${st.photos.shown} תמונות יופיעו בדף (עם הסכמה מתועדת).`
                : 'עוד אין תמונות בדף.'}
              {st.photos?.waiting > 0 && ` ${st.photos.waiting} תמונות ממתינות להסכמה מתועדת ולא יופיעו.`}
              {!st.photos?.shown && !st.photos?.waiting && ' כדי להוסיף: בהגדרות ← הדף שלי ← תוצאות, בוחרים את הלקוחה ומתעדים הסכמה.'}
            </div>

            <div>
              <label htmlFor="cp-aftercare" style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink-3)', marginBottom: 5 }}>ההמלצות שלך אחרי הטיפול (שורה לכל המלצה)</label>
              <textarea
                id="cp-aftercare" data-testid="clientpage-aftercare" value={aftercare} onChange={(e) => setAftercare(e.target.value)} rows={5} maxLength={1500}
                placeholder={TIPS.map((t) => `· ${t}`).join('\n')}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 16, lineHeight: 1.6, fontFamily: 'inherit', direction: 'rtl', background: 'var(--surface)', resize: 'vertical' }}
              />
              {!aftercare.trim() && (
                <button type="button" onClick={() => setAftercare(TIPS.join('\n'))} style={{ background: 'none', border: 'none', color: pcDeep, fontWeight: 600, fontFamily: 'inherit', fontSize: 'var(--t-sm)', padding: '6px 0 0', cursor: 'pointer' }}>להתחיל מהמלצות נפוצות</button>
              )}
            </div>

            <button type="button" data-testid="clientpage-save" onClick={save} disabled={!!busy || needsMigration} style={{ ...btn, background: pc, color: 'var(--pc-contrast, #fff)', opacity: busy ? 0.6 : 1 }}>
              {busy === 'save' ? <Spinner inline label="מכינה" /> : active ? 'שמירה ועדכון הדף' : 'יצירת הקישור'}
            </button>

            {active && (
              <div data-testid="clientpage-ready" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ ...note, color: 'var(--ink)' }}>
                  {st.opened?.count > 0
                    ? <><strong style={{ color: 'var(--success)' }}>נפתח</strong> · {st.opened.count === 1 ? 'פעם אחת' : `${st.opened.count} פעמים`}, לאחרונה {fmt(st.opened.last)}</>
                    : 'עוד לא נפתח.'}
                </p>
                <p style={note}>ההודעה מוכנה. שום דבר לא נשלח עד שאת לוחצת על שליחה בוואטסאפ.</p>
                <button type="button" onClick={() => setShowText((v) => !v)} aria-expanded={showText} style={{ background: 'none', border: 'none', color: pcDeep, fontWeight: 600, fontFamily: 'inherit', fontSize: 'var(--t-sm)', padding: 0, textAlign: 'start', cursor: 'pointer' }}>{showText ? 'להסתיר את ההודעה' : 'לראות את ההודעה'}</button>
                {showText && <pre data-testid="clientpage-text" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--t-sm)', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 10, margin: 0, lineHeight: 1.6, direction: 'rtl' }}>{st.text}</pre>}
                {st.waLink
                  ? <a href={st.waLink} target="_blank" rel="noreferrer" data-testid="clientpage-wa" style={{ ...btn, background: 'var(--ink)', color: 'var(--surface)' }}>פתיחה בוואטסאפ שלי</a>
                  : <p style={note}>אין ללקוחה מספר טלפון, אז אין למי לשלוח בוואטסאפ. אפשר להעתיק את הקישור ולשלוח איך שנוח.</p>}
                <button type="button" data-testid="clientpage-copy" onClick={copyLink} style={ghost}>העתקת הקישור</button>
                <a href={st.url} target="_blank" rel="noreferrer" data-testid="clientpage-preview" style={{ ...note, color: pcDeep, fontWeight: 600, textAlign: 'center' }}>לראות איך הדף נראה אצלה</a>
                <button type="button" data-testid="clientpage-revoke" onClick={revoke} disabled={!!busy} style={{ ...ghost, color: 'var(--danger)', opacity: busy ? 0.6 : 1 }}>
                  {busy === 'revoke' ? <Spinner inline label="מבטלת" /> : 'ביטול הקישור'}
                </button>
              </div>
            )}
            {st.state === 'revoked' && <p style={note}>הקישור הקודם בוטל. אפשר ליצור קישור חדש.</p>}
            {st.state === 'expired' && <p style={note}>הקישור הקודם פג תוקף. אפשר ליצור קישור חדש.</p>}
          </>
        )}

        {error && <p data-testid="clientpage-error" role="alert" style={{ ...note, color: 'var(--danger)' }}>{error}</p>}
        <button type="button" onClick={onClose} disabled={!!busy} style={ghost}>סגירה</button>
      </div>
    </Sheet>
  );
}
