// app/api/calendar-feed/link/route.ts
//
// Her own calendar-feed link (lib/calendarFeed.ts). Signed-in only; the tenant
// comes from the session. POST {} returns the link, creating it on first use;
// POST { reset: true } rotates it so every copy of the old link stops working.

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { feedToken, feedUrls, newFeedNonce } from '@/lib/calendarFeed';
import { APP_URL } from '@/lib/appUrl';

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id');
    if (!tenantId) return Response.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const reset = body?.reset === true;

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: st, error } = await admin.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle();
    if (error || !st) return Response.json({ success: false, error: 'לא הצלחנו לקרוא את ההגדרות, אפשר לנסות שוב' }, { status: 500 });
    const autos = st.automations && typeof st.automations === 'object' ? { ...(st.automations as Record<string, unknown>) } : {};

    let nonce = typeof autos.calendar_feed_nonce === 'string' ? autos.calendar_feed_nonce : '';
    if (!nonce || reset) {
      nonce = newFeedNonce();
      const { error: upErr } = await admin.from('settings').update({ automations: { ...autos, calendar_feed_nonce: nonce } }).eq('tenant_id', tenantId);
      if (upErr) {
        console.error('[calendar-feed/link] save failed:', upErr.message);
        return Response.json({ success: false, error: 'לא הצלחנו לשמור את הקישור, אפשר לנסות שוב' }, { status: 500 });
      }
    }
    return Response.json({ success: true, ...feedUrls(APP_URL, feedToken(String(tenantId), nonce)) });
  } catch (err) {
    console.error('[calendar-feed/link] failed:', err instanceof Error ? err.message : String(err));
    return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
}
