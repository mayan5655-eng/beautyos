// app/api/protocol-book/certificate/route.ts
//
// POST multipart { file, declared: 'true' } -> { success, status: 'submitted' }
//
// A cosmetician uploads her certificate and ticks the declaration; the facial chapters of the protocol book open
// (lib/protocolBook/certificate.ts). The file goes to the private bucket under HER tenant folder, through the service
// client (so it does not depend on storage policies), and the record to the protected automations key. Nothing is verified
// here and nothing claims to be: a platform admin reviews it afterwards.
//
// A new upload replaces the record (after a rejection she can send another); the older file is left in storage, never
// deleted, so the admin can still see what was sent before.
import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/adminGuard';
import { requireActiveTenant } from '@/lib/planGuard';
import { businessFieldsOf } from '@/lib/businessFields';
import { isMissingColumnError } from '@/lib/pgError';
import { protocolBookEnabled } from '@/lib/protocolBook/book';
import { CERT_BUCKET, CERT_KEY, CERT_MAX_BYTES, CERT_TYPES, certPath, needsCertificate, newCertificate } from '@/lib/protocolBook/certificate';

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

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (form?.get('declared') !== 'true') return fail('צריך לסמן את ההצהרה', 400);
  if (!(file instanceof File) || file.size === 0) return fail('לא נבחר קובץ', 400);
  const ext = CERT_TYPES[file.type];
  if (!ext) return fail('אפשר להעלות תמונה (JPG, PNG) או PDF', 400);
  if (file.size > CERT_MAX_BYTES) return fail('הקובץ גדול מדי (עד 4MB)', 413);

  const db = createAdminClient();
  let read = await db.from('settings').select('automations, business_fields').eq('tenant_id', tenantId).maybeSingle();
  if (read.error && isMissingColumnError(read.error)) read = await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle();
  if (read.error || !read.data) return fail('משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע', 500);
  const settings = read.data as { automations?: unknown; business_fields?: unknown };
  if (!needsCertificate(businessFieldsOf(settings))) return fail('לעסק שלך לא נדרשת תעודה', 400);

  const now = new Date();
  const path = certPath(String(tenantId), ext, now.getTime());
  const up = await db.storage.from(CERT_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) {
    console.error('[protocol-book/certificate] upload failed:', up.error.message);
    return fail('ההעלאה לא הצליחה, נסי שוב', 500);
  }

  const autos = settings.automations && typeof settings.automations === 'object' && !Array.isArray(settings.automations)
    ? (settings.automations as Record<string, unknown>) : {};
  const { error } = await db.from('settings').update({ automations: { ...autos, [CERT_KEY]: newCertificate(path, now.toISOString()) } }).eq('tenant_id', tenantId);
  if (error) {
    console.error('[protocol-book/certificate] write failed:', error.message);
    return fail('הקובץ עלה אבל הרישום לא נשמר. נסי שוב בעוד רגע.', 500);
  }
  return NextResponse.json({ success: true, status: 'submitted' });
}
