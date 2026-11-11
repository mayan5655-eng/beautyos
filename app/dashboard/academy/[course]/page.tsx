// app/dashboard/academy/[course]/page.tsx: one course and its lessons. A course she cannot open is a plain 404, never a teaser.
import { notFound } from 'next/navigation';
import { academyContext } from '../context';
import { loadCourse } from '@/lib/academyData';
import { CourseView, MissingMigration, LoadError } from '../AcademyViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'האקדמיה' };

type Props = { params: Promise<{ course: string }> };

export default async function AcademyCoursePage({ params }: Props) {
  const { viewer, isAdmin, db } = await academyContext();
  const { course } = await params;
  const r = await loadCourse(db, viewer, isAdmin, course);
  if (!r.ok) return r.reason === 'missing-migration' ? <MissingMigration /> : <LoadError />;
  if (!r.view) notFound();
  return <CourseView view={r.view} isAdmin={isAdmin} />;
}
