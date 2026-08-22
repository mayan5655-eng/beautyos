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
// TIMES ONLY: date, start_minute, hour, duration. That is the complete list.
//
// NOT name, phone, service, price, client_id, notes, colour or confirmation
// text. A stranger with a tenant id learns "14:00 to 15:00 is busy" - which is
// exactly what the booking grid shows her anyway, and is the minimum needed to
// stop her double-booking. She learns nothing about WHO is in that slot or
// WHAT they are having done. The column list below is the enforcement; there is
// no select('*') here and there must never be one.
//
// Cancelled appointments are filtered out server-side: a cancelled slot is free
// again, matching lib/apptTime, the in-app calendar and the appointments_no_overlap
// constraint.
//
// Past dates are excluded. The booking page only ever offers today onward, and
// there is no reason to hand out a history of when a business was busy.

import { createClient } from '@supabase/supabase-js';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** The ONLY columns that may leave this route. Times, and nothing else. */
const SAFE_FIELDS = 'date, start_minute, hour, duration';

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

    const { data, error } = await supabase
      .from('appointments')
      .select(SAFE_FIELDS)
      .eq('tenant_id', tenantId)        // the filter — always, no exceptions
      .gte('date', isoDate(today))
      .lte('date', isoDate(horizon))
      .neq('confirmation_status', 'cancelled')
      .order('date', { ascending: true })
      .limit(2000);

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

    return Response.json({ success: true, busy: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[availability] threw:', message);
    return Response.json(
      { success: false, error: 'לא הצלחנו לטעון את היומן' },
      { status: 500 }
    );
  }
}
