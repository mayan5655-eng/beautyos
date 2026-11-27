// app/api/protocol-book/link/route.ts
//
// POST { serviceId, key | null } -> { success, links }
//
// Attaches a protocol from "ספר הפרוטוקולים" to one of HER services (or clears it). Every appointment of that service then
// shows the protocol's steps. Stored in settings.automations.protocol_links (private; branding is public).
//
// Checks, in order: the book exists (flag), she is signed in, the tenant comes from HER session, the service is on HER
// menu, and she may open the protocol (her business field, and the full book for a full-tier protocol). Only the one key
// of the automations bag is written; the rest is read and written back as stored.
import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createAdminClient, requirePlatformAdmin } from '@/lib/adminGuard';
import { requireActiveTenant } from '@/lib/planGuard';
import { businessFieldsOf, FIELD_KEYS } from '@/lib/businessFields';
import { isMissingColumnError } from '@/lib/pgError';
import { protocolBookEnabled, protocolByKey, canOpen, hasFullBook, protocolLinks, withLink, LINKS_KEY } from '@/lib/protocolBook/book';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  if (!protocolBookEnabled()) return fail('not found', 404);
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return fail('לא מחוברת', 401);
  const guard = await requireActiveTenant(session);
  if (!guard.ok) return guard.response;
  const { data: tenantId, error: tErr } = await session.rpc('get_user_tenant_id');
  if (tErr || !tenantId) return fail('לא זוהה עסק', 400);

  const body = (await request.json().catch(() => null)) as { serviceId?: unknown; key?: unknown } | null;
  const serviceId = typeof body?.serviceId === 'string' || typeof body?.serviceId === 'number' ? String(body.serviceId) : '';
  const key = body?.key === null ? null : typeof body?.key === 'string' ? body.key : undefined;
  if (!serviceId || key === undefined) return fail('בקשה לא תקינה', 400);

  const db = createAdminClient();
  const { data: svc, error: sErr } = await db.from('service_prices').select('id').eq('id', serviceId).eq('tenant_id', tenantId).maybeSingle();
  if (sErr) return fail('משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע', 500);
  if (!svc) return fail('הטיפול לא נמצא', 404);

  let read = await db.from('settings').select('automations, business_fields').eq('tenant_id', tenantId).maybeSingle();
  if (read.error && isMissingColumnError(read.error)) read = await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle();
  if (read.error || !read.data) return fail('משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע', 500);
  const settings = read.data as { automations?: unknown; business_fields?: unknown };

  if (key !== null) {
    const p = protocolByKey(key);
    if (!p) return fail('הפרוטוקול לא נמצא', 404);
    const isAdmin = (await requirePlatformAdmin()).ok;
    const fields = isAdmin ? [...FIELD_KEYS] : businessFieldsOf(settings);
    if (!canOpen(p, { fields, full: hasFullBook(settings), isAdmin })) return fail('הפרוטוקול הזה לא פתוח לעסק שלך', 403);
  }

  const autos = settings.automations && typeof settings.automations === 'object' && !Array.isArray(settings.automations)
    ? (settings.automations as Record<string, unknown>) : {};
  const links = withLink(protocolLinks(settings), serviceId, key);
  const { error } = await db.from('settings').update({ automations: { ...autos, [LINKS_KEY]: links } }).eq('tenant_id', tenantId);
  if (error) {
    console.error('[protocol-book/link] write failed:', error.message);
    return fail('משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע', 500);
  }
  return NextResponse.json({ success: true, links });
}
