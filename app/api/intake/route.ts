// app/api/intake/route.ts
//
// Her intake gate on the calendar (lib/intakeGate.ts). Signed-in owner only; the tenant comes from her session, never from
// the request.
//
// GET  -> { success, ready, items: [{ appointmentId, badges: [{ kind, label }] }] } for her appointments from yesterday to 30
//         days ahead, ONLY on services she gated (off by default). Before add_reschedule_intake_2026-11-09.sql runs: ready
//         false and no items, and the calendar shows nothing.
// POST { sync: true } -> puts a "send the form" line in HER manual send queue for every appointment in the next 3 days on a
//         gated service whose client has not signed that form yet, once per form (lib/intakeQueue.js). Nothing is sent by the
//         system: type intake_form always waits for her (lib/whatsapp.js). Covers appointments she booked in the app, which do
//         not pass through the public booking route. The dashboard calls it once per visit (app/useIntake.js).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveIntake, intakeBadges, INTAKE_COLUMN, type Intake } from '@/lib/intakeGate';
import { ensureIntakeForm, queueIntakeMessage } from '@/lib/intakeQueue.js';
import { addDays } from '@/lib/reschedule';
import { wallClockNow } from '@/lib/bookingPolicy';
import { startMinute } from '@/lib/apptTime';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { isDemoTenantId } from '@/lib/demoTenants';
import { sendWhatsApp } from '@/lib/whatsapp.js';
import { hebrewDate } from '@/lib/messages.js';
import { APP_URL } from '@/lib/appUrl';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

async function caller(request: Request): Promise<{ tenantId: string } | { error: Response }> {
  const ipLimited = checkIpLimit(request, 'intake');
  if (ipLimited) return { error: ipLimited };
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: 'לא מחובר' }, { status: 401 }) };
  const { data: tenantId } = await session.rpc('get_user_tenant_id');
  if (!tenantId) return { error: NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 }) };
  const limited = checkTenantLimit(String(tenantId), 'intake');
  if (limited) return { error: limited };
  return { tenantId: String(tenantId) };
}

/** Her gated services by name, or null when the column is not there yet. */
async function gatedServices(db: ReturnType<typeof admin>, tenantId: string): Promise<Map<string, Intake> | null> {
  const { data, error } = await db.from('service_prices').select('*').eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Row[];
  if (!rows.some((s) => Object.prototype.hasOwnProperty.call(s, INTAKE_COLUMN))) return null;
  const out = new Map<string, Intake>();
  // An active row wins over an archived one of the same name.
  for (const s of [...rows].sort((a, b) => Number(a.active === false) - Number(b.active === false))) {
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    const gate = resolveIntake(s);
    if (name && gate && !out.has(name)) out.set(name, gate);
  }
  return out;
}

async function gatedAppointments(db: ReturnType<typeof admin>, tenantId: string, gates: Map<string, Intake>, from: string, to: string) {
  const { data, error } = await db.from('appointments').select('id, client_id, client_phone, name, service, date, start_minute, hour, kind, confirmation_status')
    .eq('tenant_id', tenantId).gte('date', from).lte('date', to).neq('confirmation_status', 'cancelled')
    .in('service', [...gates.keys()]).limit(1000);
  if (error) throw new Error(error.message);
  return ((data || []) as Row[]).filter((a) => a.kind !== 'personal');
}

