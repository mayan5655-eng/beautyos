import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyConfirm } from '@/lib/confirmToken';
import { publicAccent } from '@/lib/branding';
import { resolveBookingRules, clientLinkRefusal, wallClockNow } from '@/lib/bookingPolicy';
import { hebrewDate } from '@/lib/messages.js';
import { fmtApptTime, fmtTime, startMinute as apptStart, endMinute as apptEnd, startFields } from '@/lib/apptTime';
import { resolveLunch } from '@/lib/lunchBreak';
import { bufferLookup, businessBufferDefault, serviceBufferMinutes, bufferedRange } from '@/lib/serviceBuffer';
import { isMissingColumnError, missingColumnName } from '@/lib/pgError';
import { checkIpLimit, checkTenantLimit, checkRescheduleLinkLimit } from '@/lib/rateLimit';
import { tenantIsBlocked } from '@/lib/tenantActive';
import { notifyOwner } from '@/lib/ownerNotify';
import { askGapFillAfterClientCancel } from '@/lib/ownerQuestions';
import { runWaitlistOffer } from '@/lib/waitlistRuntime';
import { publicContactFor } from '@/lib/publicContact';
import {
  maxMovesFrom, cleanMoveCount, rescheduleDays, moveSlotProblem, addDays, movesUsedHe, ownerMoveMessage,
  consentReadFrom, moveWindowHours, moveConsentUnreadableHe,
  MOVE_HELD_HE, RESCHEDULE_COPY, type BusyRange,
} from '@/lib/reschedule';

/**
 * "להזיז את התור": the client moves her own appointment from her link (lib/reschedule.ts has the rules and why).
 *
 * Same authorisation as app/api/confirm, which this sits next to: service-role key, so the route is its own guard.
 *  - A signed token binds the appointment id to an action. Accepted: a "reschedule" token, or the "cancel" token every
 *    confirmation and reminder already carries (a move frees the slot just as a cancel does, so the cancel link holder is
 *    the right person, and the messages already sent keep working). A "confirm" token can NOT move an appointment.
 *  - Tenant-scoped: every read and the write filter by the appointment's own tenant_id.
 *  - Rate-limited per device, per link (appointment) and per business (lib/rateLimit.ts), and at most N moves per appointment.
 *  - Only the date and start come from the request, and both are validated. The treatment, its length, the tenant and the
 *    row stay the appointment's own: the patch below names its columns, nothing from the body is spread into it.
 *  - POST only (a link-preview crawler must not move anything). { peek: true } reads and changes nothing.
 *  - The answer carries what her own message already told her (treatment, day, time) and the free times. No name,
 *    phone, price or ids.
 */

const reject = () => NextResponse.json({ error: 'הקישור אינו תקין או שפג תוקפו' }, { status: 404 });

// automations: notifyOwner (lib/ownerNotify.js) reads automations.owner_alert_whatsapp and owner_phone from this row for her
// opt-in WhatsApp copy, exactly as the cancel path does (lib/cancelNotify.js). Without it the "תור הוזז" notice reached the app and
// push only. Never returned to the client: the response carries brand + publicContactFor only.
const SETTINGS_COLS = 'business_name, branding, primary_color, business_phone, automations, business_hours, working_hours_start, working_hours_end, working_days';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKEN_CHARS = 512;
const LIVE = ['pending', 'confirmed'];

type Appt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const whenHe = (date: string, start: number | null) => `ב${hebrewDate(date)}${start != null ? `, בשעה ${fmtTime(start)}` : ''}`;

