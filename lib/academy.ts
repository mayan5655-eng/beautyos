// lib/academy.ts
//
// "Kalmea Academy": short video courses for the business owner herself (ads, Google, photographing her work). PURE: no database,
// no network, no React. The loaders (lib/academyData.ts) and the routes call these, and test-academy.ts tests them directly.
//
// ── The business model (decided by the owner, option ג) ──────────────────────────────────────────────────────────────────────────
//   * A Premium monthly tier includes every course while it is active.
//   * Anyone not on Premium can buy one course, one time, and keep it for life.
//   * Billing for either is NOT live. Nothing here sells anything: no price is shown to a business, no buy button exists. A course
//     she has no grant for is simply not listed for her. Access today comes only from a grant a platform admin gives
//     (beta testers: source 'gift' or 'admin').
//
// ── Premium ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// There is no tier column on public.tenants yet (one plan, lib/pricing.ts). isPremiumActive() is therefore FALSE for everyone until
// both exist: ACADEMY_PREMIUM_LIVE=1 on the server AND a tenants.plan_tier column that says 'premium' on an active (paid, not
// trial) plan. The loaders do not read such a column today, so even with the env set the answer stays false. Fails CLOSED: anything
// unreadable is "not premium", because Premium only ever ADDS access and a purchase or grant does not depend on it.
//
// ── Flag ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// NEXT_PUBLIC_ACADEMY empty = the Academy does not exist: no menu entry, every /dashboard/academy page and every /api/academy and
// /api/admin/academy route answers 404, and the CSP never names a video host.

type Env = Record<string, string | undefined>;

export function academyEnabled(env: Env = { NEXT_PUBLIC_ACADEMY: process.env.NEXT_PUBLIC_ACADEMY }): boolean {
  const v = String(env.NEXT_PUBLIC_ACADEMY || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

// ── Types (the rows as the loaders read them) ────────────────────────────────────────────────────────────────────────────────────

export type AccessSource = 'premium' | 'purchase' | 'gift' | 'admin';
export const ACCESS_SOURCES: readonly AccessSource[] = ['premium', 'purchase', 'gift', 'admin'];
/** Grants that are hers until revoked, whatever happens to her plan. */
export const LIFETIME_SOURCES: readonly AccessSource[] = ['purchase', 'gift', 'admin'];

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  price_ils?: number | null;
  published: boolean;
  sort?: number | null;
}

export interface LessonRow {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  minutes?: number | null;
  video_url?: string | null;
  body?: string | null;
  task?: string | null;
  sort?: number | null;
  published: boolean;
}

export interface AccessRow {
  tenant_id: string;
  course_id: string;
  source: string;
  granted_at?: string | null;
  revoked_at?: string | null;
}

export interface ProgressRow {
  tenant_id: string;
  user_id: string;
  lesson_id: string;
  completed_at: string;
}

export interface TenantTier {
  plan_tier?: string | null;
  plan_status?: string | null;
}

// ── Access ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function premiumLive(env: Env = { ACADEMY_PREMIUM_LIVE: process.env.ACADEMY_PREMIUM_LIVE }): boolean {
  return /^(1|true)$/i.test(String(env.ACADEMY_PREMIUM_LIVE || '').trim());
}

/** Premium is on only when it is live AND her plan says premium AND it is paid and active (a trial is not Premium). */
export function isPremiumActive(tenant: TenantTier | null | undefined, env?: Env): boolean {
  if (!premiumLive(env)) return false;
  if (!tenant) return false;
  return tenant.plan_tier === 'premium' && tenant.plan_status === 'active';
}

/** A lifetime grant (purchase, gift, admin) for this business and this course that has not been revoked. */
export function hasLifetimeGrant(tenantId: string, courseId: string, grants: readonly AccessRow[]): boolean {
  return grants.some((g) =>
    g.tenant_id === tenantId && g.course_id === courseId && !g.revoked_at && (LIFETIME_SOURCES as readonly string[]).includes(g.source));
}

