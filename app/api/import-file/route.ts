// app/api/import-file/route.ts
//
// "מעבר בקלות מתוכנה אחרת": a CSV or Excel export from any system -> clients, services and future appointments. The plan is
// lib/importFile.ts; this route is the session, the limits, the reads and the writes around it.
//
// One endpoint, three steps, each POSTing the SAME file (multipart, field `file`):
//   step=read     parse the file and guess the columns. Reads nothing of hers, writes nothing.
//   step=preview  her mapping + choices -> the full plan against her real data ("נמצאו 312 לקוחות, 18 כפולות ידלגו", every
//                 conflict by row). Reads, writes nothing.
//   step=import   the same plan, recomputed from the bytes and a fresh read of her data, then written. The ONLY step that writes,
//                 and only when `confirm` is "yes": anything else is answered as a preview.
//
// Safety:
//   * Tenant from the SESSION only (get_user_tenant_id). The body cannot name a tenant; every read filters on it, every row
//     written carries it, and the writes go through the session client, so RLS checks each row too.
//   * NEXT_PUBLIC_IMPORT_TOOL off -> 404. The route does not exist while the feature is hidden.
//   * Rate limited per device and per business ('file-import'), 5 MB and 10,000 rows per file.
//   * Sends NOTHING. Not a confirmation, not a WhatsApp, not an SMS: this file imports no sender and no notifier, and plain row
//     inserts fire none (booking confirmations go out only from /api/book-appointment and /api/claim via lib/bookingNotify.js).
//     Past appointments are never imported, so nothing "for the past" can ever be triggered. Imported clients start without
//     marketing consent, so no promotional automation reaches them.
//   * Idempotent: clients dedupe by normalised phone (by name when there is none), services by name, appointments by
//     date + start + client. Importing the same file twice adds nothing the second time.
//   * Never double-books silently: a row that overlaps her calendar (or an earlier row of the same file) is NOT imported and is
//     listed back to her by row number. The database's own no-overlap constraint is the last word: a chunk it refuses is retried
//     row by row and each refused row is reported as a conflict.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { requireActiveTenant } from '@/lib/planGuard';
import { readUpload } from '@/lib/leads/readUpload';
import { readAllRows } from '@/lib/pagedRead';
import { isMissingColumnError } from '@/lib/pgError';
import { startFields, fmtTime } from '@/lib/apptTime';
import { apptBufferField, writeWithApptBuffer } from '@/lib/apptBuffer';
import {
  importToolEnabled, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, PREVIEW_ROWS, autoMapHeaders, cleanMapping, detectDateOrder,
  buildImportPlan, indexExistingClients, planHeadlineHe, IMPORT_PRESETS, israelClock,
  type ExistingData, type FileField, type PlanOptions, type Conflict,
} from '@/lib/importFile';

const CHUNK = 100;
const APPT_CHUNK = 50;

type Db = Awaited<ReturnType<typeof createSessionClient>>;

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

async function readExisting(db: Db, tenantId: string, today: string): Promise<{ data: ExistingData | null; error: string | null }> {
  const byTenant = (q: { eq: (c: string, v: string) => unknown }) => q.eq('tenant_id', tenantId);
  const clients = await readAllRows(db, 'clients', { columns: 'id, name, phone', filter: byTenant });
  if (clients.error || !clients.complete) return { data: null, error: 'clients' };
  const services = await readAllRows(db, 'service_prices', { columns: 'id, name, price, duration, color', filter: byTenant });
  if (services.error || !services.complete) return { data: null, error: 'services' };
  const futureOnly = (q: { eq: (c: string, v: string) => { gte: (c: string, v: string) => unknown } }) => q.eq('tenant_id', tenantId).gte('date', today);
  let appts = await readAllRows(db, 'appointments', {
    columns: 'id, date, start_minute, hour, duration, buffer_minutes, client_id, name, confirmation_status', filter: futureOnly,
  });
  // Before add_service_buffer_2026-11-05.sql the column is not there: read without it (the overlap test then uses 0).
  if (appts.error && isMissingColumnError(appts.error)) {
    appts = await readAllRows(db, 'appointments', {
      columns: 'id, date, start_minute, hour, duration, client_id, name, confirmation_status', filter: futureOnly,
    });
  }
  if (appts.error || !appts.complete) return { data: null, error: 'appointments' };
  return { data: { clients: clients.data || [], services: services.data || [], appointments: appts.data || [] }, error: null };
}

