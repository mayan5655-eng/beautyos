// The personal page itself - pure presentation, no hooks, so it renders on the server and ships no script of its own.
// Used by the route (page.tsx) and by the dev/preview fixture; it never sees a token, a tenant id or a consent record.
import { PublicPage, BusinessHeader } from '@/app/PublicChrome';
import type { PublicClientPage } from '@/lib/clientPageData';
import { firstName } from '@/lib/clientPage';
import s from './page.module.css';
import { trFor } from "@/lib/i18n/publicTr";
import { normalizeLang, localeOf, type Lang } from "@/lib/i18n/core";

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const dateIn = (iso: string, lang: Lang) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!(m >= 1 && m <= 12)) return iso;
  if (lang !== 'he') return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${d} ב${MONTHS[m - 1]} ${y}`;
};

export default function ClientPageView({ page, children }: { page: PublicClientPage; children?: React.ReactNode }) {
  const lang = normalizeLang(page.lang);
  const tr = trFor(lang);
  const visits = (n: number) => (n === 1 ? tr('ביקור אחד') : tr('{0} ביקורים', [n]));
  const dateHe = (iso: string) => dateIn(iso, lang);
  const first = firstName(page.clientName);
  return (
    <PublicPage primary={page.accent} maxWidth={440} lang={lang}>
      <BusinessHeader logoUrl={page.logoUrl} name={page.businessName} lang={lang} />
      <div className={s.wrap}>
        <div className={s.hello}>
          <h1 className={s.hi}>{first ? tr("היי {0} 🌸", [first]) : tr("היי 🌸")}</h1>
          <p className={s.sub}>{tr("הדף האישי שלך: התוצאות, מה עשינו, ואיך שומרות על זה יפה.")}</p>
        </div>

        {page.loyalty && (
          <section className={`${s.card} ${s.stampCard}`} aria-labelledby="cp-loyalty" data-testid="loyalty-card">
            <h2 className={s.h2} id="cp-loyalty">{tr("כרטיסיית הנאמנות שלך")}</h2>
            <ol className={s.stamps} aria-label={tr("{0} מתוך {1} ביקורים", [page.loyalty.filled, page.loyalty.every])}>
              {Array.from({ length: page.loyalty.every }, (_, i) => {
                const on = i < page.loyalty!.filled;
                const last = i === page.loyalty!.every - 1;
                return (
                  <li key={i} className={`${s.stamp} ${on ? s.stampOn : ''} ${last ? s.stampGift : ''}`} aria-hidden>
                    {last ? '🎁' : on ? '✦' : i + 1}
                  </li>
                );
              })}
            </ol>
            <p className={s.stampLine} data-testid="loyalty-line">{page.loyalty.ready ? tr('מילאת את הכרטיסייה! המתנה מחכה לך בביקור הבא') : page.loyalty.remaining === 1 ? tr('עוד ביקור אחד למתנה') : tr('עוד {0} ביקורים למתנה', [page.loyalty.remaining])}</p>
            <p className={s.stampReward}>{tr("המתנה:")} {page.loyalty.reward}</p>
          </section>
        )}

        {page.results.length > 0 && (
          <section className={s.card} aria-labelledby="cp-results">
            <h2 className={s.h2} id="cp-results">{tr("התוצאות שלך")}</h2>
            {page.results.map((r, i) => (
              <div key={r.id || i} className={s.result}>
                {r.serviceName && <p className={s.rname}>{r.serviceName}</p>}
                <div className={r.before ? s.pair : s.single}>
                  {r.before && (
                    <figure className={s.fig}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.before} alt={tr("לפני")} width={400} height={500} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                      <figcaption className={s.tag}>{tr("לפני")}</figcaption>
                    </figure>
                  )}
                  <figure className={s.fig}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.after} alt={tr("אחרי")} width={400} height={500} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                    <figcaption className={s.tag}>{tr("אחרי")}</figcaption>
                  </figure>
                </div>
                {(r.caption || r.sessions) && (
                  <p className={s.cap}>
                    {r.caption}
                    {r.caption && r.sessions ? ' · ' : ''}
                    {r.sessions ? <span className={s.sess}>{r.sessions === 1 ? tr("טיפול אחד") : tr("{0} טיפולים", [r.sessions])}</span> : null}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}

        {page.treatments.length > 0 && (
          <section className={s.card} aria-labelledby="cp-did">
            <h2 className={s.h2} id="cp-did">{tr("מה עשינו")}</h2>
            <ul className={s.list}>
              {page.treatments.map((t) => (
                <li key={t.service} className={s.li}>
                  <span className={s.svc}>{t.service}</span>
                  <span className={s.meta}>{visits(t.count)} {tr("· אחרון")} {dateHe(t.lastDate)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {page.aftercare.length > 0 && (
          <section className={`${s.card} ${s.care}`} aria-labelledby="cp-care">
            <h2 className={s.h2} id="cp-care">{tr("איך שומרות על התוצאה")}</h2>
            {page.aftercare.map((t, i) => (
              <p key={i} className={s.tip}><span className={s.dot} aria-hidden>✦</span><span>{t}</span></p>
            ))}
          </section>
        )}

        <div className={s.cta}>
          <a className="pub-pill" href={page.bookHref} data-testid="next-visit">{tr("קביעת הטיפול הבא")}</a>
          <p className={s.note}>{tr("נפתח לך דף הקביעה של")} {page.businessName || tr("העסק")}{tr(", אפשר לבחור יום ושעה.")}</p>
        </div>
      </div>
      {children}
    </PublicPage>
  );
}
