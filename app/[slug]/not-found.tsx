// app/[slug]/not-found.tsx
//
// "No business at this address", shown with a REAL 404 status.
//
// This used to be rendered inline by the page with a 200 (the comment said: Next's default 404 is an English
// developer page, and a client who mistyped a link should be told something she can act on). Both are true,
// and neither needs a 200: a segment not-found.tsx carries her Hebrew words AND the right status. The 200 made
// every unknown URL - /sitemap.xml, a typo, a deleted business - look like a live page to crawlers and to
// monitoring (found 2026-10-06).
//
// Kalmea's own page (there is no business to show), in the shared public-page frame.

import { LOGO_COMPACT, ICON_FRAME } from '@/lib/brand';
import BrandImage from '@/app/BrandImage';
import { PublicPage, LineIcon } from '@/app/PublicChrome';

export default function BusinessNotFound() {
  return (
    <PublicPage owner="kalmea" maxWidth={440}>
      <div className="pub-card" style={{ padding: '30px 24px 28px' }}>
        <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={150} height={44} style={{ width: 150, height: 'auto', margin: '0 auto 18px' }} />
        <LineIcon src={ICON_FRAME} />
        <h1 className="pub-h1">לא מצאנו עסק בכתובת הזו</h1>
        <p className="pub-p">ייתכן שהקישור השתנה או הוקלד עם שגיאה. כדאי לבקש מהעסק קישור מעודכן.</p>
      </div>
    </PublicPage>
  );
}
