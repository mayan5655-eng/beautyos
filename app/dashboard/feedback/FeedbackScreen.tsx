'use client';

// app/dashboard/feedback/FeedbackScreen.tsx
// The frame around VisitFeedbackPanel: same chrome as /dashboard/digest (Kalmea --brand-*, her own dashboard).
import VisitFeedbackPanel from '../../VisitFeedbackPanel';

export default function FeedbackScreen() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      <main data-testid="feedback-screen" style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 48px', direction: 'rtl', color: 'var(--ink)', fontFamily: 'var(--sans)' }}>
        <a href="/dashboard" style={{ display: 'inline-block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}>→ חזרה לקלמיה</a>
        <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--brand-deep)', margin: '0 0 4px' }}>מה הלקוחות אמרו</h1>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '0 0 14px', lineHeight: 1.6 }}>
          אחרי טיפול הלקוחה מקבלת שאלה קצרה: איך היה? מי שנהנתה מוזמנת לכתוב ביקורת בגוגל, ומי שמשהו הפריע לה יכולה לכתוב לך כאן, בפרטיות. גם היא יכולה לכתוב ביקורת בגוגל אם תרצה.
        </p>
        <VisitFeedbackPanel variant="full" />
        <p style={{ marginTop: 18, fontSize: 'var(--t-xs)', color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.6 }}>
          את הקישור לגוגל, התזמון וכמה פעמים לשאול כל לקוחה בוחרים בהגדרות, תחת הודעות ללקוחות.
        </p>
      </main>
    </div>
  );
}
