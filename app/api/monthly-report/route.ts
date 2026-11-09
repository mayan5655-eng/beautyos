// app/api/monthly-report/route.ts
//
// GET ?m=YYYY-MM: "הדוח החודשי שלך" for the LOGGED-IN owner, for /dashboard/monthly (where the note on the 1st opens).
// Without m: the last whole month. Any of the last 12 months, or this month so far. Same numbers as the note
// (lib/monthlyFullLoad.ts + lib/monthlyFull.ts), so the two agree.
//
// The tenant comes from her session (get_user_tenant_id), never from the request. The reads use the service role and are all
// filtered by that tenant in lib/monthlyFullLoad.ts; the plan gate runs first (the weekly digest's reason: the reads bypass RLS).
// Read only: nothing is written, nothing is sent.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { isDemoTenantId } from '@/lib/demoTenants';
import { loadMonthFull } from '@/lib/monthlyFullLoad';
import { parseMonthKey, defaultReportMonth, monthAllowed, availableMonths, monthlyPageOn, monthlyNoticeOn } from '@/lib/monthlyFull';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
    const { data: tenantId } = await session.rpc('get_user_tenant_id');
    if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
    if (!isDemoTenantId(String(tenantId))) {
      const guard = await requireActiveTenant(session);
      if (!guard.ok) return guard.response;
    }

    const now = new Date();
    const asked = new URL(request.url).searchParams.get('m');
    const month = asked ? parseMonthKey(asked) : defaultReportMonth(now);
    if (!month || !monthAllowed(month, now)) return NextResponse.json({ success: false, error: 'אפשר לפתוח רק את 12 החודשים האחרונים' }, { status: 400 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: settings, error: sErr } = await admin.from('settings').select('tenant_id, automations, business_tax_status').eq('tenant_id', tenantId).maybeSingle();
    if (sErr) throw new Error(`settings read failed: ${sErr.message}`);
    if (!monthlyPageOn(settings)) return NextResponse.json({ success: false, error: 'הדוח החודשי לא פעיל אצלך כרגע' }, { status: 404 });

    const report = await loadMonthFull(admin, String(tenantId), settings, month, now);
    return NextResponse.json({
      success: true, report, months: availableMonths(now),
      noticeOn: monthlyNoticeOn(settings), needsStatus: !settings?.business_tax_status,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[monthly-report] failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את הדוח, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
}
