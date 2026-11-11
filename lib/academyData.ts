// lib/academyData.ts
//
// SERVER ONLY. The Academy's reads and writes around the pure rules in lib/academy.ts. Every function takes its database client
// as an argument (the service-role client from lib/adminGuard.ts in production, an in-memory one in test-academy.ts), so the
// rules that matter (who may open what, what counts as done) are exercised against the same code the pages run.
//
// The business and the user ALWAYS come from the session (resolveViewer), never from a URL or a body. The service-role client is
// used so that Premium (read from her plan) and the grants are judged in one place, lib/academy.ts, and every query below filters by
// the session's tenant and user. RLS on the tables (add_academy_2026-11-11.sql) is the second lock, not the only one.
import {
  canView, courseProgress, bySort, visibleLessons, certificateEligible, courseStats,
  type CourseRow, type LessonRow, type AccessRow, type ProgressRow, type CourseProgress, type CourseStats, type TenantTier,
} from './academy.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from: (table: string) => any };
type SessionDb = { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }; rpc: (fn: string) => any };

export type Viewer = { userId: string; tenantId: string };

/** The signed-in user and her business, from the session only. null when either is missing. */
export async function resolveViewer(session: SessionDb): Promise<Viewer | null> {
  try {
    const { data } = await session.auth.getUser();
    const user = data?.user;
    if (!user?.id) return null;
    const r = await session.rpc('get_user_tenant_id');
    const tenantId = typeof r?.data === 'string' && r.data ? r.data : null;
    if (r?.error || !tenantId) return null;
    return { userId: user.id, tenantId };
  } catch {
    return null;
  }
}

/** The tables do not exist yet (the migration has not run): PostgREST 'PGRST205' / Postgres '42P01'. */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(error.message || ''));
}

export type LoadFail = { ok: false; reason: 'missing-migration' | 'error' };

const LESSON_COLS = 'id, course_id, slug, title, minutes, video_url, body, task, sort, published';
const COURSE_COLS = 'id, slug, title, subtitle, price_ils, published, sort';

async function readTier(db: Db, tenantId: string): Promise<TenantTier | null> {
  // There is no plan_tier column yet (lib/academy.ts "Premium"): only plan_status is read, so Premium stays false.
  const r = await db.from('tenants').select('plan_status').eq('id', tenantId).maybeSingle();
  return r?.error ? null : (r?.data as TenantTier) || null;
}

async function readBase(db: Db, viewer: Viewer) {
  const [courses, lessons, grants, progress, tier] = await Promise.all([
    db.from('academy_courses').select(COURSE_COLS).order('sort'),
    db.from('academy_lessons').select(LESSON_COLS).order('sort'),
    db.from('academy_course_access').select('tenant_id, course_id, source, granted_at, revoked_at').eq('tenant_id', viewer.tenantId),
    db.from('academy_lesson_progress').select('tenant_id, user_id, lesson_id, completed_at').eq('tenant_id', viewer.tenantId).eq('user_id', viewer.userId),
    readTier(db, viewer.tenantId),
  ]);
  const err = courses.error || lessons.error || grants.error || progress.error;
  if (err) return { ok: false as const, reason: isMissingTable(err) ? 'missing-migration' as const : 'error' as const };
  return {
    ok: true as const,
    courses: (courses.data || []) as CourseRow[],
    lessons: (lessons.data || []) as LessonRow[],
    grants: (grants.data || []) as AccessRow[],
    progress: (progress.data || []) as ProgressRow[],
    tier,
  };
}

export type CatalogItem = { course: CourseRow; progress: CourseProgress; lessonCount: number; draft: boolean };

/**
 * The catalog: ONLY the courses she can open (and, for a platform admin, every course, drafts marked). A course she cannot open is
 * not in the list at all: while purchase is not live there is nothing to offer her, so nothing is shown.
 */
export async function loadCatalog(db: Db, viewer: Viewer, isAdmin: boolean, env?: Record<string, string | undefined>): Promise<{ ok: true; items: CatalogItem[] } | LoadFail> {
  const b = await readBase(db, viewer);
  if (!b.ok) return b;
  const tenant = { id: viewer.tenantId, ...(b.tier || {}) };
  const items = bySort(b.courses)
    .filter((c) => canView(isAdmin, tenant, c, b.grants, env))
    .map((course) => ({
      course,
      progress: courseProgress(course.id, b.lessons, b.progress, viewer),
      lessonCount: visibleLessons(b.lessons, course.id, isAdmin).length,
      draft: !course.published,
    }));
  return { ok: true, items };
}

export type CourseView = {
  course: CourseRow;
  lessons: (LessonRow & { done: boolean })[];
  progress: CourseProgress;
  certificate: boolean;
  draft: boolean;
};

/** One course, or null when it does not exist or she cannot open it (the page answers 404 either way: no hint it exists). */
export async function loadCourse(db: Db, viewer: Viewer, isAdmin: boolean, slug: string, env?: Record<string, string | undefined>): Promise<{ ok: true; view: CourseView | null } | LoadFail> {
  const b = await readBase(db, viewer);
  if (!b.ok) return b;
  const course = b.courses.find((c) => c.slug === slug);
  const tenant = { id: viewer.tenantId, ...(b.tier || {}) };
  if (!course || !canView(isAdmin, tenant, course, b.grants, env)) return { ok: true, view: null };
  const done = new Set(b.progress.map((p) => p.lesson_id));
  const progress = courseProgress(course.id, b.lessons, b.progress, viewer);
  const access = canView(false, tenant, course, b.grants, env) || isAdmin;
  return {
    ok: true,
    view: {
      course,
      lessons: visibleLessons(b.lessons, course.id, isAdmin).map((l) => ({ ...l, done: done.has(l.id) })),
      progress,
      certificate: certificateEligible(access, progress),
      draft: !course.published,
    },
  };
}

