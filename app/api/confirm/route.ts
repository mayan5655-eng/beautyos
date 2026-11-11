import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyConfirm } from '@/lib/confirmToken';
import { publicAccent } from '@/lib/branding';
import { notifyOwnerOfCancellation } from '@/lib/cancelNotify';
import { askGapFillAfterClientCancel } from '@/lib/ownerQuestions';
import { resolveBookingRules, clientLinkRefusal } from '@/lib/bookingPolicy';
import { growUiEnabled } from '@/lib/grow/adapter';
import { detect } from '@/lib/grow/cancelFees';
import { cancelDeps } from '@/app/api/grow/_cancel';
import { hebrewDate } from '@/lib/messages.js';
import { fmtApptTime } from '@/lib/apptTime';
import { runWaitlistOffer } from '@/lib/waitlistRuntime';
import { publicContactFor, type PublicContact } from '@/lib/publicContact';
import { langOfSettings, DEFAULT_LANG, type Lang } from '@/lib/i18n/core';
import { dateLabel } from '@/lib/i18n/dates';
import { trFor } from '@/lib/i18n/publicTr';

type Brand = { businessName?: string; logoUrl?: string; primaryColor?: string; language?: Lang };

// The day and time in the business's language (lib/i18n). Hebrew keeps hebrewDate, word for word as before.
const whenIn = (lang: Lang, date: string | null | undefined, time: string): string => {
  if (!date) return '';
  const T = trFor(lang);
  if (lang === 'he') return `ב${hebrewDate(date)}${time ? `, בשעה ${time}` : ''}`;
  const day = dateLabel(date, lang);
  return time ? T('ב{0}, בשעה {1}', [day, time]) : T('ב{0}', [day]);
};

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
// The message says WHEN, in her words, instead of a system "succeeded" (2026-11-03 UX review). `when` is the day and time her own
// message already told the client; `contact` is her public booking link and WhatsApp (lib/publicContact.ts), so a client who
// cancelled has somewhere to book again.
const okResponse = (action: string, alreadyDone = false, brand: Brand = {}, when = '', contact: PublicContact = { bookUrl: '', whatsapp: '' }) => {
  const tr = trFor(brand.language);
  return NextResponse.json({
    success: true,
    action,
    alreadyDone,
    businessName: brand.businessName || '',
    logoUrl: brand.logoUrl || '',
    primaryColor: brand.primaryColor || '',
    language: brand.language || DEFAULT_LANG,
    ...contact,
    message: alreadyDone
      ? action === 'confirm' ? (when ? tr('התור כבר אושר בעבר. נתראה {0} 🌸', [when]) : tr('התור כבר אושר בעבר')) : tr('התור כבר בוטל בעבר')
      : action === 'confirm'
        ? (when ? tr('נתראה {0} 🌸', [when]) : tr('נתראה בתור 🌸'))
        : (when ? tr('התור {0} בוטל, והשעה התפנתה.', [when]) : tr('התור בוטל, והשעה התפנתה.')),
  });
};

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
    // This route confirms or cancels, nothing else. A "reschedule" token is valid (lib/confirmToken.ts) but belongs to
    // app/api/confirm/reschedule: without this line it would reach the update below as a cancel.
    if (action !== 'confirm' && action !== 'cancel') return reject();
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
      .select('id, client_id, confirmation_status, tenant_id, name, service, date, start_minute, hour, duration')
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appt) return reject();

    // Public branding for the page header; best-effort - a failed read
    // leaves the confirmation working, just unbranded.
    let brand: Brand = {};
    let cancelWindowHours = 0;
    let settingsRow: { business_phone?: string | null; branding?: unknown } | null = null;
    try {
      const { data: st } = await supabase
        .from('settings')
        .select('business_name, branding, primary_color, business_phone')
        .eq('tenant_id', appt.tenant_id)
        .maybeSingle();
      settingsRow = st;
      cancelWindowHours = resolveBookingRules(st?.branding).cancelWindowHours;
      brand = {
        businessName: st?.business_name || '',
        logoUrl: (st?.branding as { logo_url?: string } | null)?.logo_url || '',
        primaryColor: publicAccent(st),
        language: langOfSettings(st),
      };
    } catch { /* unbranded, not broken */ }
    const tr = trFor(brand.language);

    // Her cancellation window: inside it the client's own link no longer cancels. She can still cancel in the
    // app, and the client is told to contact her. Only the CLIENT path is restricted; confirming is never blocked.
    // A booking made under a Grow cancellation policy is different: the client agreed that a late cancel has a fee, so the link must let her
    // cancel at any time (the fee, not a refusal, is the consequence) and the late cancel becomes a pending question for the cosmetician.
    let growDeps: ReturnType<typeof cancelDeps> = null;
    let underPolicy = false;
    if (action === 'cancel' && growUiEnabled(process.env, appt.tenant_id)) {
      try {
        growDeps = cancelDeps();
        underPolicy = !!growDeps && !!(await growDeps.repo.getConsent(appt.tenant_id, appointmentId));
      } catch { underPolicy = false; }
    }
    // What the link cannot do, from the same rule the cancel page is shown up front (lib/bookingPolicy.ts clientLinkRefusal).
    const startMin = appt.start_minute ?? (appt.hour != null ? Number(appt.hour) * 60 : null);
    const refusal = clientLinkRefusal({
      action, status: appt.confirmation_status, date: String(appt.date), startMinute: startMin,
      cancelWindowHours, underPolicy, businessName: brand.businessName,
    });
    // Her booking link and WhatsApp: only past the signature check (lib/publicContact.ts), for a refusal or a done cancel.
    const contact = await publicContactFor(supabase, appt.tenant_id, settingsRow);

    // { peek: true }: the cancel page asks WHICH appointment before she taps "cancel", and changes nothing.
    // Only after the signature check, and only what her own message already told her - treatment, day and
    // time. No name, phone, price or ids (point 3 above still holds). 2026-10-23 pass: the page asked
    // "לבטל את התור?" without saying which one.
    if (body.peek === true) {
      return NextResponse.json({
        success: true,
        peek: true,
        ...brand,
        status: appt.confirmation_status,
        appointment: { service: appt.service || '', date: appt.date ? dateLabel(appt.date, brand.language || DEFAULT_LANG) : '', time: fmtApptTime(appt) },
        // Read-only and advisory: a cancel the link could not do is shown as the calm refusal straight away, with how to reach
        // her, instead of a "yes, cancel" button that would only be refused after the tap. The real request below still decides.
        ...(action === 'cancel' && refusal ? { refusal: { error: tr(refusal.error), ...(refusal.tooLate ? { tooLate: true } : {}) }, ...contact } : {}),
      });
    }

    // Idempotent, and compared against the requested ACTION rather than the
    // status alone - otherwise a confirmed appointment could never be cancelled
    // through its own link.
    // (The day and time, and where she can book again: past the signature check and after the peek, which stays
    // treatment, day and time only. Used by the answers below.)
    const when = whenIn(brand.language || DEFAULT_LANG, appt.date, fmtApptTime(appt));

    if (action === 'confirm' && appt.confirmation_status === 'confirmed') return okResponse('confirm', true, brand, when, contact);
    if (action === 'cancel' && appt.confirmation_status === 'cancelled') return okResponse('cancel', true, brand, when, contact);
    // A cancelled appointment is never brought back through a public link: the slot may already be taken by someone else.
    if (action === 'confirm' && appt.confirmation_status === 'cancelled') {
      return NextResponse.json({
        success: false,
        businessName: brand.businessName || '',
        ...contact,
        error: tr('התור הזה בוטל. כדי לקבוע מחדש, אפשר ליצור קשר עם {0}.', [brand.businessName || tr('העסק')]),
      }, { status: 409 });
    }

    // A link only moves a booking that is still ahead and still open (2026-10-20 audit): a no-show stays a no-show, a visit that
    // already happened is not cancelled afterwards (which also opened a gap-fill question for a slot in the past), and a booking
    // held for an unpaid deposit is confirmed by paying, not by tapping "confirm".
    // A changed status, a slot already past, and (cancel only) her cancellation window: one rule, clientLinkRefusal
    // (`action === 'cancel' && cancelWindowHours > 0` and not underPolicy, via isInsideCancelWindow).
    // The window restricts only the CLIENT path; she can still cancel in the app. A booking under a Grow cancellation
    // policy is never refused by the window: the client agreed that a late cancel has a fee, and the late cancel becomes a
    // pending question for the cosmetician.
    if (refusal) {
      return NextResponse.json({
        success: false,
        ...(refusal.tooLate ? { tooLate: true } : {}),
        businessName: brand.businessName || '',
        ...contact,
        error: tr(refusal.error),
      }, { status: 409 });
    }
    if (action === 'confirm' && appt.confirmation_status === 'pending') {
      const { data: hold } = await supabase.from('appointment_policy_consents').select('status').eq('appointment_id', appointmentId).eq('tenant_id', appt.tenant_id).maybeSingle();
      if (hold && hold.status === 'awaiting_deposit') {
        return NextResponse.json({ success: false, businessName: brand.businessName || '', ...contact, error: tr('התור שמור עבורך עד שהמקדמה משולמת. אחרי התשלום הוא מאושר מעצמו.') }, { status: 409 });
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
      // The freed slot goes to her one-question card ("offer it to who is waiting?"), never straight out:
      // lib/ownerQuestions.js. Also under a fee policy: a fee does not stop the slot being free.
      after(() => askGapFillAfterClientCancel(supabase, { tenantId: appt.tenant_id, appt }).then(() => undefined));
      // Smart waitlist: with her switch on (off by default), the people waiting for this treatment whom the slot fits get one offer.
      after(() => runWaitlistOffer({ tenantId: appt.tenant_id, appt, db: supabase }).then(() => undefined).catch((e) => {
        console.error('confirm: waitlist offer failed', e instanceof Error ? e.message : String(e));
      }));
    }

    return okResponse(action, false, brand, when, contact);
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
