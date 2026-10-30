// app/api/feedback/route.ts
//
// The feedback banner (app/FeedbackBanner.jsx, rules in lib/feedbackBanner).
//   GET   may the banner ask? available:false until add_product_feedback_2026-10-30.sql has run, submitted:true once this business answered.
//   POST  saves the answer. One row per business: a second send keeps the first answer and is not an error.
//
// Same shape as /api/support: the tenant comes from her session, never from the body, and the writes run on the service role because
// product_feedback is RLS deny-all with zero policies. She can add to it through here and cannot read it back.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { isDemoTenantId } from '@/lib/demoTenants';
import { cleanFeedback, isMissingTable } from '@/lib/feedbackBanner';

const STORE_ERROR = 'לא הצלחנו לשמור הפעם, והתשובות שלך עדיין כאן. נסי לשלוח שוב בעוד רגע.';

const serviceClient = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function sessionTenant() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return null;
  const { data: tenantId, error } = await session.rpc('get_user_tenant_id');
  if (error || !tenantId) {
    console.error('[feedback] tenant resolve failed:', error?.message);
    return null;
  }
  return { userId: user.id, tenantId: tenantId as string };
}

export async function GET() {
  try {
    const who = await sessionTenant();
    if (!who) return NextResponse.json({ available: false, submitted: false }, { status: 401 });
    if (isDemoTenantId(who.tenantId)) return NextResponse.json({ available: false, submitted: false });

    const { data, error } = await serviceClient().from('product_feedback').select('id').eq('tenant_id', who.tenantId).limit(1);
    if (error) {
      if (!isMissingTable(error.message)) console.error('[feedback] read failed:', error.code, error.message);
      return NextResponse.json({ available: false, submitted: false, reason: isMissingTable(error.message) ? 'table-missing' : 'read-failed' });
    }
    return NextResponse.json({ available: true, submitted: (data?.length ?? 0) > 0 });
  } catch (err) {
    console.error('[feedback] GET threw:', err);
    return NextResponse.json({ available: false, submitted: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ipLimited = checkIpLimit(request, 'feedback');
    if (ipLimited) return ipLimited;

    const who = await sessionTenant();
    if (!who) return NextResponse.json({ success: false, error: 'לא מחובר' }, { status: 401 });
    if (isDemoTenantId(who.tenantId)) return NextResponse.json({ success: false, error: 'בדמו אי אפשר לשמור תשובות' }, { status: 403 });

    const tenantLimited = checkTenantLimit(who.tenantId, 'feedback');
    if (tenantLimited) return tenantLimited;

    const clean = cleanFeedback(await request.json().catch(() => ({})));
    if (!clean.ok) return NextResponse.json({ success: false, error: clean.error }, { status: 400 });

    const { error } = await serviceClient().from('product_feedback').upsert({
      tenant_id: who.tenantId,        // from her session, never from the body
      user_id: who.userId,
      rating: clean.rating,
      answers: clean.answers,
      free_text: clean.freeText,
    }, { onConflict: 'tenant_id', ignoreDuplicates: true });

    if (error) {
      // Explicitly a failure: the banner keeps the form and her words, and never says thank you for something nobody received.
      console.error('[feedback] insert failed:', error.code, error.message);
      return NextResponse.json(
        { success: false, error: STORE_ERROR, reason: isMissingTable(error.message) ? 'table-missing' : 'insert-failed' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[feedback] POST threw:', err);
    return NextResponse.json({ success: false, error: STORE_ERROR }, { status: 500 });
  }
}
