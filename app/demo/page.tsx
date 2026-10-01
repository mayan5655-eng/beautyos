// app/demo/page.tsx
// The public demo chooser: /demo. Picking a field redirects into
// app/demo/[field]/route.ts, which mints the real session.

export const metadata = {
  title: 'נסי את קלמיה - דמו',
};

export default function DemoChooserPage() {
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', padding: '0 24px', textAlign: 'center', gap: 18,
        fontFamily: "'Heebo','Assistant',sans-serif",
        background: 'var(--brand-cream, #FEFAF7)',
      }}
    >
      <p style={{ fontSize: 40, color: 'var(--brand-muted, #98879B)' }}>✦</p>
      <h1 style={{ fontSize: 30, fontWeight: 600, color: 'var(--ink, #2A2233)', margin: 0 }}>
        רוצה לראות איך זה עובד?
      </h1>
      <p style={{ fontSize: 17, color: 'var(--brand-muted, #98879B)', lineHeight: 1.7, maxWidth: 420, margin: 0 }}>
        עסק אמיתי, נתונים לדוגמה. אפשר ללחוץ על הכל - שום הודעה לא יוצאת באמת.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        <a
          href="/demo/cosmetics"
          style={{
            padding: '14px 28px', borderRadius: 999, background: '#8E5A7C', color: '#fff',
            textDecoration: 'none', fontWeight: 600, fontSize: 16,
          }}
        >
          קוסמטיקה
        </a>
        <a
          href="/demo/nails"
          style={{
            padding: '14px 28px', borderRadius: 999, background: '#C98BA6', color: '#fff',
            textDecoration: 'none', fontWeight: 600, fontSize: 16,
          }}
        >
          מניקור ופדיקור
        </a>
      </div>
      <a href="/signup" style={{ fontSize: 14, color: 'var(--ink-2, #6E6672)', marginTop: 20 }}>
        מוכנה להתחיל? הרשמה בחינם ←
      </a>
    </div>
  );
}
