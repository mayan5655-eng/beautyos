// app/api/availability/route.ts
//
// Which time ranges are already taken, for one business. Public, no auth: the
// /book page is something a cosmetician sends to her clients, and none of them
// have a login.
//
// ── Why this endpoint exists ───────────────────────────────────────────────
// /book used to read this straight from the browser:
//
//     supabase.from("appointments").select("date, hour, ...").eq("tenant_id", t)
//
// on the ANON key. RLS on public.appointments denies anon, so that query
// returned ZERO ROWS to every real visitor - silently, as data rather than as
// an error. The page's slotTaken() is driven entirely by it, so every slot
// rendered as free, including ones that were already booked. A client picked a
// taken time, filled the form, and only then got a rejection from
// /api/book-appointment.
//
// The read has to happen somewhere the anon key can reach, so it happens here,
// on the service-role key, behind a whitelist.
//
// ── What leaves this endpoint ──────────────────────────────────────────────
// MERGED BUSY INTERVALS ONLY: { date, start, end } per day, each appointment's buffer
// already included and overlapping or touching ranges unioned (lib/busyIntervals.ts),
// her break folded in, plus `defaultBuffer`, the one business-wide number that is
// already public in her branding. That is the complete list.
//
// NOT name, phone, service, price, client_id, notes, colour or confirmation
// text, and since 2026-11-08 (Vercel security review) not a per-appointment duration,
// a per-appointment buffer or a service -> buffer map either: joined, those told a
// stranger which treatment somebody had booked. A stranger with a tenant id learns
// "14:00 to 15:20 is not available" - which is exactly what the booking grid shows
// her anyway, and is the minimum needed to stop her double-booking. The page takes the
// buffer of the treatment SHE is booking from the public services list it already
// loads (get_public_services). The column list below is the enforcement; there is no
// select('*') here and there must never be one.
//
// Cancelled appointments are filtered out server-side: a cancelled slot is free
// again, matching lib/apptTime, the in-app calendar and the appointments_no_overlap
// constraint.
//
// Past dates are excluded. The booking page only ever offers today onward, and
// there is no reason to hand out a history of when a business was busy.

import { createClient } from '@supabase/supabase-js';
import { growUiEnabled } from '@/lib/grow/adapter';
import { releaseExpiredHolds } from '@/lib/grow/cancelFees';
// A released hold is a freed slot: offered to the waiting list like any cancellation (lib/waitlistOffers.js).
import { offerFreedHold } from '@/lib/waitlistRuntime';
import { cancelDeps } from '@/app/api/grow/_cancel';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { resolveLunch, lunchBusy } from '@/lib/lunchBreak';
import { bufferLookup, businessBufferDefault } from '@/lib/serviceBuffer';
import { isMissingColumnError, missingColumnName } from '@/lib/pgError';
import { publicBusyRanges } from '@/lib/busyIntervals';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** The times the merged intervals are built from. Read on the server; what leaves is { date, start, end } only. */
const SAFE_FIELDS = 'date, start_minute, hour, duration';
/**
 * Read on the server ONLY, to work out each appointment's buffer (lib/serviceBuffer.ts), and never sent. `kind`
 * (add_appointment_kind.sql) and `buffer_minutes` (add_service_buffer_2026-11-05.sql) are dropped one at a time, only
 * the one a missing-column error names, when their migration has not run.
 */
