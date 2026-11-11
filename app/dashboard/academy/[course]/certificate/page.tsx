// app/dashboard/academy/[course]/certificate/page.tsx: the completion certificate, a printable page. Exists only once every
// published lesson of the course is done (lib/academy.ts certificateEligible); before that it is a 404.
import { notFound } from 'next/navigation';
import { academyContext } from '../../context';
import { loadCertificate } from '@/lib/academyData';
import { CertificateView, MissingMigration, LoadError } from '../../AcademyViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תעודת סיום' };

type Props = { params: Promise<{ course: string }> };

export default async function AcademyCertificatePage({ params }: Props) {
  const { viewer, isAdmin, db } = await academyContext();
  const { course } = await params;
  const r = await loadCertificate(db, viewer, isAdmin, course);
  if (!r.ok) return r.reason === 'missing-migration' ? <MissingMigration /> : <LoadError />;
  if (!r.cert) notFound();
  return <CertificateView cert={r.cert} />;
}
