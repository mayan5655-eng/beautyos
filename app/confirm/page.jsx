'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ConfirmContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading, success, error, already
  const [message, setMessage] = useState('');
  const [action, setAction] = useState('confirm');

  useEffect(() => {
    const id = searchParams.get('id');
    const actionParam = searchParams.get('action') || 'confirm';
    setAction(actionParam);

    if (!id) {
      setStatus('error');
      setMessage('הלינק לא תקין - חסר מזהה תור');
      return;
    }

    // קריאה ל-API
    fetch(`/api/confirm?id=${id}&action=${actionParam}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (data.alreadyDone) {
            setStatus('already');
            setMessage(data.message);
          } else {
            setStatus('success');
            setMessage(data.message);
          }
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
  }, [searchParams]);

  // עיצוב לפי הסטטוס
  const getStyles = () => {
    if (status === 'loading') {
      return { emoji: '⏳', title: 'רגע...', color: '#6b7280' };
    }
    if (status === 'error') {
      return { emoji: '❌', title: 'אופס!', color: '#dc2626' };
    }
    if (status === 'success' && action === 'confirm') {
      return { emoji: '✅', title: 'התור אושר!', color: '#16a34a' };
    }
    if (status === 'success' && action === 'cancel') {
      return { emoji: '🚫', title: 'התור בוטל', color: '#ea580c' };
    }
    if (status === 'already') {
      return { emoji: 'ℹ️', title: 'כבר טופל', color: '#2563eb' };
    }
    return { emoji: '', title: '', color: '#000' };
  };

  const styles = getStyles();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
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
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>
          {styles.emoji}
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
          color: '#4b5563',
          lineHeight: '1.5'
        }}>
          {status === 'loading' ? 'מעדכן את התור שלך...' : message}
        </p>
        {(status === 'success' || status === 'already') && (
          <p style={{
            fontSize: '14px',
            color: '#9ca3af',
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
        minHeight: '100vh',
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