export async function GET(request: Request) {
  const c = await caller(request);
  if ('error' in c) return c.error;
  try {
    const db = admin();
    const gates = await gatedServices(db, c.tenantId);
    if (!gates) return NextResponse.json({ success: true, ready: false, items: [] });
    if (gates.size === 0) return NextResponse.json({ success: true, ready: true, items: [] });
    const today = wallClockNow().date;
    const appts = await gatedAppointments(db, c.tenantId, gates, addDays(today, -1), addDays(today, 30));
    const clientIds = [...new Set(appts.map((a) => a.client_id).filter(Boolean).map(String))];
    const signed = new Map<string, Set<string>>();
    const visits = new Map<string, Array<{ date: string; start: number; id: string }>>();
    if (clientIds.length) {
      const [{ data: forms, error: fErr }, { data: history, error: hErr }] = await Promise.all([
        db.from('forms').select('client_id, form_type, status').eq('tenant_id', c.tenantId).in('client_id', clientIds).eq('status', 'signed'),
        db.from('appointments').select('id, client_id, date, start_minute, hour').eq('tenant_id', c.tenantId).in('client_id', clientIds)
          .lte('date', addDays(today, 30)).neq('confirmation_status', 'cancelled').limit(5000),
      ]);
      if (fErr || hErr) throw new Error((fErr || hErr)!.message);
      for (const f of (forms || []) as Row[]) {
        const k = String(f.client_id);
        if (!signed.has(k)) signed.set(k, new Set());
        signed.get(k)!.add(String(f.form_type));
      }
      for (const h of (history || []) as Row[]) {
        const k = String(h.client_id);
        if (!visits.has(k)) visits.set(k, []);
        visits.get(k)!.push({ date: String(h.date), start: startMinute(h) ?? 0, id: String(h.id) });
      }
    }
    const items = appts.map((a) => {
      const k = a.client_id ? String(a.client_id) : '';
      const mine = startMinute(a) ?? 0;
      // First visit: no earlier, non-cancelled appointment of hers. With no client card she cannot be told apart: no patch badge.
      const firstVisit = !!k && !(visits.get(k) || []).some((v) => v.id !== String(a.id) && (v.date < a.date || (v.date === a.date && v.start < mine)));
      return { appointmentId: String(a.id), badges: intakeBadges({ intake: gates.get(String(a.service).trim()) || null, signedFormTypes: signed.get(k) || new Set(), firstVisit }) };
    }).filter((i) => i.badges.length > 0);
    return NextResponse.json({ success: true, ready: true, items });
  } catch (e) {
    console.error('[intake] GET failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את הטפסים' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const c = await caller(request);
  if ('error' in c) return c.error;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.sync !== true) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
    // A demo business sends nothing and gets no fabricated rows.
    if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: true, queued: 0 });
    const db = admin();
    const gates = await gatedServices(db, c.tenantId);
    if (!gates || gates.size === 0) return NextResponse.json({ success: true, queued: 0 });
    const formGates = new Map([...gates].filter(([, g]) => g.form));
    if (formGates.size === 0) return NextResponse.json({ success: true, queued: 0 });
    const today = wallClockNow().date;
    const appts = (await gatedAppointments(db, c.tenantId, formGates, today, addDays(today, 3))).slice(0, 40);
    const { data: st } = await db.from('settings').select('business_name').eq('tenant_id', c.tenantId).maybeSingle();
    let queued = 0;
    for (const a of appts) {
      const gate = formGates.get(String(a.service).trim());
      if (!gate || !a.client_id) continue;
      const f = await ensureIntakeForm({ db, tenantId: c.tenantId, clientId: String(a.client_id), clientName: a.name, formType: gate.formType });
      if (f.state !== 'pending') continue;
      let phone = a.client_phone || '';
      if (!phone) {
        const { data: cl } = await db.from('clients').select('phone').eq('tenant_id', c.tenantId).eq('id', a.client_id).maybeSingle();
        phone = cl?.phone || '';
      }
      const r = await queueIntakeMessage({ db, send: sendWhatsApp, tenantId: c.tenantId, phone, name: a.name, businessName: st?.business_name || '', service: a.service, when: `ב${hebrewDate(a.date)}`, formId: f.formId, baseUrl: APP_URL });
      if (r === 'queued') queued++;
    }
    return NextResponse.json({ success: true, queued });
  } catch (e) {
    console.error('[intake] sync failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: 'לא הצלחנו להכין את הטפסים לשליחה' }, { status: 500 });
  }
}
