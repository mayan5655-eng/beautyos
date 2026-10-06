'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import Spinner from "../Spinner";
import { useSearchParams } from 'next/navigation';
import { PublicPage, BusinessHeader } from "../PublicChrome";

function ConfirmContent() {
  const searchParams = useSearchParams();

  // All three come from the URL, which does not change while this page is open.
  const id = searchParams.get('id');
  const token = searchParams.get('t') || '';
  const action = searchParams.get('action') || 'confirm';

  // ready    - cancel links only: waiting for her to actually say yes
  // working  - request in flight
  // success / already / declined / error - terminal
  //
  // The opening status is a pure function of the URL, so it is computed here
  // rather than in an effect that immediately overwrites a placeholder. That
  // also removes a frame where a cancel link rendered "מעדכן את התור שלך…"
  // before the effect got a chance to say otherwise.
  const [status, setStatus] = useState(() =>
    !id ? 'error' : action === 'cancel' ? 'ready' : 'working'
  );
  const [message, setMessage] = useState(() =>
    !id ? 'הלינק לא תקין — חסר מזהה תור' : ''
  );
  // Public branding from the API's success path; optional - no logo, no space.
  const [brandInfo, setBrandInfo] = useState({ businessName: '', logoUrl: '', primaryColor: '' });

  // Does not set 'working' itself. On mount that is already the status for a
  // confirm link, and setting state synchronously from an effect is a
  // cascading render. The two buttons that call this set it themselves.
  const send = useCallback(() => {
    fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus(data.alreadyDone ? 'already' : 'success');
          setMessage(data.message);
          setBrandInfo({ businessName: data.businessName || '', logoUrl: data.logoUrl || '', primaryColor: data.primaryColor || '' });
        } else {
          setStatus('error');
          setMessage(data.error || 'משהו השתבש');
        }
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        setMessage('לא הצלחנו להתחבר לשרת');
      });
  }, [id, action, token]);

  // What the buttons call: show the spinner, then go.
  const sendNow = () => { setStatus('working'); send(); };

  // A cancel link must NOT fire on load, so only the confirm path runs here.
  //
  // Making this a POST already stopped link-preview crawlers from cancelling a
  // real appointment, but it left the other half: the client herself. Opening
  // the link is one tap in a WhatsApp thread, and a mis-tap - or a tap meant
  // for the confirm link a line above - cancelled the booking before the page
  // had finished rendering, with nothing on screen to stop it and no way back.
  //
  // Confirming is the opposite case: it is not destructive, it is exactly what
  // the link says it does, and a second tap there is friction with no safety
  // behind it. So confirm still runs on load; cancel asks first.
  useEffect(() => {
    if (id && action === 'confirm') send();
  }, [id, action, send]);

  const getStyles = () => {
    // No hourglass emoji: it was the last colour glyph on a page that is
    // otherwise monochrome, and minHeight on the mark slot keeps the layout
    // from jumping while this state has none.
    if (status === 'working') return { emoji: '', title: 'רגע...', color: 'var(--ink-2)' };
    if (status === 'ready') return { emoji: '', title: 'לבטל את התור?', color: 'var(--ink)' };
    if (status === 'declined') return { emoji: '', title: 'התור נשאר', color: 'var(--pc-deep)' };
    if (status === 'error') return { emoji: '', title: 'אופס!', color: 'var(--danger)' };
    if (status === 'success' && action === 'confirm') return { emoji: '', title: 'התור אושר!', color: 'var(--pc-deep)' };
    if (status === 'success' && action === 'cancel') return { emoji: '', title: 'התור בוטל', color: 'var(--ink-2)' };
    if (status === 'already') return { emoji: '', title: 'כבר טופל', color: 'var(--pc-deep)' };
    return { emoji: '', title: '', color: 'var(--ink)' };
  };

  const styles = getStyles();

  // Monochrome stroked marks rather than emoji. The page renders one glyph at
  // 64px as the whole visual answer, and on iOS the emoji versions came back in
  // full colour against a page that has none.
  const mark = (kind, colour) => {
    const common = { width: 58, height: 58, fill: 'none', stroke: colour, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (kind === 'tick') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M7.8 12.4l2.9 2.9 5.5-5.9" /></svg>;
    if (kind === 'cross') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
    if (kind === 'info') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M12 11v5.4" /><circle cx="12" cy="7.9" r="0.9" fill={colour} stroke="none" /></svg>;
    if (kind === 'ask') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M9.4 9.4a2.7 2.7 0 1 1 3.4 3.2c-.6.2-.9.8-.9 1.5v.4" /><circle cx="12" cy="17.4" r="0.9" fill={colour} stroke="none" /></svg>;
    return null;
  };

  const markKind =
    status === 'ready' ? 'ask'
    : status === 'declined' ? 'tick'
    : status === 'error' ? 'cross'
    : status === 'already' ? 'info'
    : status === 'success' ? (action === 'cancel' ? 'info' : 'tick')
    : null;

  return (
    <PublicPage primary={brandInfo.primaryColor || null}>
      <div className="pub-card" style={{ padding: '30px 24px 28px' }}>
        {/* HER logo and name first and large: this page is hers, Kalmea is the small mark below the card. */}
        <BusinessHeader logoUrl={brandInfo.logoUrl} name={brandInfo.businessName} />
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center', minHeight: 58 }}>
          {markKind ? mark(markKind, styles.color) : null}
        </div>
        <h1 className="pub-h1">{styles.title}</h1>
        <p className="pub-p">
          {status === 'working' ? <Spinner inline label="מעדכן את התור שלך" /> : status === 'ready' ? 'ביטול משחרר את השעה שלך, ואי אפשר להחזיר אותה מהלינק הזה. אם התכוונת לאשר את התור — סגרי את החלון ופתחי את הלינק השני בהודעה.'
            : status === 'declined' ? 'לא שינינו כלום. נתראה בתור.'
            : message}
        </p>

        {status === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            <button type="button" onClick={sendNow} className="pub-pill pub-pill-danger">כן, בטלי את התור</button>
            <button type="button" onClick={() => setStatus('declined')} className="pub-pill pub-pill-quiet">לא, השאירי את התור</button>
          </div>
        )}

        {status === 'error' && id && (
          <button type="button" onClick={action === 'cancel' ? () => setStatus('ready') : sendNow} className="pub-pill pub-pill-quiet" style={{ marginTop: 20, width: 'auto', display: 'inline-flex', padding: '11px 28px' }}>
            נסי שוב
          </button>
        )}

        {(status === 'success' || status === 'already' || status === 'declined') && (
          <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-3)', marginTop: 20 }}>תוכלי לסגור את החלון</p>
        )}
      </div>
    </PublicPage>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<PublicPage owner="kalmea"><Spinner label="טוענת" /></PublicPage>}>
      <ConfirmContent />
    </Suspense>
  );
}
