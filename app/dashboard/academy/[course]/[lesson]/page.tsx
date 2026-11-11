// app/dashboard/academy/[course]/[lesson]/page.tsx: one lesson: video (YouTube / Vimeo allowlist only), text, task, "סיימתי".
import { notFound } from 'next/navigation';
import { academyContext } from '../../context';
import { loadCourse } from '@/lib/academyData';
import { LessonView, MissingMigration, LoadError } from '../../AcademyViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'האקדמיה' };

type Props = { params: Promise<{ course: string; lesson: string }> };

export default async function AcademyLessonPage({ params }: Props) {
  const { viewer, isAdmin, db } = await academyContext();
  const { course, lesson } = await params;
  const r = await loadCourse(db, viewer, isAdmin, course);
  if (!r.ok) return r.reason === 'missing-migration' ? <MissingMigration /> : <LoadError />;
  const l = r.view?.lessons.find((x) => x.slug === lesson);
  if (!r.view || !l) notFound();
  return <LessonView view={r.view} lesson={l} isAdmin={isAdmin} />;
}
