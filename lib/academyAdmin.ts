// lib/academyAdmin.ts
//
// SERVER ONLY. The platform admin's Academy actions (app/api/admin/academy/route.ts), behind requirePlatformAdmin() in the route.
// Takes the service-role client as an argument so test-academy.ts runs it against an in-memory database.
//
//   save-course   create or edit a course (slug, title, subtitle, price kept for later, published, sort)
//   save-lesson   create or edit a lesson (video URL must pass the YouTube / Vimeo allowlist)
//   grant         give a business a course for life: source 'gift' (beta testers) or 'admin'. Granting again after a revoke
//                 re-opens the same row. 'purchase' and 'premium' are NOT accepted here: those come from billing, later.
//   revoke        set revoked_at on a grant. Nothing is ever deleted (owner's rule): un-publish, revoke, never remove.
import { cleanCourseInput, cleanLessonInput } from './academy.ts';
import type { Db } from './academyData.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRANT_SOURCES = ['gift', 'admin'] as const;

export type AdminResult = { status: number; body: Record<string, unknown> };
const bad = (error: string, status = 400): AdminResult => ({ status, body: { error } });
const okR = (extra: Record<string, unknown> = {}): AdminResult => ({ status: 200, body: { success: true, ...extra } });

const dupe = (e: { code?: string } | null | undefined) => e?.code === '23505';

/** A business by its id, or by the short name of its booking page (tenants.slug). */
async function findTenant(db: Db, ref: string): Promise<string | null> {
  const v = ref.trim();
  if (UUID_RE.test(v)) {
    const r = await db.from('tenants').select('id').eq('id', v).maybeSingle();
    return r?.data?.id || null;
  }
  if (!/^[a-z0-9-]{2,60}$/i.test(v)) return null;
  const r = await db.from('tenants').select('id').eq('slug', v.toLowerCase()).maybeSingle();
  return r?.data?.id || null;
}

export async function runAdminAction(db: Db, body: Record<string, unknown>, adminUserId: string, now: Date = new Date()): Promise<AdminResult> {
  const action = body?.action;
  const stamp = now.toISOString();

  if (action === 'save-course') {
    const c = cleanCourseInput(body);
    if (!c.ok) return bad(c.error);
    const id = typeof body.id === 'string' ? body.id : '';
    if (id && !UUID_RE.test(id)) return bad('מזהה קורס לא תקין');
    const w = id
      ? await db.from('academy_courses').update({ ...c.value, updated_at: stamp }).eq('id', id).select('id').maybeSingle()
      : await db.from('academy_courses').insert(c.value).select('id').maybeSingle();
    if (w?.error) return dupe(w.error) ? bad('כבר יש קורס עם הכתובת הזו') : bad('השמירה נכשלה', 500);
    if (!w?.data?.id) return bad('הקורס לא נמצא', 404);
    return okR({ id: w.data.id });
  }

  if (action === 'save-lesson') {
    const l = cleanLessonInput(body);
    if (!l.ok) return bad(l.error);
    const id = typeof body.id === 'string' ? body.id : '';
    const courseId = typeof body.course_id === 'string' ? body.course_id : '';
    if (id && !UUID_RE.test(id)) return bad('מזהה שיעור לא תקין');
    if (!id && !UUID_RE.test(courseId)) return bad('חסר הקורס של השיעור');
    const w = id
      ? await db.from('academy_lessons').update({ ...l.value, updated_at: stamp }).eq('id', id).select('id').maybeSingle()
      : await db.from('academy_lessons').insert({ ...l.value, course_id: courseId }).select('id').maybeSingle();
    if (w?.error) return dupe(w.error) ? bad('כבר יש שיעור עם הכתובת הזו בקורס') : bad('השמירה נכשלה', 500);
    if (!w?.data?.id) return bad('השיעור לא נמצא', 404);
    return okR({ id: w.data.id });
  }

  if (action === 'grant' || action === 'revoke') {
    const courseId = typeof body.course_id === 'string' ? body.course_id : '';
    if (!UUID_RE.test(courseId)) return bad('חסר קורס');
    const source = typeof body.source === 'string' ? body.source : 'gift';
    if (!(GRANT_SOURCES as readonly string[]).includes(source)) return bad('אפשר לתת גישה כמתנה או כגישת מנהלת בלבד');
    const tenantId = await findTenant(db, typeof body.tenant === 'string' ? body.tenant : '');
    if (!tenantId) return bad('לא מצאנו עסק כזה. אפשר להדביק מזהה עסק או את הכתובת של עמוד התורים שלו');
    const course = await db.from('academy_courses').select('id').eq('id', courseId).maybeSingle();
    if (!course?.data?.id) return bad('הקורס לא נמצא', 404);

    if (action === 'grant') {
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null;
      const w = await db.from('academy_course_access').upsert(
        { tenant_id: tenantId, course_id: courseId, source, granted_at: stamp, revoked_at: null, granted_by: adminUserId, note },
        { onConflict: 'tenant_id,course_id,source' },
      );
      if (w?.error) return bad('השמירה נכשלה', 500);
      return okR({ tenantId });
    }
    const w = await db.from('academy_course_access').update({ revoked_at: stamp })
      .eq('tenant_id', tenantId).eq('course_id', courseId).eq('source', source).is('revoked_at', null);
    if (w?.error) return bad('השמירה נכשלה', 500);
    return okR({ tenantId });
  }

  return bad('פעולה לא מוכרת');
}