/**
 * Can this business open this course? Active Premium, OR a non-revoked lifetime purchase / gift / admin grant.
 * A 'premium' row in course_access gives nothing by itself: Premium is read from her plan, so it ends when the plan ends.
 * An unpublished course is never open to a business (platform admins preview through canView, not here).
 */
export function hasAccess(
  tenant: ({ id: string } & TenantTier) | null | undefined,
  course: Pick<CourseRow, 'id' | 'published'> | null | undefined,
  grants: readonly AccessRow[],
  env?: Env,
): boolean {
  if (!tenant || !tenant.id || !course || !course.published) return false;
  if (isPremiumActive(tenant, env)) return true;
  return hasLifetimeGrant(tenant.id, course.id, grants);
}

/** What the viewer may open: a platform admin sees everything (drafts too, to check them); a business, what hasAccess says. */
export function canView(isAdmin: boolean, ...args: Parameters<typeof hasAccess>): boolean {
  if (isAdmin) return !!args[1];
  return hasAccess(...args);
}

// ── Ordering and progress ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function bySort<T extends { sort?: number | null; title?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'he'));
}

/** The lessons she sees in a course: published ones, in order. An admin also sees drafts. */
export function visibleLessons(lessons: readonly LessonRow[], courseId: string, isAdmin = false): LessonRow[] {
  return bySort(lessons.filter((l) => l.course_id === courseId && (isAdmin || l.published)));
}

export interface CourseProgress {
  done: number;
  total: number;
  /** 0..100, whole numbers. */
  percent: number;
  complete: boolean;
  /** The first lesson not done yet, in order (null when all are done or there are none). */
  nextLessonId: string | null;
  /** When the last of her lessons was finished (for the certificate), ISO; null until complete. */
  completedAt: string | null;
}

/**
 * Progress over the PUBLISHED lessons of a course. Counts each lesson once however many rows exist for it, and only rows of this
 * business and this user. A course with no published lessons is never "complete" (there is nothing to have finished).
 */
export function courseProgress(courseId: string, lessons: readonly LessonRow[], progress: readonly ProgressRow[], who: { tenantId: string; userId: string }): CourseProgress {
  const list = visibleLessons(lessons, courseId, false);
  const doneAt = new Map<string, string>();
  for (const p of progress) {
    if (p.tenant_id !== who.tenantId || p.user_id !== who.userId) continue;
    const prev = doneAt.get(p.lesson_id);
    if (!prev || p.completed_at < prev) doneAt.set(p.lesson_id, p.completed_at);
  }
  const doneLessons = list.filter((l) => doneAt.has(l.id));
  const total = list.length;
  const done = doneLessons.length;
  const complete = total > 0 && done === total;
  const next = list.find((l) => !doneAt.has(l.id));
  const completedAt = complete ? doneLessons.map((l) => doneAt.get(l.id) as string).sort().at(-1) ?? null : null;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, complete, nextLessonId: next ? next.id : null, completedAt };
}

/** The certificate exists only once every published lesson of a course she can open is done. */
export function certificateEligible(hasCourseAccess: boolean, p: CourseProgress): boolean {
  return hasCourseAccess && p.complete && p.total > 0;
}

/**
 * The single progress row a "סיימתי" tap writes. The database key is (tenant_id, user_id, lesson_id) and the write ignores a
 * duplicate, so tapping twice, or on two devices, leaves exactly one row with the FIRST completion time.
 */
export function progressKey(r: Pick<ProgressRow, 'tenant_id' | 'user_id' | 'lesson_id'>): string {
  return `${r.tenant_id}|${r.user_id}|${r.lesson_id}`;
}

/** Merge a new completion into existing rows the way the database does (first one wins). Used by tests and the admin counts. */
export function mergeProgress(rows: readonly ProgressRow[], add: ProgressRow): ProgressRow[] {
  const k = progressKey(add);
  return rows.some((r) => progressKey(r) === k) ? [...rows] : [...rows, add];
}

