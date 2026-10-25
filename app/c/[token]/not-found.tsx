// A personal-page link that does not work (wrong, cancelled, expired): one neutral page for all of them, in Kalmea's frame
// (this page knows nothing about any business, by design).
import { PublicPage, LineIcon } from '@/app/PublicChrome';
import { ICON_QUESTION } from '@/lib/brand';

export default function ClientPageGone() {
  return (
    <PublicPage owner="kalmea">
      <div className="pub-card">
        <LineIcon src={ICON_QUESTION} />
        <h1 className="pub-h1">הקישור הזה כבר לא פעיל</h1>
        <p className="pub-p">אפשר לבקש מהקוסמטיקאית שלך קישור חדש לדף האישי.</p>
      </div>
    </PublicPage>
  );
}
