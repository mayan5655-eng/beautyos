// app/[slug]/not-found.tsx
//
// "No business at this address", shown with a REAL 404 status.
//
// This used to be rendered inline by the page with a 200 (the comment said: Next's default 404 is an English
// developer page, and a client who mistyped a link should be told something she can act on). Both are true,
// and neither needs a 200: a segment not-found.tsx carries her Hebrew words AND the right status. The 200 made
// every unknown URL - /sitemap.xml, a typo, a deleted business - look like a live page to crawlers and to
// monitoring (found 2026-10-06).

import { LOGO_COMPACT } from '@/lib/brand';
import BrandImage from '@/app/BrandImage';

export default function BusinessNotFound() {
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', padding: '0 24px', textAlign: 'center',
        fontFamily: 'var(--font-assistant), sans-serif',
        background: 'var(--brand-cream, #FDFBF9)',
      }}
    >
      <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={150} height={44} style={{ width: 150, height: 'auto', marginBottom: 14 }} />
      <h1 style={{ fontSize: 'var(--t-2xl)', fontWeight: 600, color: 'var(--ink, #2A2233)', marginBottom: 10, lineHeight: 1.3 }}>
        לא מצאנו עסק בכתובת הזו
      </h1>
      <p style={{ fontSize: 'var(--t-lg)', color: 'var(--brand-muted, #7D8D87)', lineHeight: 1.7, maxWidth: 340 }}>
        ייתכן שהקישור השתנה או הוקלד עם שגיאה. כדאי לבקש מהעסק קישור מעודכן.
      </p>
    </div>
  );
}