// ── Video: a strict allowlist ───────────────────────────────────────────────────────────────────────────────────────────────────
// Only YouTube (unlisted works: it is just a video id) and Vimeo (an unlisted Vimeo link carries a privacy hash, kept as ?h=).
// Anything else, including other hosts, http, javascript:, credentials in the URL, odd ports or malformed ids, is refused: the
// admin cannot save it and a lesson never renders it. The frame always points at one of two fixed origins, which are the only
// ones the CSP opens (lib/securityHeaders.ts ACADEMY_FRAME_ORIGINS) and only on /dashboard/academy while the flag is on.

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
export const VIMEO_EMBED_ORIGIN = 'https://player.vimeo.com';
export const ACADEMY_FRAME_ORIGINS = [YOUTUBE_EMBED_ORIGIN, VIMEO_EMBED_ORIGIN] as const;

export type VideoEmbed = { provider: 'youtube' | 'vimeo'; id: string; embedUrl: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{5,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

export function parseVideoUrl(raw: unknown): VideoEmbed | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (host === 'youtu.be') id = parts.length === 1 ? parts[0] : null;
    else if (parts.length === 1 && parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts.length === 2 && (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live')) id = parts[1];
    if (!id || !YT_ID.test(id)) return null;
    return { provider: 'youtube', id, embedUrl: `${YOUTUBE_EMBED_ORIGIN}/embed/${id}?rel=0&modestbranding=1` };
  }

  if (VIMEO_HOSTS.has(host)) {
    let id: string | null = null;
    let hash: string | null = null;
    if (host === 'player.vimeo.com') {
      if (parts.length === 2 && parts[0] === 'video') { id = parts[1]; hash = u.searchParams.get('h'); }
    } else if (parts.length === 1 || parts.length === 2) {
      id = parts[0];
      hash = parts[1] ?? u.searchParams.get('h');
    }
    if (!id || !VIMEO_ID.test(id)) return null;
    if (hash != null && !VIMEO_HASH.test(hash)) return null;
    return { provider: 'vimeo', id, embedUrl: `${VIMEO_EMBED_ORIGIN}/video/${id}?${hash ? `h=${hash}&` : ''}dnt=1` };
  }
  return null;
}

// ── Lesson body: a tiny, safe text format ────────────────────────────────────────────────────────────────────────────────────────
// The owner writes plain text with a few markdown habits. It is rendered as React text (escaped), never as HTML.
//   "## כותרת" -> heading, "- פריט" or "* פריט" -> list item, a blank line -> new paragraph.

export type BodyBlock = { kind: 'h'; text: string } | { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

export function parseLessonBody(body: string | null | undefined): BodyBlock[] {
  const out: BodyBlock[] = [];
  const lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) { out.push({ kind: 'p', text: para.join('\n') }); para = []; }
    if (list) { out.push({ kind: 'ul', items: list }); list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (h) { flush(); out.push({ kind: 'h', text: h[1].trim() }); continue; }
    const li = /^[-*•]\s+(.+)$/.exec(line.trim());
    if (li) { if (para.length) { out.push({ kind: 'p', text: para.join('\n') }); para = []; } (list ||= []).push(li[1].trim()); continue; }
    if (list) { out.push({ kind: 'ul', items: list }); list = null; }
    para.push(line.trim());
  }
  flush();
  return out;
}

// ── Admin input ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** null when empty, NaN when present but not a whole number in range. */
const int = (v: unknown, min: number, max: number): number | null => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN;
};

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };

export function cleanCourseInput(b: Record<string, unknown>): Clean<{ slug: string; title: string; subtitle: string | null; price_ils?: number | null; published: boolean; sort: number }> {
  const slug = str(b.slug, 60).toLowerCase();
  const title = str(b.title, 120);
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'כתובת קצרה באנגלית בלבד: אותיות קטנות, ספרות ומקפים' };
  if (!title) return { ok: false, error: 'חסרה כותרת לקורס' };
  const price = int(b.price_ils, 0, 100000);
  if (price !== null && Number.isNaN(price)) return { ok: false, error: 'מחיר צריך להיות מספר שלם בשקלים' };
  const sort = int(b.sort, -1000, 100000);
  if (sort !== null && Number.isNaN(sort)) return { ok: false, error: 'סדר צריך להיות מספר שלם' };
  // price_ils is stored for when purchase goes live and is never shown to a business. It is written only when the caller sends it,
  // so saving a course from the admin screen (which does not offer a price while billing is off) never wipes one.
  const value: { slug: string; title: string; subtitle: string | null; price_ils?: number | null; published: boolean; sort: number } =
    { slug, title, subtitle: str(b.subtitle, 240) || null, published: b.published === true, sort: sort ?? 0 };
  if (b.price_ils !== undefined) value.price_ils = price;
  return { ok: true, value };
}

