// app/api/designs/share-event/route.ts
//
// POST /api/designs/share-event { kind, outcome, canShare?, source? }
//
// One line of "did getting the post onto her phone work" from the save/share panel (app/design/SaveShare.jsx), so
// the admin panel shows failures before a customer has to complain (2026-10-24: one did). Fire-and-forget from the
// client: this never answers an error the panel would show, and it stores no picture, caption or full user agent -
// only her tenant, the outcome and the phone family (supabase/migrations/add_share_events.sql).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/adminGuard';
import { callerTenantId } from '@/lib/tenantScope';
import { inAppBrowser, isIos, isTouchDevice } from '@/lib/design/sharePost';
import { cleanShareEvent } from '@/lib/design/shareEvent';

const ok = (recorded: boolean) => NextResponse.json({ success: true, recorded });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const event = cleanShareEvent(body);
  if (!event) return NextResponse.json({ success: false, error: 'bad event' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const tenantId = await callerTenantId(supabase);
  if (!tenantId) return ok(false);

  const ua = request.headers.get('user-agent') || '';
  // iPadOS reports a Mac user agent; the server cannot see touch points, so an iPad counts as desktop here.
  const device = isIos(ua) ? 'ios' : isTouchDevice(ua) ? 'android' : 'desktop';
  const { error } = await createAdminClient().from('share_events').insert({ tenant_id: tenantId, ...event, device, in_app: inAppBrowser(ua) });
  if (error) {
    // Missing table (add_share_events.sql not run yet) or anything else: logged, never surfaced to her.
    console.error('[share-event] not recorded:', error.message);
    return ok(false);
  }
  return ok(true);
}
