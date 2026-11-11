// app/api/academy/summary/route.ts
//
// Whether the "אקדמיה" menu entry should show for the signed-in business: only when NEXT_PUBLIC_ACADEMY is on AND she can open at
// least one course (a platform admin always, to manage it). A business with nothing open sees no entry at all, so nothing leads to
// an empty screen. 404 while the flag is off. Session only; returns a boolean and a count, nothing else.
import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createAdminClient, requirePlatformAdmin } from '@/lib/adminGuard';
import { academyEnabled } from '@/lib/academy';
import { resolveViewer, loadCatalog, type Db } from '@/lib/academyData';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!academyEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const viewer = await resolveViewer((await createSessionClient()) as never);
  if (!viewer) return NextResponse.json({ show: false }, { status: 401 });
  const isAdmin = (await requirePlatformAdmin()).ok;
  const r = await loadCatalog(createAdminClient() as unknown as Db, viewer, isAdmin);
  if (!r.ok) return NextResponse.json({ show: isAdmin, courses: 0 });
  return NextResponse.json({ show: isAdmin || r.items.length > 0, courses: r.items.length }, { headers: { 'Cache-Control': 'private, no-store' } });
}