/** The certificate's facts: her name and business from her settings, the course, the date she finished. null = not earned. */
export async function loadCertificate(db: Db, viewer: Viewer, isAdmin: boolean, slug: string, env?: Record<string, string | undefined>): Promise<{ ok: true; cert: { name: string; business: string; course: string; completedAt: string } | null } | LoadFail> {
  const c = await loadCourse(db, viewer, isAdmin, slug, env);
  if (!c.ok) return c;
  if (!c.view || !c.view.certificate || !c.view.progress.completedAt) return { ok: true, cert: null };
  const s = await db.from('settings').select('therapist_name, business_name').eq('tenant_id', viewer.tenantId).maybeSingle();
  const row = (s?.data || {}) as { therapist_name?: string | null; business_name?: string | null };
  return {
    ok: true,
    cert: { name: String(row.therapist_name || '').trim(), business: String(row.business_name || '').trim(), course: c.view.course.title, completedAt: c.view.progress.completedAt },
  };
}

// ── "סיימתי" ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type MarkResult =
  | { ok: true; already: boolean; progress: CourseProgress; certificate: boolean }
  | { ok: false; status: number; error: string };

/**
 * Mark one lesson done for the session's business and user. Refused (404) for a lesson that does not exist, is a draft, belongs
 * to a draft course, or a course she cannot open. Idempotent: the row is written with "ignore duplicates" on the primary key, and
 * an existing row is reported as already done, so the first completion time is kept.
 */
export async function markLessonDone(db: Db, viewer: Viewer, lessonId: string, now: Date = new Date(), env?: Record<string, string | undefined>): Promise<MarkResult> {
  if (typeof lessonId !== 'string' || !/^[0-9a-f-]{36}$/i.test(lessonId)) return { ok: false, status: 400, error: 'bad-lesson' };
  const b = await readBase(db, viewer);
  if (!b.ok) return { ok: false, status: b.reason === 'missing-migration' ? 503 : 500, error: b.reason };
  const lesson = b.lessons.find((l) => l.id === lessonId);
  const course = lesson ? b.courses.find((c) => c.id === lesson.course_id) : undefined;
  const tenant = { id: viewer.tenantId, ...(b.tier || {}) };
  // A business (admins included, as a business) records progress only on what is really open to her: published and granted.
  if (!lesson || !lesson.published || !course || !canView(false, tenant, course, b.grants, env)) return { ok: false, status: 404, error: 'not-found' };

  const already = b.progress.some((p) => p.lesson_id === lessonId);
  let progressRows = b.progress;
  if (!already) {
    const row: ProgressRow = { tenant_id: viewer.tenantId, user_id: viewer.userId, lesson_id: lessonId, completed_at: now.toISOString() };
    const w = await db.from('academy_lesson_progress').upsert(row, { onConflict: 'tenant_id,user_id,lesson_id', ignoreDuplicates: true });
    if (w?.error) return { ok: false, status: 500, error: 'write-failed' };
    progressRows = [...b.progress, row];
  }
  const progress = courseProgress(course.id, b.lessons, progressRows, viewer);
  return { ok: true, already, progress, certificate: certificateEligible(true, progress) };
}

// ── Platform admin ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type AdminOverview = {
  courses: (CourseRow & { lessons: LessonRow[]; stats: CourseStats })[];
  grants: (AccessRow & { business: string })[];
};

export async function loadAdminOverview(db: Db): Promise<{ ok: true; data: AdminOverview } | LoadFail> {
  const [courses, lessons, grants, progress] = await Promise.all([
    db.from('academy_courses').select(COURSE_COLS).order('sort'),
    db.from('academy_lessons').select(LESSON_COLS).order('sort'),
    db.from('academy_course_access').select('tenant_id, course_id, source, granted_at, revoked_at').order('granted_at'),
    db.from('academy_lesson_progress').select('tenant_id, user_id, lesson_id, completed_at').limit(50000),
  ]);
  const err = courses.error || lessons.error || grants.error || progress.error;
  if (err) return { ok: false, reason: isMissingTable(err) ? 'missing-migration' : 'error' };
  const C = bySort((courses.data || []) as CourseRow[]);
  const L = (lessons.data || []) as LessonRow[];
  const G = (grants.data || []) as AccessRow[];
  const P = (progress.data || []) as ProgressRow[];
  const stats = courseStats(C, L, G, P);
  const ids = [...new Set(G.map((g) => g.tenant_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const s = await db.from('settings').select('tenant_id, business_name').in('tenant_id', ids);
    for (const r of (s?.data || []) as { tenant_id: string; business_name?: string | null }[]) names.set(r.tenant_id, String(r.business_name || ''));
  }
  return {
    ok: true,
    data: {
      courses: C.map((c, i) => ({ ...c, lessons: visibleLessons(L, c.id, true), stats: stats[i] })),
      grants: G.map((g) => ({ ...g, business: names.get(g.tenant_id) || '' })),
    },
  };
}