const SERVER_ONLY_FIELDS = ['service', 'kind', 'buffer_minutes'];
const SERVER_ONLY_OPTIONAL = ['kind', 'buffer_minutes'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How far ahead to report. /book offers 14 open days inside a 21-day window. */
const HORIZON_DAYS = 60;

/** Local YYYY-MM-DD, matching how `date` is stored and how /book formats it. */
function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function GET(request: Request) {
  try {
    // Abuse cap before any work. This route is unauthenticated and runs on the
    // service-role key, so "how often" is the only lever there is. The limits
    // are deliberately loose - see lib/rateLimit.ts for why a tight cap here
    // would recreate the very bug this endpoint fixes.
    const ipLimited = checkIpLimit(request, 'availability');
    if (ipLimited) return ipLimited;

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('t') || '';

    // Tenant must be explicit and well-formed. Never a default business: an
    // unscoped answer here would be one cosmetician's diary handed out under
    // another's link.
    if (!UUID_RE.test(tenantId)) {
      return Response.json(
        { success: false, error: 'קישור ההזמנה אינו תקין (חסר מזהה עסק)' },
        { status: 400 }
      );
    }

    const tenantLimited = checkTenantLimit(tenantId, 'availability');
    if (tenantLimited) return tenantLimited;

    const today = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);

    // A deposit hold that ran out frees its slot right here, not only when the cron next runs (lib/grow/cancelFees.releaseExpiredHolds). Best-effort.
    if (growUiEnabled(process.env, tenantId)) {
      try { const deps = cancelDeps(); if (deps) await releaseExpiredHolds(deps, tenantId, offerFreedHold); } catch { /* the cron releases it, or the booking route does */ }
    }

    const readAppts = (cols: string) => supabase
      .from('appointments')
      .select(cols)
      .eq('tenant_id', tenantId)        // the filter — always, no exceptions
      .gte('date', isoDate(today))
      .lte('date', isoDate(horizon))
      .neq('confirmation_status', 'cancelled')
      .order('date', { ascending: true })
      .limit(2000);
    let serverCols = [...SERVER_ONLY_FIELDS];
    let { data, error } = await readAppts(`${SAFE_FIELDS}, ${serverCols.join(', ')}`);
    for (let i = 0; i < SERVER_ONLY_OPTIONAL.length && error && isMissingColumnError(error); i++) {
      const col = missingColumnName(error);
      if (col && !(SERVER_ONLY_OPTIONAL.includes(col) && serverCols.includes(col))) break;
      serverCols = col ? serverCols.filter((c) => c !== col) : serverCols.filter((c) => !SERVER_ONLY_OPTIONAL.includes(c));
      ({ data, error } = await readAppts(`${SAFE_FIELDS}, ${serverCols.join(', ')}`));
    }

    if (error) {
      console.error('[availability] read failed:', error.message);
      // An explicit failure, NOT an empty list. The caller must be able to tell
      // "nothing is booked" apart from "I could not find out" - conflating the
      // two is what made the original bug invisible.
      return Response.json(
        { success: false, error: 'לא הצלחנו לטעון את היומן' },
        { status: 500 }
      );
    }

    // Her protected break, as busy time, merged into the same intervals: a visitor learns only that the time is not
    // available.
    // A failed settings read leaves the break out rather than failing the page:
    // /api/book-appointment enforces it independently.
    let lunch: ReturnType<typeof lunchBusy> = [];
    let branding: unknown = null;
    try {
      const { data: st } = await supabase.from('settings').select('branding').eq('tenant_id', tenantId).maybeSingle();
      branding = st?.branding ?? null;
      lunch = lunchBusy(resolveLunch(branding), today, HORIZON_DAYS);
    } catch { /* enforced again at booking time */ }

    // Buffer time after each treatment (lib/serviceBuffer.ts). service_prices.buffer_minutes comes from
    // add_service_buffer_2026-11-05.sql; before it runs (or if this read fails) every service uses the business
    // default, which is 0 unless she set one, so the page offers exactly what it did before. Enforced again at
    // booking time either way.
    const bufferDefault = businessBufferDefault(branding);
    let services: Array<{ name?: unknown; buffer_minutes?: unknown; active?: unknown }> = [];
    try {
      const sv = await supabase.from('service_prices').select('name, buffer_minutes, active').eq('tenant_id', tenantId);
      if (!sv.error) services = (sv.data || []) as typeof services;
    } catch { /* the default applies */ }
    const bufferOf = bufferLookup(services, bufferDefault);

    // Each appointment busy until its end plus its buffer, her break as is, unioned per day. Only { date, start, end }
    // leaves: no duration, no buffer, no service name (archived or not).
    type Row = { date?: unknown; start_minute?: number | null; hour?: number | null; duration?: number | string | null; service?: unknown; kind?: unknown; buffer_minutes?: unknown };
    const busy = publicBusyRanges((data || []) as unknown as Row[], bufferOf, lunch);

    return Response.json({ success: true, busy, defaultBuffer: bufferDefault });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[availability] threw:', message);
    return Response.json(
      { success: false, error: 'לא הצלחנו לטעון את היומן' },
      { status: 500 }
    );
  }
}
