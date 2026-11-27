// app/api/admin/protocol-certificate/route.ts
//
// POST { tenantId, status: 'approved' | 'rejected' } -> { success }
//
// A platform admin's verdict on a cosmetician certificate (lib/protocolBook/certificate.ts). 'rejected' closes the facial
// chapters of the protocol book for that business until she uploads another. Same security model as /api/admin/tenants:
// requirePlatformAdmin() first, a non-admin gets 404, the tenant comes from the body because an admin acts on others.
// Deletes nothing: the file and the record stay.
import { NextResponse } from 'next/server';
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard';
import { CERT_KEY, certificateOf, reviewed } from '@/lib/protocolBook/certificate';

const notFound = () => NextResponse.json({ success: false, error: 'not found' }, { status: 404 });

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return notFound();
  const body = (await request.json().catch(() => null)) as { tenantId?: unknown; status?: unknown } | null;
  const tenantId = typeof body?.tenantId === 'string' && /^[0-9a-f-]{36}$/i.test(body.tenantId) ? body.tenantId : '';
  const status = body?.status === 'approved' || body?.status === 'rejected' ? body.status : null;
  if (!tenantId || !status) return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: 'העסק לא נמצא' }, { status: 404 });
  const next = reviewed(certificateOf(data), status, new Date().toISOString());
  if (!next) return NextResponse.json({ success: false, error: 'אין תעודה לבדיקה' }, { status: 404 });
  const autos = (data.automations && typeof data.automations === 'object' && !Array.isArray(data.automations) ? data.automations : {}) as Record<string, unknown>;
  const { error: wErr } = await db.from('settings').update({ automations: { ...autos, [CERT_KEY]: next } }).eq('tenant_id', tenantId);
  if (wErr) return NextResponse.json({ success: false, error: 'השמירה נכשלה' }, { status: 500 });
  return NextResponse.json({ success: true });
}
