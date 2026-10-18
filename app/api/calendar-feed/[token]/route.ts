// app/api/calendar-feed/[token]/route.ts
//
// Her diary as an .ics feed her phone calendar subscribes to (lib/calendarFeed.ts
// explains the token). Public by design - a calendar app has no session - so the
// token is the only key: a wrong or rotated one is a plain 404, never a hint.
// Window: 30 days back, 180 ahead; cancelled appointments are left out so a
// cancellation disappears from her phone on the next refresh.

import { createClient } from '@supabase/supabase-js';
import { parseFeedToken } from '@/lib/calendarFeed';
import { buildIcsFeed, type FeedEvent } from '@/lib/calendarInvite';
import { startMinute } from '@/lib/apptTime';
import { isPersonal } from '@/lib/calendarKind';
import { readAllRows } from '@/lib/pagedRead.js';

type Ctx = { params: Promise<{ token: string }> };

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

function israelDate(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + offsetDays * 86_400_000));
}

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const parsed = parseFeedToken(token);
  if (!parsed) return notFound();

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: st } = await admin.from('settings').select('business_name, automations').eq('tenant_id', parsed.tenantId).maybeSingle();
  const autos = st?.automations && typeof st.automations === 'object' ? (st.automations as Record<string, unknown>) : {};
  if (!autos.calendar_feed_nonce || autos.calendar_feed_nonce !== parsed.nonce) return notFound();

  const r = await readAllRows(admin, 'appointments', {
    columns: '*',
    filter: (q: any) => q.eq('tenant_id', parsed.tenantId).gte('date', israelDate(-30)).lte('date', israelDate(180)),
  });
  // A diary we could not read completely is not served as complete: a calendar would delete what is missing.
  if (r.error || !r.complete) {
    return new Response('Try again later', { status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
  }

  const events: FeedEvent[] = [];
  for (const a of r.data as any[]) {
    if (a.confirmation_status === 'cancelled') continue;
    const sm = startMinute(a);
    if (sm == null || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) continue;
    const personal = isPersonal(a);
    const title = personal
      ? String(a.name || a.service || 'זמן חסום')
      : [a.name, a.service].filter(Boolean).join(' · ') || 'תור';
    events.push({
      uid: String(a.id),
      date: a.date,
      startMinute: sm,
      duration: Number(a.duration) || 60,
      title: a.confirmation_status === 'pending' && !personal ? `${title} (ממתין לאישור)` : title,
      details: !personal && a.notes ? String(a.notes).slice(0, 300) : undefined,
    });
  }

  const name = `${String(st?.business_name || '').trim() || 'היומן שלי'} · Kalmea`;
  return new Response(buildIcsFeed(events, name), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="kalmea.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  });
}
