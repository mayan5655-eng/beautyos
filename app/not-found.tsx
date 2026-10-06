// app/not-found.tsx
// Next's catch-all for any route that matches nothing - a mistyped URL, a
// stale bookmark, a link copied wrong. Not an error (nothing threw; see
// app/error.tsx / app/global-error.tsx for that), so no Sentry report and no
// retry - just "there's nothing here," said in Hebrew instead of Next's
// default English developer page, and a way back in.
//
// No tenant is ever resolved on this route (it exists precisely because
// nothing matched), so there is no "her" accent to carry: this is Kalmea's own
// page, in the shared public-page frame (app/PublicChrome.tsx).

import { LOGO_COMPACT, ICON_FRAME } from '@/lib/brand';
import BrandImage from '@/app/BrandImage';
import { PublicPage, LineIcon } from '@/app/PublicChrome';

export default function NotFound() {
  return (
    <PublicPage owner="kalmea" maxWidth={440}>
      <div className="pub-card" style={{ padding: '30px 24px 28px' }}>
        <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={150} height={44} style={{ width: 150, height: 'auto', margin: '0 auto 18px' }} />
        <LineIcon src={ICON_FRAME} />
        <h1 className="pub-h1">הדף לא נמצא</h1>
        <p className="pub-p" style={{ marginBottom: 22 }}>הקישור הזה לא מוביל לשום מקום - אולי הוקלד לא נכון, או שהעמוד הוזז.</p>
        <a href="/" className="brand-pill-btn" style={{ width: '100%', boxSizing: 'border-box', textDecoration: 'none' }}>חזרה לקלמיה</a>
      </div>
    </PublicPage>
  );
}
