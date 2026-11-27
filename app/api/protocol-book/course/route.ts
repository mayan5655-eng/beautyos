// app/api/protocol-book/course/route.ts — a client's protocol courses (lib/protocolBook/course.ts).
//
//   GET  ?clientId=...                                              -> { success, courses }
//   POST { action: 'start',   clientId, key, planned? }             -> { success, course }
//   POST { action: 'session', courseId, date, appointmentId? }       -> { success, course }
//   POST { action: 'status',  courseId, status: 'active'|'done'|'stopped' } -> { success, course }
//
// The tenant comes from HER session; the client and every course are checked to be hers. A protocol can only be started if
// she may open it (her field, the full book for a full-tier one). Until add_client_protocol_courses_2026-11-27.sql runs, every
// call answers 503 { missingMigration: true } with a plain sentence, never a silent success.
import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createAdminClient, requirePlatformAdmin } from '@/lib/adminGuard';
import { requireActiveTenant } from '@/lib/planGuard';
import { businessFieldsOf, FIELD_KEYS } from '@/lib/businessFields';
import { isMissingColumnError } from '@/lib/pgError';
import { protocolBookEnabled, protocolByKey, canOpen, hasFullBook } from '@/lib/protocolBook/book';
import { addSession, cleanSessions, plannedOf, isMissingTable, type Course, type CourseStatus } from '@/lib/protocolBook/course';

const TABLE = 'client_protocol_courses';
const COLS = 'id, client_id, protocol_key, sessions_planned, sessions, status, created_at';
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });
const missing = () => fail('צריך להריץ עדכון במסד הנתונים כדי לשמור סדרות טיפול בכרטיס הלקוחה (add_client_protocol_courses).', 503, { missingMigration: true });
const oops = () => fail('משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע', 500);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function caller() {
  if (!protocolBookEnabled()) return { res: fail('not found', 404) } as const;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { res: fail('לא מחוברת', 401) } as const;
  const { data: tenantId, error } = await session.rpc('get_user_tenant_id');
  if (error || !tenantId) return { res: fail('לא זוהה עסק', 400) } as const;
  return { session, tenantId: String(tenantId), db: createAdminClient() } as const;
}

async function clientIsHers(db: ReturnType<typeof createAdminClient>, tenantId: string, clientId: string) {
  const { data, error } = await db.from('clients').select('id').eq('id', clientId).eq('tenant_id', tenantId).maybeSingle();
  return !error && !!data;
}

export async function GET(request: Request) {
  const c = await caller();
  if ('res' in c) return c.res;
  const clientId = new URL(request.url).searchParams.get('clientId');
  if (!isId(clientId)) return fail('בקשה לא תקינה', 400);
  const { data, error } = await c.db.from(TABLE).select(COLS).eq('tenant_id', c.tenantId).eq('client_id', clientId).order('created_at', { ascending: false }).limit(20);
  if (error) return isMissingTable(error) ? missing() : oops();
  return NextResponse.json({ success: true, courses: (data || []).map((r) => ({ ...r, sessions: cleanSessions(r.sessions) })) });
}

export async function POST(request: Request) {
  const c = await caller();
  if ('res' in c) return c.res;
  const guard = await requireActiveTenant(c.session);
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === 'start') {
    const clientId = body?.clientId;
    const p = protocolByKey(body?.key);
    if (!isId(clientId) || !p) return fail('בקשה לא תקינה', 400);
    if (!(await clientIsHers(c.db, c.tenantId, clientId))) return fail('הלקוחה לא נמצאה', 404);
    let read = await c.db.from('settings').select('automations, business_fields').eq('tenant_id', c.tenantId).maybeSingle();
    if (read.error && isMissingColumnError(read.error)) read = await c.db.from('settings').select('automations').eq('tenant_id', c.tenantId).maybeSingle();
    const settings = (read.data || {}) as { automations?: unknown; business_fields?: unknown };
    const isAdmin = (await requirePlatformAdmin()).ok;
    const fields = isAdmin ? [...FIELD_KEYS] : businessFieldsOf(settings);
    if (!canOpen(p, { fields, full: hasFullBook(settings), isAdmin })) return fail('הפרוטוקול הזה לא פתוח לעסק שלך', 403);

    // An active course of the same protocol already open: return it (the unique index would refuse a second one anyway).
    const existing = await c.db.from(TABLE).select(COLS).eq('tenant_id', c.tenantId).eq('client_id', clientId).eq('protocol_key', p.key).eq('status', 'active').maybeSingle();
    if (existing.error) return isMissingTable(existing.error) ? missing() : oops();
    if (existing.data) return NextResponse.json({ success: true, course: existing.data, existing: true });

    const { data, error } = await c.db.from(TABLE).insert({ tenant_id: c.tenantId, client_id: clientId, protocol_key: p.key, sessions_planned: plannedOf(body?.planned) }).select(COLS).single();
    if (error) return isMissingTable(error) ? missing() : oops();
    return NextResponse.json({ success: true, course: data });
  }

  if (action === 'session' || action === 'status') {
    const courseId = body?.courseId;
    if (!isId(courseId)) return fail('בקשה לא תקינה', 400);
    const cur = await c.db.from(TABLE).select(COLS).eq('id', courseId).eq('tenant_id', c.tenantId).maybeSingle();
    if (cur.error) return isMissingTable(cur.error) ? missing() : oops();
    if (!cur.data) return fail('הסדרה לא נמצאה', 404);
    const course = cur.data as Course;

    let patch: Record<string, unknown>;
    if (action === 'session') {
      const date = typeof body?.date === 'string' && DATE.test(body.date) ? body.date : '';
      if (!date) return fail('תאריך לא תקין', 400);
      const appointmentId = typeof body?.appointmentId === 'string' || typeof body?.appointmentId === 'number' ? String(body.appointmentId) : undefined;
      const next = addSession(course, { date, ...(appointmentId ? { appointment_id: appointmentId } : {}) });
      patch = { sessions: next.sessions, status: next.status };
    } else {
      const status = body?.status;
      if (status !== 'active' && status !== 'done' && status !== 'stopped') return fail('בקשה לא תקינה', 400);
      patch = { status: status as CourseStatus };
    }
    const { data, error } = await c.db.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', courseId).eq('tenant_id', c.tenantId).select(COLS).single();
    if (error) return isMissingTable(error) ? missing() : oops();
    return NextResponse.json({ success: true, course: data });
  }

  return fail('בקשה לא תקינה', 400);
}
