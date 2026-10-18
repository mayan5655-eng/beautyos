import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyConfirm } from '@/lib/confirmToken';
import { publicAccent } from '@/lib/branding';
import { notifyOwnerOfCancellation } from '@/lib/cancelNotify';
import { resolveBookingRules, isInsideCancelWindow } from '@/lib/bookingPolicy';
import { growUiEnabled } from '@/lib/grow/adapter';
import { detect } from '@/lib/grow/cancelFees';
import { cancelDeps } from '@/app/api/grow/_cancel';

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

// Branding rides only on the SUCCESS path, after the signature check: the
// same public logo and name her booking page shows, and nothing else - the
// no-data rule above still holds for everything about the appointment.
const okResponse = (action: string, alreadyDone = false, brand: { businessName?: string; logoUrl?: string; primaryColor?: string } = {}) =>
  NextResponse.json({
    success: true,
    action,
    alreadyDone,
    businessName: brand.businessName || '',
    logoUrl: brand.logoUrl || '',
    primaryColor: brand.primaryColor || '',
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
      .select('confirmation_status, tenant_id, name, service, date, start_minute, hour, duration')
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appt) return reject();

    // Public branding for the page header; best-effort - a failed read
    // leaves the confirmation working, just unbranded.
    let brand: { businessName?: string; logoUrl?: string; primaryColor?: string } = {};
    let cancelWindowHours = 0;
    try {
      const { data: st } = await supabase
        .from('settings')
        .select('business_name, branding, primary_color')
        .eq('tenant_id', appt.tenant_id)
        .maybeSingle();
      cancelWindowHours = resolveBookingRules(st?.branding).cancelWindowHours;
      brand = {
        businessName: st?.business_name || '',
        logoUrl: (st?.branding as { logo_url?: string } | null)?.logo_url || '',
        primaryColor: publicAccent(st),
      };
    } catch { /* unbranded, not broken */ }

    // Idempotent, and compared against the requested ACTION rather than the
    // status alone - otherwise a confirmed appointment could never be cancelled
    // through its own link.
    if (action === 'confirm' && appt.confirmation_status === 'confirmed') return okResponse('confirm', true, brand);
    if (action === 'cancel' && appt.confirmation_status === 'cancelled') return okResponse('cancel', true, brand);

    // Her cancellation window: inside it the client's own link no longer cancels. She can still cancel in the
    // app, and the client is told to contact her. Only the CLIENT path is restricted; confirming is never blocked.
    // A booking made under a Grow cancellation policy is different: the client agreed that a late cancel has a fee, so the link must let her
    // cancel at any time (the fee, not a refusal, is the consequence) and the late cancel becomes a pending question for the cosmetician.
    let growDeps: ReturnType<typeof cancelDeps> = null;
    let underPolicy = false;
    if (action === 'cancel' && growUiEnabled()) {
      try {
        growDeps = cancelDeps();
        underPolicy = !!growDeps && !!(await growDeps.repo.getConsent(appt.tenant_id, appointmentId));
      } catch { underPolicy = false; }
    }
    if (action === 'cancel' && cancelWindowHours > 0 && !underPolicy) {
      const startMin = appt.start_minute ?? (appt.hour != null ? Number(appt.hour) * 60 : null);
      if (startMin !== null && isInsideCancelWindow(String(appt.date), Number(startMin), cancelWindowHours)) {
        return NextResponse.json({
          success: false,
          tooLate: true,
          businessName: brand.businessName || '',
          error: `אפשר לבטל דרך הקישור עד ${cancelWindowHours} שעות לפני התור. כדי לבטל עכשיו, אפשר ליצור קשר ישירות עם ${brand.businessName || 'העסק'}.`,
        }, { status: 409 });
      }
    }

    const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
    // A cancellation carries WHEN it happened: that is what separates a late
    // cancellation from an on-time one on the client's card. The audit columns
    // are added by hand (add_till_and_calendar_small_things.sql); until they
    // exist the update is retried without them, as the app's own cancel does.
    const patch: Record<string, unknown> = { confirmation_status: newStatus };
    if (newStatus === 'cancelled') { patch.cancelled_at = new Date().toISOString(); patch.cancelled_by = 'client'; }
    let { error } = await supabase.from('appointments').update(patch).eq('id', appointmentId);
    if (error && /cancelled_at|cancelled_by|schema cache|does not exist/i.test(String(error.message || ''))) {
      ({ error } = await supabase.from('appointments').update({ confirmation_status: newStatus }).eq('id', appointmentId));
    }

    if (error) {
      console.error('confirm: update failed', error.message);
      return NextResponse.json({ error: 'לא הצלחנו לעדכן את התור' }, { status: 500 });
    }

    // Tell her, the way a person would: who, which slot, that it is free again,
    // and who is waiting. Best-effort; never turns a done cancellation into an
    // error. Scheduled via after(), not awaited: the cancellation above is
    // already committed, so nothing past this point may delay or fail the
    // response the client's browser is waiting on.
    if (newStatus === 'cancelled' && underPolicy && growDeps) {
      const deps = growDeps;
      after(() => detect(deps, { tenantId: appt.tenant_id, appointmentId, event: 'cancel', actor: 'client' }).then(() => undefined).catch((e) => {
        console.warn('confirm: fee detection failed', e instanceof Error ? e.message : String(e));
      }));
    }
    if (newStatus === 'cancelled') {
      after(() =>
        notifyOwnerOfCancellation({ supabase, tenantId: appt.tenant_id, appt }).catch((e) => {
          console.error('confirm: owner notify failed', e instanceof Error ? e.message : String(e));
        })
      );
    }

    return okResponse(action, false, brand);
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
