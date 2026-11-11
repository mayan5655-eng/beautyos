'use client';
// app/dashboard/academy/FinishButton.tsx
//
// "סיימתי": marks the lesson done (POST /api/academy/progress). Says "done" only after the server answered success; a failure
// says so and the button stays. Tapping again on a lesson already done writes nothing new (the server keeps the first time).
import { useState } from 'react';

type Props = { lessonId: string; initiallyDone: boolean; courseDoneAlready?: boolean; nextHref: string | null; certificateHref: string };

export default function FinishButton({ lessonId, initiallyDone, courseDoneAlready = false, nextHref, certificateHref }: Props) {
  const [done, setDone] = useState(initiallyDone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [courseDone, setCourseDone] = useState(courseDoneAlready);

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/academy/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) throw new Error('failed');
      setDone(true);
      setCourseDone(!!j.certificate);
    } catch {
      setError('לא הצלחנו לשמור כרגע. אפשר לנסות שוב בעוד רגע.');
    } finally {
      setBusy(false);
    }
  }

  const btn: React.CSSProperties = { padding: '12px 22px', borderRadius: 'var(--r-full)', border: 'none', background: 'var(--k-green)', color: 'var(--k-cream)', fontWeight: 700, fontSize: 'var(--t-lg)', cursor: 'pointer', fontFamily: 'inherit' };
  const link: React.CSSProperties = { ...btn, display: 'inline-block', textDecoration: 'none' };

  return (
    <div style={{ margin: '18px 0 0' }} aria-live="polite">
      {!done ? (
        <button type="button" onClick={finish} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }} data-testid="academy-finish">
          {busy ? 'שומרת...' : 'סיימתי'}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color: 'var(--k-green)' }}>✓ השיעור הזה מאחורייך, כל הכבוד!</span>
          {courseDone ? <a href={certificateHref} style={link}>לתעודת הסיום</a> : nextHref ? <a href={nextHref} style={link}>לשיעור הבא</a> : null}
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-md)', margin: '8px 0 0' }}>{error}</p>}
    </div>
  );
}
