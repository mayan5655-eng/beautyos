// app/api/admin/academy/route.ts
//
// The platform admin's Academy actions: save a course or a lesson, grant or revoke a course for a business (lib/academyAdmin.ts).
// NEXT_PUBLIC_ACADEMY off -> 404. requirePlatformAdmin() runs on every request; a non-admin gets 404 (a 403 would confirm the
// endpoint exists). Writes use the service role. Nothing is ever deleted.
import { NextResponse } from 'next/server';
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard';
import { academyEnabled } from '@/lib/academy';
import { runAdminAction } from '@/lib/academyAdmin';
import type { Db } from '@/lib/academyData';

export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function POST(request: Request) {
  if (!academyEnabled()) return notFound();
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return notFound();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await runAdminAction(createAdminClient() as unknown as Db, body && typeof body === 'object' ? body : {}, admin.userId);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('[academy-admin] action failed:', (e as Error)?.message);
    return NextResponse.json({ error: 'הפעולה נכשלה' }, { status: 500 });
  }
}
