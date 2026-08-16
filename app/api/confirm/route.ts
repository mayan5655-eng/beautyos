import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyConfirm } from '@/lib/confirmToken';

/**
 * Appointment confirm / cancel, called by the /confirm page.
 *
 * This route runs under the service-role key, which bypasses RLS, so it is
 * responsible for its own authorisation. It previously had none: a GET carrying
 * an appointment id would confirm or cancel that appointment in ANY tenant and
 * hand back the entire row. Three things are fixed here.
 *
 * 1. A signed token is required, binding the id to the action. The id alone is
 *    not a secret - it is mailed to the client in plaintext over WhatsApp, so
 *    anyone a message is forwarded to could previously cancel the booking.
 *    Binding the action too means a "confirm" link cannot be edited into a
 *    "cancel" link.
 *
 * 2. POST, not GET. Link-preview crawlers (WhatsApp, iMessage, Slack) fetch
 *    URLs automatically, so a GET with side effects meant a preview bot could
 *    silently cancel a real appointment just by rendering the message.
 *
 * 3. The response carries no appointment data. The old one returned the whole
 *    row - client name, service, price, note, client_id, tenant_id - to an
 *    unauthenticated caller.
 */

const okResponse = (action: string, alreadyDone = false) =>
  NextResponse.json({
    success: true,
    action,
    alreadyDone,
    message: alreadyDone
      ? action === 'confirm' ? 'התור כבר אושר בעבר' : 'התור כבר בוטל בעבר'
      : action === 'confirm' ? 'התור אושר בהצלחה' : 'התור בוטל בהצלחה',
  });

// One body for every failure - unknown id, wrong token, bad action. Varying it
// would turn this endpoint into an oracle for which appointment ids exist.
const reject = () =>
  NextResponse.json({ error: 'הקישור אינו תקין או שפג תוקפו' }, { status: 404 });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const appointmentId = String(body.id ?? '').trim();
    const action = String(body.action ?? 'confirm').trim();
    const token = String(body.token ?? '').trim();

    // Signature is checked BEFORE the database is touched, so an unsigned
    // request costs nothing and reveals nothing.
    if (!verifyConfirm(appointmentId, action, token)) return reject();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'הגדרות שרת חסרות' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: appt, error: fetchError } = await supabase
      .from('appointments')
      .select('confirmation_status')
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appt) return reject();

    // Idempotent, and compared against the requested ACTION rather than the
    // status alone - otherwise a confirmed appointment could never be cancelled
    // through its own link.
    if (action === 'confirm' && appt.confirmation_status === 'confirmed') return okResponse('confirm', true);
    if (action === 'cancel' && appt.confirmation_status === 'cancelled') return okResponse('cancel', true);

    const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
    const { error } = await supabase
      .from('appointments')
      .update({ confirmation_status: newStatus })
      .eq('id', appointmentId);

    if (error) {
      console.error('confirm: update failed', error.message);
      return NextResponse.json({ error: 'לא הצלחנו לעדכן את התור' }, { status: 500 });
    }

    return okResponse(action);
  } catch (error) {
    console.error('confirm: unexpected error', error);
    return NextResponse.json({ error: 'שגיאה בשרת' }, { status: 500 });
  }
}

// Removed rather than kept as an alias: every link already sent points at the
// old GET, and leaving it in place would leave the hole open.
export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
