'use client';

// app/BusinessReferralCard.jsx
//
// Settings > "העסק שלי": "חברה מביאה חברה" for her Kalmea subscription (lib/referral.ts). Her personal invite link, a WhatsApp share
// button (wa.me: it opens HER WhatsApp with the text, Kalmea sends nothing), and how many friends joined and how many free months she
// earned and used. Counts only: never another business's name.
//
// Not the client referral (app/ClientReferral.jsx), which is about her own clients.
//
// Invisible unless NEXT_PUBLIC_REFERRALS=1 (checked here before any request, so with the flag off nothing is even fetched) and the
// route answers. Before the migration runs it says the feature is not ready yet.

import { useEffect, useState } from 'react';
import { referralsEnabled } from '@/lib/referral';

export default function BusinessReferralCard({ pc, pcTint, toast, isDemo }) {
  const on = referralsEnabled();
  const [s, setS] = useState(null);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    fetch('/api/referrals/me', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null).then((j) => ({ r, j })))
      .then(({ r, j }) => { if (alive) setS(r.ok && j?.success ? j : j?.hidden ? { hidden: true } : { failed: true }); })
      .catch(() => { if (alive) setS({ failed: true }); });
    return () => { alive = false; };
  }, [on]);

  // Not active yet (the migration has not run) is hidden too, never explained (2026-11-09 owner rule).
  if (!on || !s || s.hidden || s.ready === false) return null;

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 12 };
  const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 };
  const ghost = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 };
  const title = <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>חברה מביאה חברה 🌸</p>;

  if (s.failed) return <div data-testid="referral-card" style={box}>{title}<p style={text}>לא הצלחנו לטעון את קישור ההזמנה. נסי שוב מאוחר יותר.</p></div>;
  if (s.ready === false) return <div data-testid="referral-card" style={box}>{title}<p style={text}>ההזמנות לעסקים חברים עוד לא פעילות בחשבון. נעדכן כשהן זמינות.</p></div>;

  const st = s.stats || { joined: 0, paid: 0, earned: 0, used: 0, waiting: 0, available: 0 };
  const copy = async () => {
    try { await navigator.clipboard.writeText(s.link); toast?.('הקישור הועתק'); }
    catch { toast?.('לא הצלחנו להעתיק. אפשר לסמן את הקישור ולהעתיק ידנית', 'error'); }
  };
  const stat = (n, label, id) => (
    <div data-testid={id} style={{ flex: '1 1 0', minWidth: 0, background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 8px', textAlign: 'center' }}>
      <div className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, fontVariantNumeric: 'lining-nums tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.4 }}>{label}</div>
    </div>
  );

  return (
    <div data-testid="referral-card" style={box}>
      {title}
      <p style={{ ...text, marginBottom: 10 }}>
        מכירה עוד בעלת עסק שתאהב את קלמיה? שלחי לה את הקישור האישי שלך. כשהיא מצטרפת ומשלמת את התשלום הראשון, שתיכן מקבלות חודש מנוי במתנה.
      </p>

      {isDemo || s.demo ? (
        <p style={text}>בחשבון הדגמה אין קישור הזמנה.</p>
      ) : s.link ? (
        <>
          <div dir="ltr" data-testid="referral-link" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', background: 'var(--surface-2)', border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 10, overflowWrap: 'anywhere', userSelect: 'all' }}>{s.link}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <a data-testid="referral-share" href={s.share} target="_blank" rel="noreferrer" style={{ ...ghost, background: pc, color: 'var(--pc-contrast)', border: 'none' }}>שליחה בוואטסאפ</a>
            <button type="button" data-testid="referral-copy" style={ghost} onClick={copy}>העתקת הקישור</button>
          </div>
        </>
      ) : (
        <p style={{ ...text, marginBottom: 10 }}>{s.blocked ? 'הקישור האישי ייווצר כשהמנוי יחזור לפעילות.' : 'לא הצלחנו ליצור קישור כרגע. נסי שוב מאוחר יותר.'}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {stat(st.joined, 'חברות הצטרפו', 'referral-joined')}
        {stat(st.earned, 'חודשים במתנה', 'referral-earned')}
        {stat(st.used, 'חודשים נוצלו', 'referral-used')}
      </div>
      {st.waiting > 0 && <p style={{ ...text, marginTop: 8 }}>{st.waiting === 1 ? 'חודש אחד במתנה ייכנס' : `${st.waiting} חודשים במתנה ייכנסו`} לתוקף {s.holdDays} ימים אחרי התשלום שזיכה בו.</p>}
      {st.available > 0 && <p style={{ ...text, marginTop: 8 }}>{st.available === 1 ? 'חודש במתנה מחכה לך' : `${st.available} חודשים במתנה מחכים לך`}: החיוב הבא שלך לא ייגבה, והמנוי ממשיך כרגיל.</p>}
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 10 }}>
        החודש במתנה נכנס במקום החיוב הבא, פעם אחת לכל עסק שמצטרף דרכך. תשלום שהוחזר לא מזכה בחודש.
      </p>
    </div>
  );
}
