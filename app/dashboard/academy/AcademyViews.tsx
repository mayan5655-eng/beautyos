// app/dashboard/academy/AcademyViews.tsx
//
// The Academy's screens, as plain presentational components: the pages load the data (lib/academyData.ts) and pass it in, and
// test-academy.ts renders these same components to check what she sees. Kalmea chrome (--brand-* / --k-*), not her accent: this
// is Kalmea teaching her, not her talking to her clients.
//
// NOTHING HERE SELLS. No price, no buy button, no "בקרוב": the loaders only ever pass courses she can open (and, for a platform
// admin, drafts marked as such). price_ils is not read by any component in this file.
import type { ReactNode } from 'react';
import { parseLessonBody, parseVideoUrl, minutesHe, certificateDate, type CourseProgress } from '@/lib/academy';
import type { CatalogItem, CourseView as CourseViewData } from '@/lib/academyData';
import type { LessonRow } from '@/lib/academy';
import FinishButton from './FinishButton';
import PrintButton from './PrintButton';

const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '0 16px 40px', fontFamily: 'var(--sans)', color: 'var(--ink)', direction: 'rtl' };
const h1: React.CSSProperties = { fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-3xl)', fontWeight: 800, color: 'var(--brand-accent)', margin: '8px 0 6px', lineHeight: 1.2 };
const lead: React.CSSProperties = { fontSize: 'var(--t-lg)', color: 'var(--ink-2)', lineHeight: 1.7, margin: '0 0 20px' };
const card: React.CSSProperties = { display: 'block', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 16px 14px', textDecoration: 'none', color: 'inherit', boxShadow: 'var(--shadow-xs)' };
const backLink: React.CSSProperties = { fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { display: 'inline-block', padding: '10px 18px', borderRadius: 'var(--r-full)', background: 'var(--k-green)', color: 'var(--k-cream)', fontWeight: 700, fontSize: 'var(--t-md)', textDecoration: 'none' };
const draftTag: React.CSSProperties = { display: 'inline-block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink-2)', background: 'var(--k-sage)', borderRadius: 'var(--r-full)', padding: '2px 10px', marginInlineStart: 8, verticalAlign: 'middle' };

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

const base = '/dashboard/academy';

export function ProgressBar({ p, label }: { p: Pick<CourseProgress, 'done' | 'total' | 'percent'>; label?: string }) {
  return (
    <div data-testid="academy-progress">
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-label={label || 'התקדמות בקורס'}
        style={{ height: 8, borderRadius: 'var(--r-full)', background: 'var(--k-sage)', overflow: 'hidden' }}>
        <div style={{ width: `${p.percent}%`, height: '100%', background: 'var(--k-green)', borderRadius: 'var(--r-full)', transition: 'width .3s' }} />
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '6px 0 0' }}>{p.done} מתוך {p.total} שיעורים</p>
    </div>
  );
}

function Shell({ back, children }: { back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div dir="rtl" style={wrap}>
      <a href={back?.href || '/dashboard'} style={backLink}>→ {back?.label || 'חזרה ליומן'}</a>
      {children}
    </div>
  );
}