export function cleanLessonInput(b: Record<string, unknown>): Clean<{ slug: string; title: string; minutes: number | null; video_url: string | null; body: string; task: string; sort: number; published: boolean }> {
  const slug = str(b.slug, 60).toLowerCase();
  const title = str(b.title, 160);
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'כתובת קצרה באנגלית בלבד: אותיות קטנות, ספרות ומקפים' };
  if (slug === 'certificate') return { ok: false, error: 'הכתובת הזו שמורה לתעודה, אפשר לבחור אחרת' };
  if (!title) return { ok: false, error: 'חסרה כותרת לשיעור' };
  const minutes = int(b.minutes, 0, 600);
  if (minutes !== null && Number.isNaN(minutes)) return { ok: false, error: 'משך בדקות צריך להיות מספר שלם' };
  const sort = int(b.sort, -1000, 100000);
  if (sort !== null && Number.isNaN(sort)) return { ok: false, error: 'סדר צריך להיות מספר שלם' };
  const rawVideo = str(b.video_url, 300);
  if (rawVideo && !parseVideoUrl(rawVideo)) return { ok: false, error: 'קישור הווידאו צריך להיות מיוטיוב או מוימאו' };
  return {
    ok: true,
    value: { slug, title, minutes, video_url: rawVideo || null, body: str(b.body, 20000), task: str(b.task, 4000), sort: sort ?? 0, published: b.published === true },
  };
}

// ── Admin counts ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CourseStats { courseId: string; grantees: number; started: number; completed: number; perLesson: Record<string, number> }

/**
 * Per course: how many businesses hold an active grant, how many started (one lesson done), how many finished every published
 * lesson. Per lesson: how many businesses marked it done. Counted per business (a business with two users counts once).
 */
export function courseStats(courses: readonly CourseRow[], lessons: readonly LessonRow[], grants: readonly AccessRow[], progress: readonly ProgressRow[]): CourseStats[] {
  return courses.map((c) => {
    const pub = visibleLessons(lessons, c.id, false);
    const pubIds = new Set(pub.map((l) => l.id));
    const perLessonSet = new Map<string, Set<string>>();
    for (const l of visibleLessons(lessons, c.id, true)) perLessonSet.set(l.id, new Set());
    for (const p of progress) perLessonSet.get(p.lesson_id)?.add(p.tenant_id);
    const doneByTenant = new Map<string, Set<string>>();
    for (const p of progress) {
      if (!pubIds.has(p.lesson_id)) continue;
      (doneByTenant.get(p.tenant_id) || doneByTenant.set(p.tenant_id, new Set()).get(p.tenant_id)!).add(p.lesson_id);
    }
    const grantees = new Set(grants.filter((g) => g.course_id === c.id && !g.revoked_at).map((g) => g.tenant_id)).size;
    let completed = 0;
    for (const s of doneByTenant.values()) if (pub.length > 0 && s.size === pub.length) completed++;
    return {
      courseId: c.id, grantees, started: doneByTenant.size, completed,
      perLesson: Object.fromEntries([...perLessonSet].map(([k, v]) => [k, v.size])),
    };
  });
}

/** "12 דקות" / "דקה אחת" */
export function minutesHe(n: number | null | undefined): string {
  if (!n || n < 1) return '';
  return n === 1 ? 'דקה אחת' : `${n} דקות`;
}

/** The certificate date, written the Israeli way: 11.11.2026 */
export function certificateDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')}`;
}
