// app/api/weekly-digest/route.ts
//
// GET: "הסיכום השבועי שלך" for the LOGGED-IN owner, computed now, for /dashboard/digest (where the Sunday notification
// and its push open). Same numbers and actions as the cron sends (lib/weeklyDigestLoad.ts + lib/weeklyDigest.ts).
//
// The tenant comes from her session (get_user_tenant_id, the RLS function), never from the request. The reads use the
// service role because the manual WhatsApp queue has no SELECT policy for her (see app/api/messages), and every one of
// them is filtered by that session tenant in lib/weeklyDigestLoad.ts. Read only: nothing is written, nothing is sent.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { buildDigest } from '@/lib/weeklyDigest';
import { loadDigestInput } from '@/lib/weeklyDigestLoad';
import { isYomTov } from '@/lib/greetings/calendar';
import { requireActiveTenant } from '@/lib/planGuard';
import { isDemoTenantId } from '@/lib/demoTenants';

export const dynamic = 'force-dynamic';

const SETTINGS_COLS = 'tenant_id, branding, automations, business_hours, working_days, working_hours_start, working_hours_end';

export async function GET() {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
    const { data: tenantId } = await session.rpc('get_user_tenant_id');
    if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
    // The plan gate BEFORE the service role (2026-11-08, a Vercel security finding): the reads below bypass RLS, so without
    // this an expired or paused business could keep reading her numbers here while the closed-read RLS block
    // (add_closed_read_block_2026-10-25.sql) hides them everywhere else. Same predicate as RLS (is_tenant_active), same
    // demo-tenant exception, same 402 answer as every other gated route.
    if (!isDemoTenantId(String(tenantId))) {
      const guard = await requireActiveTenant(session);
      if (!guard.ok) return guard.response;
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: settings, error: sErr } = await admin.from('settings').select(SETTINGS_COLS).eq('tenant_id', tenantId).maybeSingle();
    if (sErr) throw new Error(`settings read failed: ${sErr.message}`);

    const input = await loadDigestInput(admin, String(tenantId), settings, new Date(), isYomTov);
    const digest = buildDigest(input);
    return NextResponse.json({ success: true, digest }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[weekly-digest] failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את הסיכום, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
}
