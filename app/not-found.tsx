// app/not-found.tsx
// Next's catch-all for any route that matches nothing - a mistyped URL, a
// stale bookmark, a link copied wrong. Not an error (nothing threw; see
// app/error.tsx / app/global-error.tsx for that), so no Sentry report and no
// retry - just "there's nothing here," said in Hebrew instead of Next's
// default English developer page, and a way back in.
//
// No tenant is ever resolved on this route (it exists precisely because
// nothing matched), so there is no "her" accent to carry - Kalmea chrome,
// same visual language as ErrorScreen.

import { FLOWER_WATERMARK, LOGO_COMPACT } from '@/lib/brand';

export default function NotFound() {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#FDFBF9',
        fontFamily: "var(--sans, 'Assistant', system-ui, -apple-system, sans-serif)",
        color: '#2A2233',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: '#FFFFFF',
          border: '1px solid #ECE4F0',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '32px 26px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <img
          aria-hidden
          src={FLOWER_WATERMARK}
          alt=""
          style={{
            position: 'absolute',
            top: -30,
            insetInlineEnd: -30,
            width: 140,
            height: 140,
            objectFit: 'contain',
            opacity: 0.08,
            pointerEvents: 'none',
          }}
        />
        <img src={LOGO_COMPACT} alt="Kalmea" width={520} height={177} style={{ position: 'relative', width: 150, height: 'auto', margin: '0 auto 18px' }} />
        <h1
          style={{
            fontFamily: "var(--display, 'Frank Ruhl Libre', Georgia, serif)",
            fontSize: 'var(--t-2xl)',
            fontWeight: 600,
            margin: '0 0 10px',
            letterSpacing: '-0.01em',
          }}
        >
          הדף לא נמצא
        </h1>
        <p style={{ fontSize: 'var(--t-lg)', lineHeight: 1.6, color: '#6B6275', margin: '0 0 22px' }}>
          הקישור הזה לא מוביל לשום מקום - אולי הוקלד לא נכון, או שהעמוד הוזז.
        </p>
        <a
          href="/"
          style={{
            display: 'block',
            width: '100%',
            padding: '14px 20px',
            borderRadius: 'var(--r-full)',
            border: 'none',
            background: 'linear-gradient(135deg, #50655E 0%, #1A3128 100%)',
            color: '#FFFFFF',
            fontSize: 'var(--t-lg)',
            fontWeight: 600,
            textDecoration: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        >
          חזרה לקלמיה
        </a>
      </div>
    </div>
  );
}