export async function POST(request: Request) {
  if (!importToolEnabled()) return fail('not found', 404);
  try {
    const ipLimited = checkIpLimit(request, 'file-import');
    if (ipLimited) return ipLimited;

    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail('צריך להתחבר מחדש', 401);

    const { data: tenantId, error: rpcErr } = await session.rpc('get_user_tenant_id');
    if (rpcErr || !tenantId) return fail('לא זיהינו את העסק שלך. אפשר לרענן ולנסות שוב.', 400);
    const tid = String(tenantId);

    const tenantLimited = checkTenantLimit(tid, 'file-import');
    if (tenantLimited) return tenantLimited;

    const guard = await requireActiveTenant(session);
    if (!guard.ok) return guard.response;

    const ctype = request.headers.get('content-type') || '';
    if (!ctype.includes('multipart/form-data')) return fail('לא נבחר קובץ');
    // Refuse an oversized body before reading it, when the client says how big it is.
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > IMPORT_MAX_BYTES + 64 * 1024) return fail('הקובץ גדול מדי. אפשר לפצל אותו לכמה קבצים קטנים יותר.', 413);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) return fail('לא נבחר קובץ');
    if (file.size === 0) return fail('הקובץ ריק');
    if (file.size > IMPORT_MAX_BYTES) return fail('הקובץ גדול מדי. אפשר לפצל אותו לכמה קבצים קטנים יותר.', 413);
    const filename = file instanceof File ? file.name : null;
    const sheet = String(form.get('sheet') ?? '') || null;
    const step = String(form.get('step') ?? 'read');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const read = readUpload(bytes, { filename, sheet, maxRows: IMPORT_MAX_ROWS });
    if (!read.ok) {
      return fail(read.message.replace('לייבא ממנו פניות', 'לייבא ממנו נתונים'), 400, { problem: read.problem, sheetNames: read.sheetNames });
    }
    const { headers, rows, sheetNames, sheetName, format } = read;

    // ── step=read: guess, nothing else ──
    if (step === 'read') {
      const preset = String(form.get('preset') ?? 'generic');
      const mapping = autoMapHeaders(headers, rows, preset);
      const dateCol = mapping.indexOf('date');
      const birthCol = mapping.indexOf('birthday');
      const sampleCol = dateCol >= 0 ? dateCol : birthCol;
      const dateOrder = sampleCol >= 0 ? detectDateOrder(rows.slice(0, 500).map((r) => r[sampleCol])) : 'unknown';
      return NextResponse.json({
        success: true, wroteAnything: false, format, sheetNames, sheetName, headers,
        rowCount: rows.length, sample: rows.slice(0, PREVIEW_ROWS), mapping, dateOrder,
        presets: IMPORT_PRESETS.map((p) => ({ id: p.id, label: p.label })),
      });
    }

    // ── preview / import: her mapping and choices, checked here ──
    let rawMapping: unknown = [];
    try { rawMapping = JSON.parse(String(form.get('mapping') ?? '[]')); } catch { return fail('מיפוי העמודות לא תקין'); }
    const mapping: FileField[] = cleanMapping(rawMapping, headers.length);
    const want = (k: string) => String(form.get(k) ?? '') === '1';
    const clock = israelClock();
    const opts: PlanOptions = {
      clients: want('clients'), services: want('services'), appts: want('appts'),
      dateOrder: String(form.get('dateOrder')) === 'mdy' ? 'mdy' : 'dmy',
      today: clock.today, nowMinute: clock.nowMinute,
    };
    if (!opts.clients && !opts.services && !opts.appts) return fail('בחרי מה לייבא: לקוחות, טיפולים או תורים');
    const hasName = mapping.includes('name') || mapping.includes('firstName') || mapping.includes('lastName');
    if ((opts.clients || opts.appts) && !hasName) return fail('צריך לסמן איזו עמודה היא שם הלקוחה');
    if (opts.services && !mapping.includes('service')) return fail('צריך לסמן איזו עמודה היא הטיפול');
    if (opts.appts && !mapping.includes('date')) return fail('צריך לסמן איזו עמודה היא תאריך התור');

    const ex = await readExisting(session, tid, clock.today);
    if (!ex.data) {
      console.error(`[import-file] tenant ${tid}: could not read ${ex.error}`);
      return fail('לא הצלחנו לקרוא את הנתונים הקיימים שלך, ולכן לא ייבאנו כלום. אפשר לנסות שוב בעוד רגע.', 503);
    }
    const plan = buildImportPlan(rows, mapping, ex.data, opts);
    const summary = {
      headline: planHeadlineHe(plan, opts),
      clients: { ...plan.clients, toCreate: plan.clients.toCreate.length, sample: plan.clients.toCreate.slice(0, PREVIEW_ROWS).map((c) => ({ name: c.name, phone: c.phone, birthday: c.birthday })) },
      services: { ...plan.services, toCreate: plan.services.toCreate.length, sample: plan.services.toCreate.slice(0, PREVIEW_ROWS).map((s) => ({ name: s.name, price: s.price, duration: s.duration })) },
      appts: { ...plan.appts, toCreate: plan.appts.toCreate.length, sample: plan.appts.toCreate.slice(0, PREVIEW_ROWS).map((a) => ({ date: a.date, time: fmtTime(a.startMinute), name: a.name, service: a.service })) },
    };

    const confirmed = step === 'import' && String(form.get('confirm') ?? '') === 'yes';
    if (!confirmed) return NextResponse.json({ success: true, wroteAnything: false, sheetName, summary });

    // ── import: services, then clients, then appointments (each needs the one before) ──
    const errors: string[] = [];
    const added = { services: 0, clients: 0, appts: 0 };
    let failed = 0;

    for (let i = 0; i < plan.services.toCreate.length; i += CHUNK) {
      const chunk = plan.services.toCreate.slice(i, i + CHUNK).map((s) => ({ ...s, tenant_id: tid }));
      const { data, error } = await session.from('service_prices').insert(chunk).select('id');
      if (error) { failed += chunk.length; errors.push(error.message); continue; }
      added.services += (data || []).length;
    }

    const clientIdByKey = indexExistingClients(ex.data.clients);
    for (let i = 0; i < plan.clients.toCreate.length; i += CHUNK) {
      const drafts = plan.clients.toCreate.slice(i, i + CHUNK);
      const rowsOut = drafts.map((c) => ({
        name: c.name, phone: c.phone, notes: c.notes, status: c.status, tenant_id: tid,
        ...(c.birthday ? { birthday: c.birthday } : {}),
      }));
      const { data, error } = await session.from('clients').insert(rowsOut).select('id');
      if (error || !Array.isArray(data) || data.length !== drafts.length) {
        failed += drafts.length; if (error) errors.push(error.message); continue;
      }
      // PostgREST returns inserted rows in the order sent.
      data.forEach((row: { id: string }, j: number) => clientIdByKey.set(drafts[j].key, row.id));
      added.clients += data.length;
    }

    const lateConflicts: Conflict[] = [];
    const apptRow = (a: (typeof plan.appts.toCreate)[number]) => ({
      date: a.date, ...startFields(a.startMinute), name: a.name, service: a.service, duration: a.duration, price: a.price,
      color: a.color, client_id: clientIdByKey.get(a.clientKey) || null, note: a.note,
      // The same values an appointment she adds by hand starts with. Nothing reads them as "send now": a booking confirmation
      // is sent only by the public booking routes, never by an insert.
      confirmation_status: 'pending', confirmation_sent: false,
      tenant_id: tid, ...apptBufferField(0),
    });
    const isOverlap = (e: { code?: string; message?: string } | null) => !!e && (e.code === '23P01' || /no_overlap|exclusion/i.test(String(e.message || '')));
    const toConflict = (a: (typeof plan.appts.toCreate)[number]): Conflict =>
      ({ row: a.row, date: a.date, time: fmtTime(a.startMinute), name: a.name, service: a.service, with: 'תור שנקבע בזמן הייבוא' });

    for (let i = 0; i < plan.appts.toCreate.length; i += APPT_CHUNK) {
      const drafts = plan.appts.toCreate.slice(i, i + APPT_CHUNK);
      const { data, error } = await writeWithApptBuffer(drafts.map(apptRow), (r) => session.from('appointments').insert(r).select('id'));
      if (!error) { added.appts += Array.isArray(data) ? data.length : 0; continue; }
      if (!isOverlap(error)) { failed += drafts.length; errors.push(error.message || 'insert failed'); continue; }
      // Someone booked into one of these slots since the preview: one by one, so only the clashing row is left out.
      for (const a of drafts) {
        const one = await writeWithApptBuffer(apptRow(a), (r) => session.from('appointments').insert(r).select('id'));
        if (!one.error) { added.appts++; continue; }
        if (isOverlap(one.error)) lateConflicts.push(toConflict(a));
        else { failed++; errors.push(one.error.message || 'insert failed'); }
      }
    }

    console.log(`[import-file] tenant ${tid}: +${added.clients} clients, +${added.services} services, +${added.appts} appointments, ${failed} failed, ${plan.appts.conflictCount + lateConflicts.length} conflicts`);
    return NextResponse.json({
      success: failed === 0,
      wroteAnything: added.clients + added.services + added.appts > 0,
      added, failed,
      error: failed ? 'חלק מהשורות לא נשמרו. אפשר לייבא את אותו קובץ שוב: מה שכבר נכנס לא ייכנס פעמיים.' : null,
      summary: { ...summary, appts: { ...summary.appts, conflicts: [...plan.appts.conflicts, ...lateConflicts], conflictCount: plan.appts.conflictCount + lateConflicts.length } },
    });
  } catch (err: unknown) {
    console.error('[import-file] threw:', err instanceof Error ? err.message : String(err));
    return fail('לא הצלחנו לקרוא את הקובץ. אפשר לנסות שוב.', 500);
  }
}
