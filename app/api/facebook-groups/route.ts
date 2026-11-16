// app/api/facebook-groups/route.ts
//
// "הקבוצות שלי" (lib/design/facebookGroups.js, supabase/migrations/add_facebook_groups_2026-11-16.sql).
//
//   GET                       -> { available, groups }   available=false until the SQL runs: the UI then hides the list
//   POST   { name, url, rule } -> { group }               add one (same link twice just answers the existing one)
//   PATCH  { id, posted }      -> { group }               posted=true marks "posted now", false clears it
//   DELETE ?id=                -> { success }             remove one from her list
//
// Session + tenant are checked here; the table has RLS with no policy, so the service-role client does the work and
// every query is pinned to her tenant_id. Nothing here calls Facebook.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/adminGuard';
import { callerTenantId } from '@/lib/tenantScope';
import { isMissingTable } from '@/lib/academyData';
import { cleanGroupInput, MAX_GROUPS } from '@/lib/design/facebookGroups';

const COLS = 'id, name, url, rule, last_posted_at, created_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

async function caller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const tenantId = await callerTenantId(supabase);
  return tenantId ? { tenantId: tenantId as string, db: createAdminClient() } : null;
}

export async function GET() {
  const c = await caller();
  if (!c) return fail('לא מחוברת', 401);
  const { data, error } = await c.db.from('facebook_groups').select(COLS).eq('tenant_id', c.tenantId).order('name').limit(MAX_GROUPS);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ success: true, available: false, groups: [] });
    console.error('[facebook-groups] list:', error.message);
    return fail('לא הצלחנו לטעון את הקבוצות', 500);
  }
  return NextResponse.json({ success: true, available: true, groups: data || [] });
}

export async function POST(request: NextRequest) {
  const c = await caller();
  if (!c) return fail('לא מחוברת', 401);
  const input = cleanGroupInput(await request.json().catch(() => null));
  if ('error' in input) return fail(input.error as string, 400);

  const existing = await c.db.from('facebook_groups').select(COLS).eq('tenant_id', c.tenantId).eq('url', input.url).maybeSingle();
  if (existing.data) return NextResponse.json({ success: true, group: existing.data });
  const { count } = await c.db.from('facebook_groups').select('id', { count: 'exact', head: true }).eq('tenant_id', c.tenantId);
  if ((count || 0) >= MAX_GROUPS) return fail(`אפשר לשמור עד ${MAX_GROUPS} קבוצות`, 400);

  const { data, error } = await c.db.from('facebook_groups').insert({ tenant_id: c.tenantId, ...input }).select(COLS).single();
  if (error) {
    console.error('[facebook-groups] add:', error.message);
    return fail('לא הצלחנו לשמור את הקבוצה', 500);
  }
  return NextResponse.json({ success: true, group: data });
}

export async function PATCH(request: NextRequest) {
  const c = await caller();
  if (!c) return fail('לא מחוברת', 401);
  const body = await request.json().catch(() => null);
  const id = String(body?.id || '');
  if (!UUID.test(id) || typeof body?.posted !== 'boolean') return fail('בקשה לא תקינה', 400);
  const { data, error } = await c.db.from('facebook_groups')
    .update({ last_posted_at: body.posted ? new Date().toISOString() : null })
    .eq('id', id).eq('tenant_id', c.tenantId).select(COLS).maybeSingle();
  if (error) {
    console.error('[facebook-groups] mark:', error.message);
    return fail('לא הצלחנו לסמן', 500);
  }
  if (!data) return fail('הקבוצה לא נמצאה', 404);
  return NextResponse.json({ success: true, group: data });
}

export async function DELETE(request: NextRequest) {
  const c = await caller();
  if (!c) return fail('לא מחוברת', 401);
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!UUID.test(id)) return fail('בקשה לא תקינה', 400);
  const { error } = await c.db.from('facebook_groups').delete().eq('id', id).eq('tenant_id', c.tenantId);
  if (error) {
    console.error('[facebook-groups] remove:', error.message);
    return fail('לא הצלחנו להסיר', 500);
  }
  return NextResponse.json({ success: true });
}
