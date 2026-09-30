// app/api/admin/support/route.ts
// The one mutation the support inbox needs: mark a message handled or not.
//
// Same security model as app/api/admin/tenants/route.ts - requirePlatformAdmin()
// runs first on every request, a non-admin gets 404 not 403, writes use the
// service-role key because support_messages is RLS deny-all with zero
// policies. There is no delete here either: a handled message is marked, not
// removed, so the history stays intact.

import { NextResponse } from 'next/server';
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return notFound();

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  const handled = body?.handled === true;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'מזהה הודעה לא תקין' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('support_messages')
    .update({ handled_at: handled ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id, handled_at')
    .maybeSingle();

  if (error) {
    console.error('[admin/support] update failed:', error.message);
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'ההודעה לא נמצאה' }, { status: 404 });
  }

  console.log(`[admin/support] ${admin.userId} marked ${id} ${handled ? 'handled' : 'unhandled'}`);

  return NextResponse.json({ message: data });
}
