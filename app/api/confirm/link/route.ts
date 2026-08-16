import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { confirmLinks } from '@/lib/confirmToken';

/**
 * Mints the signed confirm/cancel links for one appointment.
 *
 * The app builds reminder messages in the browser, which has no signing secret
 * and must never be given one. So it asks here instead.
 *
 * SECURITY: the tenant comes from the AUTHENTICATED session, never the request,
 * and the appointment is looked up through the caller's own session client - so
 * RLS applies and she can only mint links for appointments she can already see.
 * A logged-in user passing someone else's appointment id gets a 404, not a
 * signed link to another business's booking.
 */
export async function GET(request: NextRequest) {
  try {
    const appointmentId = new URL(request.url).searchParams.get('id');
    if (!appointmentId) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }

    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

    const { data: tenantId } = await session.rpc('get_user_tenant_id');
    if (!tenantId) return NextResponse.json({ error: 'לא זוהה עסק' }, { status: 400 });

    // Session client + explicit tenant filter. Either alone would do; both are
    // used because every other query in this app does the same.
    const { data: appt, error } = await session
      .from('appointments')
      .select('id')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !appt) {
      return NextResponse.json({ error: 'התור לא נמצא' }, { status: 404 });
    }

    const origin = new URL(request.url).origin;
    return NextResponse.json({ success: true, ...confirmLinks(origin, appointmentId) });
  } catch (err) {
    console.error('confirm/link: unexpected error', err);
    return NextResponse.json({ error: 'שגיאה בשרת' }, { status: 500 });
  }
}
