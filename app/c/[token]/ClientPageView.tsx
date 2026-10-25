// The personal page itself - pure presentation, no hooks, so it renders on the server and ships no script of its own.
// Used by the route (page.tsx) and by the dev/preview fixture; it never sees a token, a tenant id or a consent record.
import { PublicPage, BusinessHeader } from '@/app/PublicChrome';
import type { PublicClientPage } from '@/lib/clientPageData';
import { firstName } from '@/lib/clientPage';
import s from './page.module.css';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const dateHe = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${d} ב${MONTHS[m - 1]} ${y}` : iso;
};
const visits = (n: number) => (n === 1 ? 'ביקור אחד' : `${n} ביקורים`);

export default function ClientPageView({ page, children }: { page: PublicClientPage; children?: React.ReactNode }) {
  const first = firstName(page.clientName);
  return (
    <PublicPage primary={page.accent} maxWidth={440}>
      <BusinessHeader logoUrl={page.logoUrl} name={page.businessName} />
      <div className={s.wrap}>
        <div className={s.hello}>
          <h1 className={s.hi}>{first ? `היי ${first} 🌸` : 'היי 🌸'}</h1>
          <p className={s.sub}>הדף האישי שלך: התוצאות, מה עשינו, ואיך שומרות על זה יפה.</p>
        </div>

        {page.results.length > 0 && (
          <section className={s.card} aria-labelledby="cp-results">
            <h2 className={s.h2} id="cp-results">התוצאות שלך</h2>
            {page.results.map((r, i) => (
              <div key={r.id || i} className={s.result}>
                {r.serviceName && <p className={s.rname}>{r.serviceName}</p>}
                <div className={r.before ? s.pair : s.single}>
                  {r.before && (
                    <figure className={s.fig}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.before} alt="לפני" width={400} height={500} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                      <figcaption className={s.tag}>לפני</figcaption>
                    </figure>
                  )}
                  <figure className={s.fig}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.after} alt="אחרי" width={400} height={500} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                    <figcaption className={s.tag}>אחרי</figcaption>
                  </figure>
                </div>
                {(r.caption || r.sessions) && (
                  <p className={s.cap}>
                    {r.caption}
                    {r.caption && r.sessions ? ' · ' : ''}
                    {r.sessions ? <span className={s.sess}>{r.sessions === 1 ? 'טיפול אחד' : `${r.sessions} טיפולים`}</span> : null}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}

        {page.treatments.length > 0 && (
          <section className={s.card} aria-labelledby="cp-did">
            <h2 className={s.h2} id="cp-did">מה עשינו</h2>
            <ul className={s.list}>
              {page.treatments.map((t) => (
                <li key={t.service} className={s.li}>
                  <span className={s.svc}>{t.service}</span>
                  <span className={s.meta}>{visits(t.count)} · אחרון {dateHe(t.lastDate)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {page.aftercare.length > 0 && (
          <section className={`${s.card} ${s.care}`} aria-labelledby="cp-care">
            <h2 className={s.h2} id="cp-care">איך שומרות על התוצאה</h2>
            {page.aftercare.map((t, i) => (
              <p key={i} className={s.tip}><span className={s.dot} aria-hidden>✦</span><span>{t}</span></p>
            ))}
          </section>
        )}

        <div className={s.cta}>
          <a className="pub-pill" href={page.bookHref} data-testid="next-visit">קביעת הטיפול הבא</a>
          <p className={s.note}>נפתח לך דף הקביעה של {page.businessName || 'העסק'}, אפשר לבחור יום ושעה.</p>
        </div>
      </div>
      {children}
    </PublicPage>
  );
}
