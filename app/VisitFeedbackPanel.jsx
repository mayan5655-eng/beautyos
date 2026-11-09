'use client';

// app/VisitFeedbackPanel.jsx
//
// "מה הלקוחות אמרו": what came back from the review requests (lib/reviewRequests.ts), for HER (Kalmea chrome, her dashboard).
// The 30-day counts (asked, tapped through to Google, reviews on her page, private notes) and the private notes themselves,
// each with a one-tap WhatsApp to answer the client herself (a wa.me link: nothing is sent by the app) and "סימון כנקרא".
// Read through /api/reviews/summary. Shown on /dashboard/feedback (full) and in Settings under the reviews (compact).
//
// A tap through to Google is a tap, not a review: Google does not say who wrote one, and the copy never claims more.

import { useCallback, useEffect, useState } from 'react';
import { waMsgLink } from '@/lib/whatsappLink';
import { parseDb } from '@/lib/dbTime';

const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '14px 16px', boxShadow: 'var(--shadow-xs)' };

export default function VisitFeedbackPanel({ variant = 'full' }) {
  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    let alive = true;
    fetch('/api/reviews/summary', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok || !j.success) setState({ status: 'error', message: j.error || 'לא הצלחנו לטעון, אפשר לנסות שוב בעוד רגע' });
        else setState({ status: 'ok', data: j });
      })
      .catch(() => alive && setState({ status: 'error', message: 'אין חיבור כרגע. אפשר לנסות שוב בעוד רגע' }));
    return () => { alive = false; };
  }, []);
  useEffect(() => load(), [load]);

  const markRead = async (id) => {
    setBusy(id);
    try {
      const r = await fetch('/api/reviews/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        setState((s) => (s.status === 'ok' ? { ...s, data: { ...s.data, notes: s.data.notes.map((n) => (n.id === id ? { ...n, read: true } : n)) } } : s));
      }
    } finally { setBusy(''); }
  };

  const compact = variant === 'compact';
  if (state.status === 'loading') return <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '8px 0' }}>טוענת…</p>;
  if (state.status === 'error') return <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', fontWeight: 600, margin: '8px 0' }}>{state.message}</p>;

  const d = state.data;
  const c = d.counts || {};
  const notes = d.notes || [];
  const unread = notes.filter((n) => !n.read);
  const shown = compact ? unread.slice(0, 3) : notes;
  const tiles = [
    { label: 'בקשות ביקורת', value: c.requested || 0 },
    { label: 'עברו לגוגל', value: c.googleClicks || 0 },
    { label: 'ביקורות בעמוד שלך', value: c.inAppReviews || 0 },
    { label: 'הערות פרטיות', value: c.unhappy || 0 },
  ];

  return (
    <section data-testid="visit-feedback" aria-label="מה הלקוחות אמרו" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={compact ? { background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '12px 14px' } : card}>
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>ב-30 הימים האחרונים</p>
        {d.line ? (
          <>
            {compact ? (
              <p data-testid="visit-feedback-line" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '4px 0 0', lineHeight: 1.6 }}>{d.line}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                {tiles.map((t) => (
                  <div key={t.label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                    <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600, margin: 0 }}>{t.label}</p>
                    <p style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--ink)', margin: '2px 0 0' }}>{t.value}</p>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '8px 0 0', lineHeight: 1.6 }}>
              &quot;עברו לגוגל&quot; הן לקוחות שלחצו על הקישור לביקורת בגוגל. גוגל לא מספרת מי כתבה בפועל.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '4px 0 0', lineHeight: 1.6 }}>
            עוד לא יצאו בקשות ביקורת בחודש האחרון. אחרי כל טיפול מוכנה בשבילך בקשה קצרה בתור ההודעות, ומה שהלקוחות עונות יופיע כאן.
          </p>
        )}
        {d.available === false && d.needsMigration && (
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--warning)', margin: '8px 0 0', lineHeight: 1.6 }}>{d.needsMigration}</p>
        )}
      </div>

      {(shown.length > 0 || !compact) && (
        <div style={compact ? {} : card}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
            {compact ? `הערות פרטיות שלא קראת: ${unread.length}` : 'הערות פרטיות מלקוחות'}
          </p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '2px 0 8px', lineHeight: 1.6 }}>רק את רואה אותן. הן לא מתפרסמות בשום מקום.</p>
          {shown.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: 0 }}>אין הערות פרטיות 🌸</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shown.map((n) => {
                const first = String(n.clientName || '').trim().split(/\s+/)[0] || '';
                const wa = waMsgLink(n.phone, `היי${first ? ` ${first}` : ''}, תודה שסיפרת לי. אשמח לשמוע עוד ולתקן 🌸`);
                return (
                  <li key={n.id} data-testid="visit-feedback-note" style={{ background: n.read ? 'var(--surface-2)' : 'var(--brand-tint)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                    <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0, fontWeight: 600 }}>
                      {n.clientName || 'לקוחה'}{n.service ? ` · ${n.service}` : ''}{n.createdAt ? ` · ${parseDb(n.createdAt).toLocaleDateString('he-IL')}` : ''}
                    </p>
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', margin: '4px 0 0', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                      {n.body || 'סימנה שמשהו היה פחות טוב, בלי לכתוב פרטים.'}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ background: 'var(--brand-deep)', color: 'var(--brand-contrast)', borderRadius: 'var(--r-sm)', padding: '8px 12px', minHeight: 40, display: 'inline-flex', alignItems: 'center', fontSize: 'var(--t-xs)', fontWeight: 700, textDecoration: 'none' }}>לענות לה בוואטסאפ</a>}
                      {!n.read && <button type="button" disabled={busy === n.id} onClick={() => markRead(n.id)} style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 12px', minHeight: 40, fontSize: 'var(--t-xs)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>סימון כנקרא</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {compact && <a href="/dashboard/feedback" style={{ display: 'inline-block', marginTop: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 700 }}>לכל ההערות והמספרים</a>}
        </div>
      )}
      {compact && shown.length === 0 && <a href="/dashboard/feedback" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 700 }}>למסך מה הלקוחות אמרו</a>}
    </section>
  );
}
