'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

function ConfirmContent() {
  const searchParams = useSearchParams();
  // ready    - cancel links only: waiting for her to actually say yes
  // working  - request in flight
  // success / already / declined / error - terminal
  const [status, setStatus] = useState('working');
  const [message, setMessage] = useState('');
  const [action, setAction] = useState('confirm');

  const id = searchParams.get('id');
  const token = searchParams.get('t') || '';
  const actionParam = searchParams.get('action') || 'confirm';

  const send = useCallback(() => {
    setStatus('working');
    fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: actionParam, token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus(data.alreadyDone ? 'already' : 'success');
          setMessage(data.message);
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
  }, [id, actionParam, token]);

  useEffect(() => {
    setAction(actionParam);

    if (!id) {
      setStatus('error');
      setMessage('הלינק לא תקין - חסר מזהה תור');
      return;
    }

    // A cancel link must NOT fire on load.
    //
    // The POST already stopped link-preview crawlers from cancelling a real
    // appointment, but it left the other half: the client herself. Opening the
    // link is one tap in a WhatsApp thread, and a mis-tap - or a tap meant for
    // the confirm link a line above - cancelled the booking before the page had
    // finished rendering, with nothing on screen to stop it and no way back.
    // Confirming is the opposite case: it is not destructive, it is what the
    // link says it does, and making her tap twice for it is friction with no
    // safety behind it. So confirm still runs on load; cancel asks first.
    if (actionParam === 'cancel') {
      setStatus('ready');
      return;
    }

    send();
  }, [id, actionParam, send]);

  const getStyles = () => {
    if (status === 'working') return { emoji: '⏳', title: 'רגע...', color: 'var(--ink-2)' };
    if (status === 'ready') return { emoji: '', title: 'לבטל את התור?', color: 'var(--ink)' };
    if (status === 'declined') return { emoji: '', title: 'התור נשאר', color: 'var(--success)' };
    if (status === 'error') return { emoji: '', title: 'אופס!', color: 'var(--danger)' };
    if (status === 'success' && action === 'confirm') return { emoji: '', title: 'התור אושר!', color: 'var(--success)' };
    if (status === 'success' && action === 'cancel') return { emoji: '', title: 'התור בוטל', color: 'var(--warning)' };
    if (status === 'already') return { emoji: '', title: 'כבר טופל', color: 'var(--pc)' };
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
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--brand-cream, #FEFAF7)',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      direction: 'rtl'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', minHeight: 58 }}>
          {markKind ? mark(markKind, styles.color) : <span style={{ fontSize: '58px', lineHeight: 1 }}>{styles.emoji}</span>}
        </div>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: styles.color,
          marginBottom: '12px'
        }}>
          {styles.title}
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'var(--ink)',
          lineHeight: '1.5'
        }}>
          {status === 'working' ? 'מעדכן את התור שלך...'
            : status === 'ready' ? 'ביטול משחרר את השעה שלך, ואי אפשר להחזיר אותה מהלינק הזה. אם התכוונת לאשר את התור — סגרי את החלון ופתחי את הלינק השני בהודעה.'
            : status === 'declined' ? 'לא שינינו כלום. נתראה בתור.'
            : message}
        </p>

        {status === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            <button
              type="button"
              onClick={send}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                background: 'var(--danger, #C2557A)', color: '#fff',
                fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer'
              }}
            >
              כן, בטלי את התור
            </button>
            <button
              type="button"
              onClick={() => setStatus('declined')}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                border: '1px solid var(--line-2, #E6DDE4)', background: '#fff',
                color: 'var(--ink-2, #5C4F63)',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer'
              }}
            >
              לא, השאירי את התור
            </button>
          </div>
        )}

        {status === 'error' && id && (
          <button
            type="button"
            onClick={actionParam === 'cancel' ? () => setStatus('ready') : send}
            style={{
              marginTop: 20, padding: '12px 24px', borderRadius: 12,
              border: '1px solid var(--line-2, #E6DDE4)', background: '#fff',
              color: 'var(--ink-2, #5C4F63)', fontSize: 14, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer'
            }}
          >
            נסי שוב
          </button>
        )}

        {(status === 'success' || status === 'already' || status === 'declined') && (
          <p style={{
            fontSize: '14px',
            color: 'var(--ink-3)',
            marginTop: '20px'
          }}>
            תוכלי לסגור את החלון
          </p>
        )}
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        טוען...
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
