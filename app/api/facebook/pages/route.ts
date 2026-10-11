// app/api/facebook/pages/route.ts
//
// Turn lead delivery on or off for one of HER connected Facebook Pages.
//   POST { pageId: string, active: boolean }  -> { success, active }
//
// The OAuth callback connects every Page the user manages and subscribes them all to the leadgen webhook.
// That is right for most, but a business that also administers a friend's or a former employer's Page had no
// way to stop leads from it landing in her pipeline, and no way to disconnect at all. This is that switch.
//
// Off: the Page row is KEPT (is_active=false: the webhook already skips an inactive Page and says so in the
// events list) and the app's webhook subscription is removed from Meta, best effort. On: subscribed again.
// Nothing is deleted. Tenant comes from the session, never the body; the row is matched on tenant AND page.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { requireActiveTenant } from '@/lib/planGuard';
import { FacebookClient } from '@/lib/facebook/client';
import { decryptToken } from '@/lib/facebook/encryption';
import { callerTenantId } from '@/lib/tenantScope';

export async function POST(request: Request) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const tenantId = await callerTenantId(session);
  if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
  const guard = await requireActiveTenant(session);
  if (!guard.ok) return guard.response;

  let body: { pageId?: unknown; active?: unknown } = {};
  try { body = await request.json(); } catch { /* empty */ }
  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : '';
  if (!/^\d{1,30}$/.test(pageId) || typeof body.active !== 'boolean') {
    return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  }
  const active = body.active;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: row, error: readErr } = await db
    .from('facebook_pages')
    .select('page_id, page_access_token_encrypted, is_active')
    .eq('tenant_id', tenantId)
    .eq('page_id', pageId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ success: false, error: 'שגיאה בקריאת הדף' }, { status: 500 });
  if (!row) return NextResponse.json({ success: false, error: 'הדף לא נמצא' }, { status: 404 });

  // Meta first, best effort: the row is what the webhook obeys, so a Meta failure never blocks the switch.
  let metaOk: boolean | null = null;
  try {
    const token = decryptToken(row.page_access_token_encrypted);
    const fb = new FacebookClient(token);
    metaOk = active ? await fb.subscribePageToWebhook(pageId, token) : await fb.unsubscribePageFromWebhook(pageId, token);
  } catch (e) {
    console.error('[facebook/pages] meta call failed:', e instanceof Error ? e.message : e);
  }

  const { error: upErr } = await db
    .from('facebook_pages')
    .update({ is_active: active })
    .eq('tenant_id', tenantId)
    .eq('page_id', pageId);
  if (upErr) {
    console.error('[facebook/pages] update failed:', upErr.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לשמור. נסי שוב בעוד רגע.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, active, metaSynced: metaOk });
}