export function MissingMigration() {
  return (
    <Shell>
      <h1 style={h1}>האקדמיה</h1>
      <p style={{ ...lead, background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
        האקדמיה צריכה עדכון במסד הנתונים שעוד לא הורץ (add_academy_2026-11-11.sql). אחרי שירוץ, הקורסים יופיעו כאן.
      </p>
    </Shell>
  );
}

export function LoadError() {
  return (
    <Shell>
      <h1 style={h1}>האקדמיה</h1>
      <p style={{ ...lead, background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>לא הצלחנו לטעון את הקורסים כרגע. אפשר לנסות שוב בעוד רגע.</p>
    </Shell>
  );
}

function ctaFor(p: CourseProgress): string {
  if (p.complete) return 'סיימת! לתעודה';
  return p.done > 0 ? 'להמשיך מאיפה שעצרת' : 'להתחיל';
}

export function CatalogView({ items, isAdmin }: { items: CatalogItem[]; isAdmin: boolean }) {
  return (
    <Shell>
      <h1 style={h1}>האקדמיה של Kalmea</h1>
      <p style={lead}>קורסים קצרים שנבנו בשבילך: איך להביא עוד לקוחות ולהראות את העבודה שלך במיטבה. שיעור קצר, משימה אחת, ומתקדמות.</p>
      {items.length === 0 ? (
        <p data-testid="academy-empty" style={{ ...lead, background: 'var(--surface-2)', borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>אין כאן קורסים פתוחים בשבילך כרגע.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(({ course, progress, lessonCount, draft }) => {
            const href = progress.complete ? `${base}/${course.slug}/certificate` : `${base}/${course.slug}`;
            return (
              <a key={course.id} href={href} style={card} data-testid="academy-course">
                <h2 style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-xl)', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                  {course.title}{draft && isAdmin && <span style={draftTag}>טיוטה, רק את רואה</span>}
                </h2>
                {course.subtitle && <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-2)', margin: '4px 0 12px', lineHeight: 1.6 }}>{course.subtitle}</p>}
                {lessonCount > 0 && <ProgressBar p={progress} />}
                <span style={{ ...primaryBtn, marginTop: 12, padding: '8px 16px', fontSize: 'var(--t-md)' }}>{ctaFor(progress)}</span>
              </a>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export function CourseView({ view, isAdmin }: { view: CourseViewData; isAdmin: boolean }) {
  const { course, lessons, progress, certificate, draft } = view;
  const next = lessons.find((l) => l.id === progress.nextLessonId) || lessons[0];
  return (
    <Shell back={{ href: base, label: 'לכל הקורסים' }}>
      <h1 style={h1}>{course.title}{draft && isAdmin && <span style={draftTag}>טיוטה, רק את רואה</span>}</h1>
      {course.subtitle && <p style={lead}>{course.subtitle}</p>}
      {progress.total > 0 && <div style={{ margin: '0 0 18px' }}><ProgressBar p={progress} /></div>}
      {certificate && (
        <p style={{ background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '12px 14px', fontSize: 'var(--t-md)', margin: '0 0 16px' }}>
          סיימת את כל השיעורים, כל הכבוד! <a href={`${base}/${course.slug}/certificate`} style={{ color: 'var(--ink)', fontWeight: 700 }}>לתעודת הסיום שלך</a>
        </p>
      )}
      {!certificate && next && <p style={{ margin: '0 0 16px' }}><a href={`${base}/${course.slug}/${next.slug}`} style={primaryBtn}>{progress.done > 0 ? 'לשיעור הבא' : 'להתחיל מהשיעור הראשון'}</a></p>}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {lessons.map((l, i) => (
          <li key={l.id}>
            <a href={`${base}/${course.slug}/${l.slug}`} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }} data-testid="academy-lesson">
              <span aria-hidden style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 'var(--t-md)',
                background: l.done ? 'var(--k-green)' : 'var(--k-sage)', color: l.done ? 'var(--k-cream)' : 'var(--ink)' }}>{l.done ? '✓' : i + 1}</span>
              <span style={{ flex: 1, fontSize: 'var(--t-lg)', fontWeight: 600 }}>
                {l.title}{!l.published && isAdmin && <span style={draftTag}>טיוטה</span>}
                {l.done && <span style={srOnly}> (הושלם)</span>}
              </span>
              {minutesHe(l.minutes) && <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{minutesHe(l.minutes)}</span>}
            </a>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

export function VideoFrame({ url, title }: { url: string | null | undefined; title: string }) {
  const v = parseVideoUrl(url);
  if (!v) return null;
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--k-green-deep)', margin: '0 0 18px' }}>
      <iframe src={v.embedUrl} title={title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
    </div>
  );
}

export function LessonBody({ body }: { body: string | null | undefined }) {
  const blocks = parseLessonBody(body);
  if (!blocks.length) return null;
  return (
    <div style={{ fontSize: 'var(--t-lg)', lineHeight: 1.8, color: 'var(--ink)' }}>
      {blocks.map((b, i) =>
        b.kind === 'h' ? <h2 key={i} style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-xl)', margin: '18px 0 6px' }}>{b.text}</h2>
          : b.kind === 'ul' ? <ul key={i} style={{ margin: '0 0 12px', paddingInlineStart: 22 }}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
            : <p key={i} style={{ margin: '0 0 12px', whiteSpace: 'pre-line' }}>{b.text}</p>,
      )}
    </div>
  );
}

export function LessonView({ view, lesson, isAdmin }: { view: CourseViewData; lesson: LessonRow & { done: boolean }; isAdmin: boolean }) {
  const { course, lessons, progress } = view;
  const i = lessons.findIndex((l) => l.id === lesson.id);
  const prev = i > 0 ? lessons[i - 1] : null;
  const next = i >= 0 && i < lessons.length - 1 ? lessons[i + 1] : null;
  // A draft lesson (admins only see one) cannot be marked: progress is recorded only on what is really open to a business.
  const canFinish = lesson.published && course.published;
  return (
    <Shell back={{ href: `${base}/${course.slug}`, label: course.title }}>
      {progress.total > 0 && <div style={{ margin: '10px 0 4px' }}><ProgressBar p={progress} /></div>}
      <h1 style={h1}>{lesson.title}{!lesson.published && isAdmin && <span style={draftTag}>טיוטה</span>}</h1>
      {minutesHe(lesson.minutes) && <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-2)', margin: '0 0 14px' }}>{minutesHe(lesson.minutes)}</p>}
      <VideoFrame url={lesson.video_url} title={lesson.title} />
      <LessonBody body={lesson.body} />
      {lesson.task && (
        <section style={{ background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '14px 16px', margin: '18px 0' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-lg)', margin: '0 0 6px' }}>המשימה שלך</h2>
          <p style={{ margin: 0, fontSize: 'var(--t-lg)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{lesson.task}</p>
        </section>
      )}
      {canFinish && (
        <FinishButton lessonId={lesson.id} initiallyDone={lesson.done} courseDoneAlready={view.certificate}
          nextHref={next ? `${base}/${course.slug}/${next.slug}` : null}
          certificateHref={`${base}/${course.slug}/certificate`} />
      )}
      <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24, fontSize: 'var(--t-md)' }} aria-label="מעבר בין שיעורים">
        {prev ? <a href={`${base}/${course.slug}/${prev.slug}`} style={backLink}>→ {prev.title}</a> : <span />}
        {next ? <a href={`${base}/${course.slug}/${next.slug}`} style={backLink}>{next.title} ←</a> : <span />}
      </nav>
    </Shell>
  );
}

export function CertificateView({ cert }: { cert: { name: string; business: string; course: string; completedAt: string } }) {
  return (
    <div dir="rtl" style={{ ...wrap, paddingTop: 8 }}>
      <style>{`@media print { .academy-noprint { display: none !important; } @page { size: A4 landscape; margin: 12mm; } body { background: #fff !important; } }`}</style>
      <p className="academy-noprint" style={{ margin: '0 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a href={base} style={backLink}>→ לכל הקורסים</a>
        <PrintButton />
      </p>
      <section data-testid="academy-certificate" style={{ background: 'var(--k-cream)', border: '2px solid var(--k-green)', borderRadius: 'var(--r-xl)', padding: '40px 24px', textAlign: 'center', boxShadow: 'inset 0 0 0 6px var(--k-cream), inset 0 0 0 7px var(--k-pink)' }}>
        <p style={{ fontSize: 'var(--t-md)', letterSpacing: '0.08em', color: 'var(--ink-2)', margin: 0 }}>Kalmea Academy</p>
        <h1 style={{ ...h1, fontSize: 'var(--t-hero)', color: 'var(--k-green)', margin: '10px 0 22px' }}>תעודת סיום</h1>
        {cert.name && <p style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-3xl)', fontWeight: 700, margin: '0 0 4px' }}>{cert.name}</p>}
        {cert.business && <p style={{ fontSize: 'var(--t-lg)', color: 'var(--ink-2)', margin: '0 0 18px' }}>{cert.business}</p>}
        <p style={{ fontSize: 'var(--t-lg)', margin: '0 0 6px' }}>סיימה בהצלחה את הקורס</p>
        <p style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--k-green)', margin: '0 0 22px' }}>{cert.course}</p>
        <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-2)', margin: 0 }}>{certificateDate(cert.completedAt)}</p>
      </section>
    </div>
  );
}
