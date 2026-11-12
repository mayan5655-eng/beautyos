// app/api/team/route.ts
//
// Her team (lib/team.ts, lib/teamRepo.ts). Signed in; the tenant comes from the SESSION only, never from the body.
//   GET                                                   -> { available, on, staff }   (the owner row is made on first use)
//   POST { action: 'save', staffId?, staff: { name, color, hours, services } }   -> add a person, or change one of hers
//   POST { action: 'active', staffId, active }             -> deactivate (never delete) or bring back; the owner stays active
//
// NEXT_PUBLIC_TEAM_CALENDAR off -> 404: the route does not exist. Her Kalmea subscription lapsed -> the plan-guard refusal (402).
// The migration not run -> { available: false } and nothing else. Staff have no login and get no messages: nothing here sends anything.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSession } from '@/lib/supabase/server';
import { callerTenantId } from '@/lib/tenantScope';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { isDemoTenantId } from '@/lib/demoTenants';
import { teamCalendarEnabled } from '@/lib/teamFlag';
import { sanitizeStaffInput, teamOn, orderedStaff, isStaffId, type Staff } from '@/lib/team';
import { readTeam, ensureOwner, saveStaff, setStaffActive } from '@/lib/teamRepo';

export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const view = (staff: Staff[]) => ({ on: teamOn(staff), staff: orderedStaff(staff) });

async function caller() {
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: bad('לא מחוברת', 401) } as const;
  const tenantId = await callerTenantId(session);
  if (!tenantId) return { error: bad('לא זוהה עסק', 403) } as const;
  const guard = await requireActiveTenant(session);
  if (!guard.ok) return { error: guard.response } as const;
  return { tenantId } as const;
}

export async function GET(request: Request) {
  if (!teamCalendarEnabled()) return notFound();
  const limited = checkIpLimit(request, 'team');
  if (limited) return limited;
  const c = await caller();
  if ('error' in c) return c.error;
  try {
    const db = admin();
    let team = await readTeam(db, c.tenantId);
    if (!team.available) return NextResponse.json({ success: true, available: false, on: false, staff: [] });
    if (!isDemoTenantId(c.tenantId)) {
      const { data: st } = await db.from('settings').select('therapist_name, business_name, primary_color').eq('tenant_id', c.tenantId).maybeSingle();
      team = await ensureOwner(db, c.tenantId, team, st || null);
    }
    return NextResponse.json({ success: true, available: true, ...view(team.staff) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[team] GET failed:', (e as Error)?.message);
    return bad('לא הצלחנו לטעון את הצוות, אפשר לנסות שוב בעוד רגע', 500);
  }
}

export async function POST(request: Request) {
  if (!teamCalendarEnabled()) return notFound();
  const limited = checkIpLimit(request, 'team');
  if (limited) return limited;
  const c = await caller();
  if ('error' in c) return c.error;
  const tenantLimited = checkTenantLimit(c.tenantId, 'team');
  if (tenantLimited) return tenantLimited;
  if (isDemoTenantId(c.tenantId)) return bad('זו תצוגה, במערכת שלך זה נשמר באמת', 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return bad('בקשה לא תקינה');
  const staffId = body.staffId == null || body.staffId === '' ? null : String(body.staffId);
  if (staffId !== null && !isStaffId(staffId)) return bad('בקשה לא תקינה');
  try {
    const db = admin();
    if (body.action === 'save') {
      const s = sanitizeStaffInput(body.staff);
      if (!s.ok) return bad(s.error);
      const r = await saveStaff(db, c.tenantId, staffId, s.value);
      if (!r.ok) return bad(r.error, r.status);
      return NextResponse.json({ success: true, available: true, ...view(r.staff) });
    }
    if (body.action === 'active') {
      if (!staffId || typeof body.active !== 'boolean') return bad('בקשה לא תקינה');
      const r = await setStaffActive(db, c.tenantId, staffId, body.active);
      if (!r.ok) return bad(r.error, r.status);
      return NextResponse.json({ success: true, available: true, ...view(r.staff) });
    }
    return bad('בקשה לא תקינה');
  } catch (e) {
    console.error('[team] POST failed:', (e as Error)?.message);
    return bad('לא הצלחנו לשמור, אפשר לנסות שוב בעוד רגע', 500);
  }
}
