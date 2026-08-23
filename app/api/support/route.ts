// app/api/support/route.ts
//
// Where the persistent "תקועה?" button sends her message.
//
// ── Identity comes from the session, never from the caller ─────────────────
// The tenant is resolved with get_user_tenant_id() on HER session client, the
// same function the RLS policies use. The request body carries her message and
// her current screen, and nothing else that matters. A caller cannot file a
// message against another business by putting a different id in the body,
// because the body's opinion of who she is is never read.
//
// The insert runs on the service role because support_messages is RLS deny-all
// with zero policies (see supabase/migrations/pending/support-messages.sql):
// she must be able to add to it through here, and never to read it.
//
// ── What is stored ─────────────────────────────────────────────────────────
// tenant_id, user_id, her message, the tab she was on, the build, and the last
// Sentry event id her browser saw. NO client data: nothing here reads clients,
// appointments, photos or notes, and the table has no column that could hold
// them.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';

const MAX_MESSAGE = 4000;
const MAX_SHORT = 120;

const short = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_SHORT) : null;

export async function POST(request: Request) {
  try {
    const ipLimited = checkIpLimit(request, 'support');
    if (ipLimited) return ipLimited;

    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'לא מחובר' }, { status: 401 });
    }

    const { data: tenantId, error: rpcErr } = await session.rpc('get_user_tenant_id');
    if (rpcErr || !tenantId) {
      console.error('[support] tenant resolve failed:', rpcErr?.message);
      return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
    }

    const tenantLimited = checkTenantLimit(tenantId as string, 'support');
    if (tenantLimited) return tenantLimited;

    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return NextResponse.json({ success: false, error: 'נא לכתוב מה קרה' }, { status: 400 });
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error } = await admin.from('support_messages').insert({
      tenant_id: tenantId,            // from her session, never from the body
      user_id: user.id,
      message: message.slice(0, MAX_MESSAGE),
      tab: short(body?.tab),
      app_version: short(body?.appVersion),
      sentry_event_id: short(body?.sentryEventId),
    });

    if (error) {
      // Explicitly a failure. The caller MUST NOT render a success here: a
      // "we got your message" that reached nobody is worse than an error,
      // because she stops asking and waits for a reply that is never coming.
      console.error('[support] insert failed:', error.code, error.message);
      const missingTable =
        /support_messages/i.test(error.message) &&
        /does not exist|schema cache|relation/i.test(error.message);
      return NextResponse.json(
        {
          success: false,
          error: 'לא הצלחנו לשלוח את ההודעה',
          reason: missingTable ? 'table-missing' : 'insert-failed',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err);
    console.error('[support] threw:', m);
    return NextResponse.json(
      { success: false, error: 'לא הצלחנו לשלוח את ההודעה' },
      { status: 500 }
    );
  }
}
