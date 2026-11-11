// app/dashboard/academy/page.tsx: "האקדמיה", the courses she can open. 404 while NEXT_PUBLIC_ACADEMY is off (academyContext).
import { academyContext } from './context';
import { loadCatalog } from '@/lib/academyData';
import { CatalogView, MissingMigration, LoadError } from './AcademyViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'האקדמיה' };

export default async function AcademyPage() {
  const { viewer, isAdmin, db } = await academyContext();
  const r = await loadCatalog(db, viewer, isAdmin);
  if (!r.ok) return r.reason === 'missing-migration' ? <MissingMigration /> : <LoadError />;
  return <CatalogView items={r.items} isAdmin={isAdmin} />;
}
