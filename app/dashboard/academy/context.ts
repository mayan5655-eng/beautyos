// app/dashboard/academy/context.ts
//
// SERVER ONLY. What every Academy page needs before it reads anything:
//   1. NEXT_PUBLIC_ACADEMY off -> notFound(). FIRST, before the session or the database is touched: the Academy does not exist.
//   2. The user and her business from the session (never from the URL). No session -> /login.
//   3. Whether she is a platform admin (sees drafts and every course, to check them before publishing).
//   4. The service-role client the loaders read with, every query filtered by the session's business and user (lib/academyData.ts).
import { notFound, redirect } from 'next/navigation';
import { academyEnabled } from '@/lib/academy';
import { resolveViewer, type Viewer, type Db } from '@/lib/academyData';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard';

export async function academyContext(): Promise<{ viewer: Viewer; isAdmin: boolean; db: Db }> {
  if (!academyEnabled()) notFound();
  const session = await createSessionClient();
  const viewer = await resolveViewer(session as never);
  if (!viewer) redirect('/login');
  const admin = await requirePlatformAdmin();
  return { viewer, isAdmin: admin.ok, db: createAdminClient() as unknown as Db };
}