export async function POST(request: NextRequest) {
  try {
    const ipLimited = checkIpLimit(request, 'reschedule');
    if (ipLimited) return ipLimited;

    const raw = await request.json().catch(() => null);
    // A JSON null, array or string is not a request: refused like a bad link, not a 500.
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return reject();
    const body = raw as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const via = body.via === undefined ? 'reschedule' : body.via;
    if (via !== 'reschedule' && via !== 'cancel') return reject();
    if (!UUID_RE.test(id) || !token || token.length > MAX_TOKEN_CHARS) return reject();
    // Signature before the database, so an unsigned request costs nothing and reveals nothing.
    if (!verifyConfirm(id, via, token)) return reject();
    const linkLimited = checkRescheduleLinkLimit(id);
    if (linkLimited) return linkLimited;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'הגדרות שרת חסרות' }, { status: 500 });
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // select('*'): reschedule_count (add_reschedule_intake_2026-11-09.sql) and buffer_minutes may not exist yet. Read on the server only.
    const { data: appt, error: readErr } = await db.from('appointments').select('*').eq('id', id).maybeSingle() as { data: Appt | null; error: unknown };
    if (readErr || !appt || appt.kind === 'personal') return reject();
    const tenantId = String(appt.tenant_id);

    const tenantLimited = checkTenantLimit(tenantId, 'reschedule');
    if (tenantLimited) return tenantLimited;

    const { data: st, error: stErr } = await db.from('settings').select(SETTINGS_COLS).eq('tenant_id', tenantId).maybeSingle();
    // Her hours and rules come from this row: a failed read must not fall back to defaults that would offer times she refuses.
    if (stErr) return NextResponse.json({ error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע?' }, { status: 503 });
    const settings = (st || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const brand = {
      businessName: String(settings.business_name || ''),
      logoUrl: String((settings.branding as { logo_url?: string } | null)?.logo_url || ''),
      primaryColor: publicAccent(st),
    };
    const contact = await publicContactFor(db, tenantId, st as never);
    const rules = resolveBookingRules(settings.branding);
    const oldStart = apptStart(appt);
    const oldDate = String(appt.date || '');
    const summary = { service: String(appt.service || ''), date: oldDate ? hebrewDate(oldDate) : '', time: fmtApptTime(appt) };

    const refuse = (error: string, extra: Record<string, unknown> = {}) =>
      NextResponse.json({ success: false, refused: true, ...brand, ...contact, appointment: summary, error, ...extra }, { status: 409 });

    // ── Can this appointment be moved from the link at all? ─────────────────────────────────────────────────────
    if (await tenantIsBlocked(db, tenantId)) return refuse(`כדי להזיז את התור אפשר ליצור קשר ישירות עם ${brand.businessName || 'העסק'}.`, { tooLate: true });
    if (appt.confirmation_status === 'cancelled') return refuse(`התור הזה בוטל. כדי לקבוע מחדש, אפשר ליצור קשר עם ${brand.businessName || 'העסק'}.`);
    // The Grow policy she agreed to, for EVERY move (not only a deposit hold): its snapshot window is what a later cancel is judged by
    // (lib/grow/cancelFees.ts detect), so the move is judged by max(branding window, snapshot window). Read-only here: the consent
    // row, its snapshot and its status are never written by a move, so a fee that applies keeps applying. Unreadable = refuse.
    const consent = consentReadFrom(await db.from('appointment_policy_consents').select('status, snapshot').eq('appointment_id', id).eq('tenant_id', tenantId).maybeSingle());
    const windowHours = moveWindowHours(rules.cancelWindowHours, consent);
    if (windowHours === null) return refuse(moveConsentUnreadableHe(brand.businessName), { tooLate: true });
    const refusal = clientLinkRefusal({
      action: 'reschedule', status: appt.confirmation_status, date: oldDate, startMinute: oldStart,
      cancelWindowHours: windowHours, businessName: brand.businessName,
    });
    if (refusal) return refuse(refusal.error, refusal.tooLate ? { tooLate: true } : {});
    // A row without a start time, or one whose day is already behind her, is not moved from a link: clientLinkRefusal can only
    // see "past" when it knows the start, and the guarded update below needs the old start to pin the row it changes.
    if (oldStart == null || !/^\d{4}-\d{2}-\d{2}$/.test(oldDate) || oldDate < wallClockNow().date) {
      return refuse(`כדי לשנות את התור הזה אפשר ליצור קשר ישירות עם ${brand.businessName || 'העסק'}.`, { tooLate: true });
    }
    if (consent.state === 'row' && consent.row.status === 'awaiting_deposit') return refuse(MOVE_HELD_HE);
    const maxMoves = maxMovesFrom(settings.branding);
    const hasCountColumn = Object.prototype.hasOwnProperty.call(appt, 'reschedule_count');
    // The column (add_reschedule_intake_2026-11-09.sql), and her 'reschedule' notifications for this appointment: before the
    // migration the notifications are the only count, and after it they still hold the moves made before it ran.
    const { count: notified } = await db.from('owner_notifications').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('appointment_id', id).eq('kind', 'reschedule');
    const used = Math.max(cleanMoveCount(appt.reschedule_count), cleanMoveCount(notified));
    if (used >= maxMoves) return refuse(movesUsedHe(maxMoves, brand.businessName), { tooLate: true });

    // ── Her calendar, without this appointment ───────────────────────────────────────────────────────────────
    const duration = Number(appt.duration) > 0 ? Number(appt.duration) : 60;
    const bufferDefault = businessBufferDefault(settings.branding);
    const { data: menu } = await db.from('service_prices').select('*').eq('tenant_id', tenantId);
    const svcRow = (menu || []).find((s: Appt) => s.name === appt.service && s.active !== false) || null;
    const buffer = serviceBufferMinutes(svcRow, bufferDefault);
    const bufferOf = bufferLookup(menu || [], bufferDefault);
    const today = wallClockNow().date;
    const { data: rows, error: calErr } = await db.from('appointments').select('*')
      .eq('tenant_id', tenantId).gte('date', today).lte('date', addDays(today, rules.maxDaysAhead))
      .neq('confirmation_status', 'cancelled').neq('id', id).limit(2000);
    // "Nothing is booked" and "I could not find out" are different answers: an unreadable calendar offers nothing.
    if (calErr) return NextResponse.json({ error: 'לא הצלחנו לטעון את היומן, אפשר לנסות שוב בעוד רגע?' }, { status: 503 });
    const busyByDate: Record<string, BusyRange[]> = {};
    for (const a of (rows || []) as Appt[]) {
      const s = apptStart(a), e = apptEnd(a);
      if (s === null || e === null) continue;
      (busyByDate[String(a.date)] ||= []).push(bufferedRange(s, e, bufferOf(a)));
    }
    const q = { hours: settings, rules, duration, buffer, lunch: resolveLunch(settings.branding), busyByDate };

    if (body.peek === true) {
      const days = rescheduleDays({ ...q, skip: oldStart != null ? { date: oldDate, start: oldStart } : null });
      return NextResponse.json({
        success: true, peek: true, ...brand, ...contact, appointment: summary, movesLeft: maxMoves - used,
        days: days.map((d) => ({ date: d.date, label: hebrewDate(d.date), slots: d.slots.map((m) => ({ start: m, label: fmtTime(m) })) })),
      });
    }

    // ── The move ──────────────────────────────────────────────────────────────────────────────────────────────
    // Strict types: a string date in YYYY-MM-DD and an integer minute. Number('') is 0 and Number([600]) is 600, so no coercion.
    const date = typeof body.date === 'string' ? body.date : '';
    const newStart = typeof body.startMinute === 'number' && Number.isInteger(body.startMinute) ? body.startMinute : Number.NaN;
    const problem = moveSlotProblem({ ...q, date, start: newStart });
    if (problem === 'bad') return NextResponse.json({ success: false, error: 'השעה שנבחרה לא תקינה, אפשר לבחור שוב?' }, { status: 400 });
    if (problem === 'taken') return NextResponse.json({ success: false, code: 'slot_taken', error: RESCHEDULE_COPY.taken }, { status: 409 });
    if (problem) return NextResponse.json({ success: false, code: 'slot_unavailable', error: 'השעה הזו כבר לא פנויה להזזה, אפשר לבחור שעה אחרת?' }, { status: 409 });
    if (date === oldDate && newStart === oldStart) return NextResponse.json({ success: false, error: 'זו השעה שכבר קבועה לך. אפשר לבחור שעה אחרת.' }, { status: 400 });

    // ONE update of the same row: the old time is freed and the new one held in the same statement, and the database's
    // uniq_appt_slot_active / appointments_no_overlap refuse a time a parallel booking took (lib/booking.ts). The filters on
    // the OLD date, start and status make a second, concurrent move of the same appointment change nothing.
    let patch: Record<string, unknown> = { date, ...startFields(newStart), buffer_minutes: buffer, ...(hasCountColumn ? { reschedule_count: used + 1 } : {}) };
    const run = (p: Record<string, unknown>) => {
      let u = db.from('appointments').update(p).eq('id', id).eq('tenant_id', tenantId).eq('date', oldDate).in('confirmation_status', LIVE);
      if (appt.start_minute != null) u = u.eq('start_minute', appt.start_minute);
      if (hasCountColumn) u = appt.reschedule_count == null ? u.is('reschedule_count', null) : u.eq('reschedule_count', appt.reschedule_count);
      return u.select('id').maybeSingle();
    };
    let res = await run(patch);
    // Only the two optional columns, only the one the database names, one at a time (lib/apptBuffer.ts, commit 70327f1).
    for (let i = 0; i < 2 && res.error && isMissingColumnError(res.error); i++) {
      const col = missingColumnName(res.error);
      if (col !== 'buffer_minutes' && col !== 'reschedule_count') break;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it
      const { [col]: _gone, ...rest } = patch;
      patch = rest;
      res = await run(patch);
    }
    if (res.error) {
      const code = (res.error as { code?: string }).code;
      if (code === '23505' || code === '23P01') return NextResponse.json({ success: false, code: 'slot_taken', error: RESCHEDULE_COPY.taken }, { status: 409 });
      console.error('reschedule: update failed', (res.error as { message?: string }).message);
      return NextResponse.json({ success: false, error: 'לא הצלחנו להזיז את התור, אפשר לנסות שוב בעוד רגע?' }, { status: 500 });
    }
    if (!res.data) return refuse(`התור הזה עודכן ממש עכשיו. לכל שינוי אפשר ליצור קשר ישירות עם ${brand.businessName || 'העסק'}.`);

    const fromWhen = whenHe(oldDate, oldStart);
    const toWhen = whenHe(date, newStart);
    // Her notification and the freed slot, after the response: the move is committed and nothing here may fail it.
    // The same paths a client cancel takes (app/api/confirm): the owner is told, her "offer it?" card, and the waiting list
    // offer when she turned it on (off by default). The freed slot is the OLD date and time.
    const freed = { ...appt };
    after(() => notifyOwner({
      tenantId, kind: 'reschedule', title: 'תור הוזז', appointmentId: id, settingsRow: st,
      body: ownerMoveMessage({ name: appt.name, service: appt.service, fromWhen, toWhen }),
    }).catch((e: unknown) => console.error('reschedule: owner notify failed', e instanceof Error ? e.message : String(e))));
    after(() => askGapFillAfterClientCancel(db, { tenantId, appt: freed }).then(() => undefined));
    after(() => runWaitlistOffer({ tenantId, appt: freed, db }).then(() => undefined).catch((e: unknown) => {
      console.error('reschedule: waitlist offer failed', e instanceof Error ? e.message : String(e));
    }));

    return NextResponse.json({
      success: true, moved: true, ...brand, ...contact,
      message: `נתראה ${toWhen} 🌸`,
      appointment: { service: summary.service, date: hebrewDate(date), time: fmtTime(newStart) },
      invite: { date, startMinute: newStart, duration, title: `${summary.service || 'תור'} · ${brand.businessName || 'תור'}` },
      movesLeft: Math.max(0, maxMoves - used - 1),
    });
  } catch (err) {
    console.error('reschedule: unexpected error', err);
    return NextResponse.json({ error: 'שגיאה בשרת' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
