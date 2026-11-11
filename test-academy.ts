// test-academy.ts
//
// Kalmea Academy (lib/academy.ts, lib/academyData.ts, lib/academyAdmin.ts, app/dashboard/academy, app/dashboard/admin/academy,
// app/api/academy/*, app/api/admin/academy):
//   * flag off: no menu entry renders, every page calls notFound() before touching anything, every route answers 404, no video
//     host in the CSP
//   * access: Premium (never live yet), lifetime purchase / gift / admin, revoked, other business, unpublished course
//   * "סיימתי" is idempotent (one row, first time kept) and refused for a lesson she cannot open
//   * the video allowlist accepts YouTube / Vimeo forms and refuses everything else
//   * the certificate exists only after every published lesson is done
//   * the admin route and page are behind requirePlatformAdmin (a real guard run: no session -> 404, lookup failure -> 404)
//   * nothing purchasable is rendered: no price, no buy, no "בקרוב", and a course she cannot open is not listed
// In-memory database, no network, no real tenant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import {
  academyEnabled, hasAccess, isPremiumActive, canView, courseProgress, certificateEligible, parseVideoUrl, parseLessonBody,
  cleanLessonInput, cleanCourseInput, courseStats, mergeProgress, certificateDate, ACADEMY_FRAME_ORIGINS,
  type CourseRow, type LessonRow, type AccessRow, type ProgressRow,
} from './lib/academy.ts';
import { loadCatalog, loadCourse, loadCertificate, markLessonDone, resolveViewer, loadAdminOverview, type Db } from './lib/academyData.ts';
import { runAdminAction } from './lib/academyAdmin.ts';
import { buildCsp } from './lib/securityHeaders.ts';
import { importApp, renderApp } from './testkit/render.mjs';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C1 = 'c1c1c1c1-0000-4000-8000-000000000001';
const C2 = 'c2c2c2c2-0000-4000-8000-000000000002';
const C3 = 'c3c3c3c3-0000-4000-8000-000000000003';
const L = (i: number) => `1e550000-0000-4000-8000-00000000000${i}`;
const ON = { NEXT_PUBLIC_ACADEMY: '1' };
const PREMIUM_ON = { ACADEMY_PREMIUM_LIVE: '1' };

// ── an in-memory slice of supabase-js ────────────────────────────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;
function makeDb(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string; row: Row }[] = [];
  let seq = 0;
  const db = {
    tables, writes,
    from(table: string) {
      const st: { filters: ((r: Row) => boolean)[]; op: string; payload: any; opts: any; single: boolean; limit: number | null } =
        { filters: [], op: 'select', payload: null, opts: null, single: false, limit: null };
      const rows = () => (tables[table] ||= []);
      const run = () => {
        if (st.op === 'insert') {
          const row = { id: `${table}-${++seq}`, ...st.payload };
          if (table === 'academy_courses' && rows().some((r) => r.slug === row.slug)) return { data: null, error: { code: '23505', message: 'duplicate' } };
          rows().push(row); writes.push({ table, op: 'insert', row });
          return { data: st.single ? { id: row.id } : [row], error: null };
        }
        if (st.op === 'upsert') {
          const keys = String(st.opts?.onConflict || 'id').split(',');
          const hit = rows().find((r) => keys.every((k) => r[k] === st.payload[k]));
          if (hit) { if (!st.opts?.ignoreDuplicates) { Object.assign(hit, st.payload); writes.push({ table, op: 'update', row: hit }); } return { data: null, error: null }; }
          rows().push({ ...st.payload }); writes.push({ table, op: 'insert', row: st.payload });
          return { data: null, error: null };
        }
        const hit = rows().filter((r) => st.filters.every((f) => f(r)));
        if (st.op === 'update') {
          for (const r of hit) { Object.assign(r, st.payload); writes.push({ table, op: 'update', row: r }); }
          return { data: st.single ? (hit[0] ? { id: hit[0].id } : null) : hit, error: null };
        }
        const out = hit.slice(0, st.limit ?? undefined).map((r) => ({ ...r }));
        return { data: st.single ? out[0] || null : out, error: null };
      };
      const api: any = {
        select: () => api,
        order: () => api,
        limit: (k: number) => { st.limit = k; return api; },
        eq: (c: string, v: unknown) => { st.filters.push((r) => r[c] === v); return api; },
        is: (c: string, v: unknown) => { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api; },
        in: (c: string, vs: unknown[]) => { st.filters.push((r) => vs.includes(r[c])); return api; },
        maybeSingle: () => { st.single = true; return api; },
        insert: (p: Row) => { st.op = 'insert'; st.payload = p; return api; },
        update: (p: Row) => { st.op = 'update'; st.payload = p; return api; },
        upsert: (p: Row, o: any) => { st.op = 'upsert'; st.payload = p; st.opts = o; return api; },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return api;
    },
  };
  return db;
}

const course = (id: string, slug: string, o: Partial<CourseRow> = {}): CourseRow => ({ id, slug, title: `קורס ${slug}`, subtitle: 'שורת משנה', price_ils: 290, published: true, sort: 0, ...o });
const lesson = (id: string, courseId: string, sort: number, o: Partial<LessonRow> = {}): LessonRow =>
  ({ id, course_id: courseId, slug: `l${sort}`, title: `שיעור ${sort}`, minutes: 7, video_url: 'https://youtu.be/dQw4w9WgXcQ', body: 'טקסט', task: 'משימה', sort, published: true, ...o });

function world() {
  return makeDb({
    academy_courses: [
      course(C1, 'paid-social', { sort: 1 }),
      course(C2, 'google-business', { sort: 2 }), // no grant: must not be listed
      course(C3, 'phone-photos', { sort: 3, published: false }), // draft: admins only
    ],
    academy_lessons: [
      lesson(L(1), C1, 1), lesson(L(2), C1, 2), lesson(L(3), C1, 3, { published: false }), // a draft lesson never counts
      lesson(L(4), C2, 1),
      lesson(L(5), C3, 1),
    ],
    academy_course_access: [
      { tenant_id: T1, course_id: C1, source: 'gift', granted_at: '2026-11-01T10:00:00Z', revoked_at: null },
      { tenant_id: T2, course_id: C2, source: 'gift', granted_at: '2026-11-01T10:00:00Z', revoked_at: null },
    ],
    academy_lesson_progress: [],
    tenants: [{ id: T1, plan_status: 'active', slug: 'dana' }, { id: T2, plan_status: 'trial', slug: 'noa' }],
    settings: [{ tenant_id: T1, therapist_name: 'דנה כהן', business_name: 'הסטודיו של דנה' }],
  });
}
const viewer = { tenantId: T1, userId: U1 };

// ── 1. the flag ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

await ok('flag: only 1 / true turn the Academy on', () => {
  assert.equal(academyEnabled({}), false);
  assert.equal(academyEnabled({ NEXT_PUBLIC_ACADEMY: '' }), false);
  assert.equal(academyEnabled({ NEXT_PUBLIC_ACADEMY: '0' }), false);
  assert.equal(academyEnabled({ NEXT_PUBLIC_ACADEMY: 'yes please' }), false);
  assert.equal(academyEnabled({ NEXT_PUBLIC_ACADEMY: '1' }), true);
  assert.equal(academyEnabled({ NEXT_PUBLIC_ACADEMY: ' TRUE ' }), true);
  assert.equal(academyEnabled(), false, 'the test runner keeps it off');
});

await ok('flag off: the CSP never names a video host, even on the Academy path', () => {
  const off = buildCsp({ env: {}, academy: true });
  for (const o of ACADEMY_FRAME_ORIGINS) assert.ok(!off.includes(o), o);
  assert.match(off, /frame-src 'none'/);
});

await ok('flag on: only the Academy path frames exactly the two player origins', () => {
  const on = buildCsp({ env: ON, academy: true });
  const frame = /frame-src ([^;]+)/.exec(on)![1].split(' ');
  assert.deepEqual(frame.sort(), ['https://player.vimeo.com', 'https://www.youtube-nocookie.com']);
  assert.ok(!/youtube|vimeo/.test(buildCsp({ env: ON })), 'every other page keeps frame-src none');
  const cfg = readFileSync('next.config.ts', 'utf8');
  assert.match(cfg, /academyEnabled\(\)\s*\?\s*\[\{ source: "\/dashboard\/academy\/:path\*", headers: securityHeaders\(\{[^}]*academy: true/);
});

// Pages and client components go through the JSX loader; route handlers through the alias loader (registered after it, so it
// sees "@/lib/supabase/server" first and swaps in the stub).
const { default: AcademyNavEntry } = await importApp('app/AcademyNavEntry.jsx');
register('./testkit/aliasLoader.mjs', import.meta.url);

await ok('flag off: the menu entry renders nothing (side menu and "עוד" sheet)', () => {
  assert.equal(renderApp(AcademyNavEntry, { variant: 'nav', onOpen() {} }), '');
  assert.equal(renderApp(AcademyNavEntry, { variant: 'more', onOpen() {} }), '');
  const shell = readFileSync('app/beautyos.jsx', 'utf8');
  const uses = shell.match(/<AcademyNavEntry[^>]*>/g) || [];
  assert.equal(uses.length, 2);
  for (const u of shell.split('\n').filter((l) => l.includes('<AcademyNavEntry'))) assert.match(u, /\{ACADEMY_ON&&!tillOnly&&<AcademyNavEntry/);
  assert.match(shell, /const ACADEMY_ON = academyEnabled\(\);/);
  assert.match(readFileSync('app/dashboard/admin/AdminClient.tsx', 'utf8'), /\{academyEnabled\(\) && <a href="\/dashboard\/admin\/academy"/);
});

let dbTouched = 0;
(globalThis as any).__TEST_SUPABASE__ = new Proxy({}, { get() { dbTouched++; throw new Error('touched the session while the flag is off'); } });
const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async () => { fetchCalls++; throw new Error('academy test reached the network'); }) as typeof fetch;

const progressRoute = await import('./app/api/academy/progress/route.ts');
const summaryRoute = await import('./app/api/academy/summary/route.ts');
const adminRoute = await import('./app/api/admin/academy/route.ts');
const post = (url: string, body: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

await ok('flag off: every route answers 404 and touches nothing', async () => {
  assert.equal((await progressRoute.POST(post('http://x/api/academy/progress', { lessonId: L(1) }))).status, 404);
  assert.equal((await summaryRoute.GET()).status, 404);
  assert.equal((await adminRoute.POST(post('http://x/api/admin/academy', { action: 'grant' }))).status, 404);
  assert.equal(dbTouched, 0);
  assert.equal(fetchCalls, 0);
});

const PAGES = [
  'app/dashboard/academy/page.tsx',
  'app/dashboard/academy/[course]/page.tsx',
  'app/dashboard/academy/[course]/[lesson]/page.tsx',
  'app/dashboard/academy/[course]/certificate/page.tsx',
  'app/dashboard/admin/academy/page.tsx',
];
await ok('flag off: every Academy page calls notFound() before the session or the database', async () => {
  for (const p of PAGES) {
    const mod = await importApp(p);
    await assert.rejects(() => mod.default({ params: Promise.resolve({ course: 'paid-social', lesson: 'l1' }) }), /notFound/, p);
  }
  assert.equal(dbTouched, 0);
  assert.equal(fetchCalls, 0);
});

// ── 2. access ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const pub = { id: C1, published: true };
const grant = (o: Partial<AccessRow> = {}): AccessRow => ({ tenant_id: T1, course_id: C1, source: 'purchase', revoked_at: null, ...o });

await ok('access: a lifetime purchase opens the course, whatever her plan', () => {
  assert.equal(hasAccess({ id: T1, plan_status: 'expired' }, pub, [grant()]), true);
  assert.equal(hasAccess({ id: T1, plan_status: 'active' }, pub, [grant()]), true);
});

await ok('access: gift and admin grants open it too', () => {
  assert.equal(hasAccess({ id: T1 }, pub, [grant({ source: 'gift' })]), true);
  assert.equal(hasAccess({ id: T1 }, pub, [grant({ source: 'admin' })]), true);
});

await ok('access: a revoked grant opens nothing', () => {
  assert.equal(hasAccess({ id: T1 }, pub, [grant({ revoked_at: '2026-11-05T00:00:00Z' })]), false);
  assert.equal(hasAccess({ id: T1 }, pub, [grant({ source: 'gift', revoked_at: '2026-11-05T00:00:00Z' }), grant({ source: 'admin' })]), true, 'another live grant still counts');
});

await ok('access: another business\'s grant, another course\'s grant, or no grant opens nothing', () => {
  assert.equal(hasAccess({ id: T2 }, pub, [grant()]), false);
  assert.equal(hasAccess({ id: T1 }, pub, [grant({ course_id: C2 })]), false);
  assert.equal(hasAccess({ id: T1 }, pub, []), false);
  assert.equal(hasAccess(null, pub, [grant()]), false);
});

await ok('access: an unpublished course is closed to a business even with a grant; an admin may preview it', () => {
  assert.equal(hasAccess({ id: T1 }, { id: C1, published: false }, [grant()]), false);
  assert.equal(canView(true, { id: T1 }, { id: C1, published: false }, []), true);
  assert.equal(canView(false, { id: T1 }, { id: C1, published: false }, [grant()]), false);
});

await ok('premium: always false until it is live, and even then only for an active premium plan', () => {
  const prem = { id: T1, plan_tier: 'premium', plan_status: 'active' };
  assert.equal(isPremiumActive(prem, {}), false, 'not live');
  assert.equal(hasAccess(prem, pub, [], {}), false);
  assert.equal(isPremiumActive(prem, PREMIUM_ON), true);
  assert.equal(hasAccess(prem, pub, [], PREMIUM_ON), true);
  assert.equal(isPremiumActive({ ...prem, plan_status: 'trial' }, PREMIUM_ON), false, 'a trial is not Premium');
  assert.equal(isPremiumActive({ ...prem, plan_status: 'expired' }, PREMIUM_ON), false, 'lapsed Premium closes');
  assert.equal(isPremiumActive({ plan_status: 'active' }, PREMIUM_ON), false, 'no tier column = not premium');
  assert.equal(hasAccess({ ...prem, plan_status: 'expired' }, pub, [grant()], PREMIUM_ON), true, 'a purchase survives Premium ending');
  assert.equal(hasAccess({ id: T1 }, pub, [grant({ source: 'premium' })], {}), false, "a 'premium' row gives nothing by itself");
});

await ok('the loaders never read a plan_tier column (Premium cannot switch on by accident)', () => {
  assert.doesNotMatch(readFileSync('lib/academyData.ts', 'utf8'), /select\('[^']*plan_tier/);
});

// ── 3. catalog: only what she can open ───────────────────────────────────────────────────────────────────────────────────────────

await ok('catalog: lists only courses she can open; an admin sees every course, drafts marked', async () => {
  const db = world();
  const r = await loadCatalog(db as unknown as Db, viewer, false);
  assert.ok(r.ok);
  assert.deepEqual(r.items.map((i) => i.course.slug), ['paid-social']);
  assert.equal(r.items[0].lessonCount, 2, 'the draft lesson is not counted');
  const a = await loadCatalog(db as unknown as Db, viewer, true);
  assert.ok(a.ok);
  assert.deepEqual(a.items.map((i) => [i.course.slug, i.draft]), [['paid-social', false], ['google-business', false], ['phone-photos', true]]);
});

await ok('course page: a course she cannot open, or one that does not exist, is null (the page 404s)', async () => {
  const db = world() as unknown as Db;
  for (const slug of ['google-business', 'phone-photos', 'nope']) {
    const r = await loadCourse(db, viewer, false, slug);
    assert.ok(r.ok);
    assert.equal(r.view, null, slug);
  }
  const r = await loadCourse(db, viewer, false, 'paid-social');
  assert.ok(r.ok && r.view);
  assert.deepEqual(r.view.lessons.map((l) => l.id), [L(1), L(2)], 'a business never sees a draft lesson');
});

await ok('a missing migration is reported as such, never as an empty catalog', async () => {
  const db = { from: () => { const api: any = { select: () => api, order: () => api, eq: () => api, maybeSingle: () => api, then: (r: any) => Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.academy_courses'" } }).then(r) }; return api; } };
  const r = await loadCatalog(db as unknown as Db, viewer, false);
  assert.deepEqual(r, { ok: false, reason: 'missing-migration' });
});

await ok('the viewer comes from the session only', async () => {
  const s = (user: any, tenant: any) => ({ auth: { getUser: async () => ({ data: { user } }) }, rpc: async () => ({ data: tenant, error: null }) });
  assert.deepEqual(await resolveViewer(s({ id: U1 }, T1)), { userId: U1, tenantId: T1 });
  assert.equal(await resolveViewer(s(null, T1)), null);
  assert.equal(await resolveViewer(s({ id: U1 }, null)), null);
});

// ── 4. "סיימתי" and the certificate ─────────────────────────────────────────────────────────────────────────────────────────────

await ok('progress: marking the same lesson twice leaves one row with the first time', async () => {
  const db = world();
  const a = await markLessonDone(db as unknown as Db, viewer, L(1), new Date('2026-11-10T08:00:00Z'));
  assert.ok(a.ok && !a.already);
  const b = await markLessonDone(db as unknown as Db, viewer, L(1), new Date('2026-11-11T08:00:00Z'));
  assert.ok(b.ok && b.already);
  const rows = db.tables.academy_lesson_progress;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completed_at, '2026-11-10T08:00:00.000Z');
  assert.deepEqual({ t: rows[0].tenant_id, u: rows[0].user_id }, { t: T1, u: U1 });
  assert.equal(b.ok && b.progress.done, 1);
  // the database's own key would ignore a duplicate even if two taps raced past the read
  const merged = mergeProgress(rows as ProgressRow[], { tenant_id: T1, user_id: U1, lesson_id: L(1), completed_at: '2026-11-12T00:00:00Z' });
  assert.equal(merged.length, 1);
  assert.match(readFileSync('lib/academyData.ts', 'utf8'), /upsert\(row, \{ onConflict: 'tenant_id,user_id,lesson_id', ignoreDuplicates: true \}\)/);
  assert.match(readFileSync('supabase/migrations/add_academy_2026-11-11.sql', 'utf8'), /primary key \(tenant_id, user_id, lesson_id\)/);
});

await ok('progress: refused for a locked course, a draft lesson, a draft course, or a malformed id', async () => {
  const db = world();
  for (const id of [L(4), L(3), L(5)]) {
    const r = await markLessonDone(db as unknown as Db, viewer, id);
    assert.deepEqual(r.ok ? 'written' : r.status, 404, id);
  }
  const bad = await markLessonDone(db as unknown as Db, viewer, "1' or 1=1");
  assert.equal(bad.ok ? 0 : bad.status, 400);
  assert.equal(db.tables.academy_lesson_progress.length, 0);
});

await ok('certificate: only after every published lesson is done', async () => {
  const db = world();
  const D = db as unknown as Db;
  assert.equal((await loadCertificate(D, viewer, false, 'paid-social') as any).cert, null, 'nothing done');
  await markLessonDone(D, viewer, L(1), new Date('2026-11-10T08:00:00Z'));
  assert.equal((await loadCertificate(D, viewer, false, 'paid-social') as any).cert, null, 'half done');
  const last = await markLessonDone(D, viewer, L(2), new Date('2026-11-11T09:30:00Z'));
  assert.ok(last.ok && last.certificate, 'the last lesson unlocks it (the draft lesson is not required)');
  const c = await loadCertificate(D, viewer, false, 'paid-social');
  assert.ok(c.ok && c.cert);
  assert.deepEqual(c.cert, { name: 'דנה כהן', business: 'הסטודיו של דנה', course: 'קורס paid-social', completedAt: '2026-11-11T09:30:00.000Z' });
  assert.equal(certificateDate(c.cert.completedAt), '11.11.2026');
  // another business with the same lesson ids done does not earn hers, and hers does not leak into theirs
  assert.equal((await loadCertificate(D, { tenantId: T2, userId: U1 }, false, 'paid-social') as any).cert, null);
});

await ok('certificate rules: no lessons = no certificate; no access = no certificate', () => {
  const none = courseProgress(C1, [], [], viewer);
  assert.equal(none.complete, false);
  assert.equal(certificateEligible(true, none), false);
  const lessons = [lesson(L(1), C1, 1)];
  const done = courseProgress(C1, lessons, [{ tenant_id: T1, user_id: U1, lesson_id: L(1), completed_at: '2026-11-01T00:00:00Z' }], viewer);
  assert.equal(certificateEligible(true, done), true);
  assert.equal(certificateEligible(false, done), false);
});

// ── 5. the video allowlist ───────────────────────────────────────────────────────────────────────────────────────────────────────

await ok('video: YouTube and Vimeo links become fixed embed URLs', () => {
  const y = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1';
  for (const u of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ]) assert.equal(parseVideoUrl(u)?.embedUrl, y, u);
  assert.equal(parseVideoUrl('https://vimeo.com/123456789')?.embedUrl, 'https://player.vimeo.com/video/123456789?dnt=1');
  assert.equal(parseVideoUrl('https://vimeo.com/123456789/abcdef1234')?.embedUrl, 'https://player.vimeo.com/video/123456789?h=abcdef1234&dnt=1');
  assert.equal(parseVideoUrl('https://player.vimeo.com/video/123456789?h=abcdef1234')?.embedUrl, 'https://player.vimeo.com/video/123456789?h=abcdef1234&dnt=1');
  for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://vimeo.com/123456789']) assert.ok(ACADEMY_FRAME_ORIGINS.some((o) => parseVideoUrl(u)!.embedUrl.startsWith(o + '/')));
});

await ok('video: everything else is refused', () => {
  for (const u of [
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>', 'javascript:alert(1)',
    'https://user:pw@youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com:8443/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/playlist?list=PL123',
    'https://vimeo.com/abc', 'https://vimeo.com/123456789/../../x', 'https://vimeo.com/123456789/NOTHEX!', 'https://player.vimeo.com/video/123?h=zz',
    'https://drive.google.com/file/d/xyz', 'data:text/html,hi', '', '   ', null, 42, 'https://youtu.be/dQw4w9WgXcQ/extra',
  ]) assert.equal(parseVideoUrl(u as any), null, String(u));
});

await ok('admin input: a non-allowlisted video link cannot be saved', () => {
  assert.equal(cleanLessonInput({ slug: 'l1', title: 'שיעור', video_url: 'https://evil.com/v.mp4' }).ok, false);
  assert.equal(cleanLessonInput({ slug: 'l1', title: 'שיעור', video_url: 'https://youtu.be/dQw4w9WgXcQ' }).ok, true);
  assert.equal(cleanLessonInput({ slug: 'certificate', title: 'שיעור' }).ok, false, 'the certificate path is reserved');
  assert.equal(cleanLessonInput({ slug: 'Bad Slug', title: 'שיעור' }).ok, false);
  assert.equal(cleanLessonInput({ slug: 'l1', title: 'שיעור', minutes: 'abc' }).ok, false);
  const c = cleanCourseInput({ slug: 'paid-social', title: 'קורס' });
  assert.ok(c.ok && !('price_ils' in c.value), 'a save without a price never wipes the stored one');
});

await ok('lesson body: rendered as text blocks (headings, lists, paragraphs), never as HTML', () => {
  assert.deepEqual(parseLessonBody('## פתיחה\nשורה אחת\nשורה שתיים\n\n- א\n- ב\n\n<b>x</b>'), [
    { kind: 'h', text: 'פתיחה' }, { kind: 'p', text: 'שורה אחת\nשורה שתיים' }, { kind: 'ul', items: ['א', 'ב'] }, { kind: 'p', text: '<b>x</b>' },
  ]);
});

// ── 6. admin: the guard and the actions ─────────────────────────────────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_ACADEMY = '1';

await ok('admin guard: with the flag on, no session -> 404, and a failed admin lookup -> 404 (fails closed)', async () => {
  (globalThis as any).__TEST_SUPABASE__ = { auth: { getUser: async () => ({ data: { user: null } }) } };
  assert.equal((await adminRoute.POST(post('http://x/api/admin/academy', { action: 'grant' }))).status, 404);
  (globalThis as any).__TEST_SUPABASE__ = { auth: { getUser: async () => ({ data: { user: { id: U1 } } }) } };
  const before = fetchCalls;
  assert.equal((await adminRoute.POST(post('http://x/api/admin/academy', { action: 'grant' }))).status, 404);
  assert.ok(fetchCalls > before, 'the real guard asked platform_admins (and the stubbed network refused)');
});

await ok('admin guard: the page and the route call requirePlatformAdmin before any read or write', () => {
  const page = readFileSync('app/dashboard/admin/academy/page.tsx', 'utf8');
  assert.ok(page.indexOf('requirePlatformAdmin()') > 0 && page.indexOf('requirePlatformAdmin()') < page.indexOf('loadAdminOverview(createAdminClient()'));
  const route = readFileSync('app/api/admin/academy/route.ts', 'utf8');
  assert.ok(route.indexOf('requirePlatformAdmin()') > 0 && route.indexOf('requirePlatformAdmin()') < route.indexOf('runAdminAction('));
  assert.match(route, /if \(!admin\.ok\) return notFound\(\);/);
});

await ok('admin: grant by booking-page name, idempotent, revoke keeps the row, re-grant reopens it', async () => {
  const db = world();
  const D = db as unknown as Db;
  const g = await runAdminAction(D, { action: 'grant', course_id: C2, tenant: 'dana', source: 'gift', note: 'בטא' }, U1, new Date('2026-11-11T10:00:00Z'));
  assert.equal(g.status, 200);
  await runAdminAction(D, { action: 'grant', course_id: C2, tenant: T1, source: 'gift' }, U1);
  const rows = () => db.tables.academy_course_access.filter((r) => r.tenant_id === T1 && r.course_id === C2);
  assert.equal(rows().length, 1);
  assert.equal((await loadCourse(D, viewer, false, 'google-business') as any).view?.course.id, C2);
  assert.equal((await runAdminAction(D, { action: 'revoke', course_id: C2, tenant: T1, source: 'gift' }, U1)).status, 200);
  assert.equal(rows().length, 1, 'never deleted');
  assert.ok(rows()[0].revoked_at);
  assert.equal((await loadCourse(D, viewer, false, 'google-business') as any).view, null);
  await runAdminAction(D, { action: 'grant', course_id: C2, tenant: T1, source: 'gift' }, U1);
  assert.equal(rows()[0].revoked_at, null);
});

await ok("admin: 'purchase' and 'premium' cannot be granted by hand, and an unknown business is refused", async () => {
  const D = world() as unknown as Db;
  for (const source of ['purchase', 'premium', 'free']) assert.equal((await runAdminAction(D, { action: 'grant', course_id: C1, tenant: T1, source }, U1)).status, 400, source);
  assert.equal((await runAdminAction(D, { action: 'grant', course_id: C1, tenant: 'nobody', source: 'gift' }, U1)).status, 400);
  assert.equal((await runAdminAction(D, { action: 'delete-course', id: C1 }, U1)).status, 400, 'there is no delete');
});

await ok('admin: save a course and a lesson; a bad video link is refused; completion counts per business', async () => {
  const db = world();
  const D = db as unknown as Db;
  const c = await runAdminAction(D, { action: 'save-course', slug: 'new-course', title: 'קורס חדש', published: false }, U1);
  assert.equal(c.status, 200);
  assert.equal((await runAdminAction(D, { action: 'save-course', slug: 'new-course', title: 'שוב' }, U1)).status, 400, 'duplicate slug');
  const id = c.body.id as string;
  assert.equal((await runAdminAction(D, { action: 'save-lesson', course_id: C1, slug: 'x', title: 'x', video_url: 'https://evil.com/a' }, U1)).status, 400);
  assert.equal((await runAdminAction(D, { action: 'save-lesson', course_id: C1, slug: 'x', title: 'x', video_url: 'https://vimeo.com/123456789' }, U1)).status, 200);
  assert.ok(id);
  await markLessonDone(D, viewer, L(1));
  await markLessonDone(D, viewer, L(2));
  await markLessonDone(D, { tenantId: T1, userId: 'second-user' }, L(1));
  const o = await loadAdminOverview(D);
  assert.ok(o.ok);
  const s = o.data.courses.find((x) => x.id === C1)!.stats;
  assert.equal(s.grantees, 1);
  assert.equal(s.perLesson[L(1)], 1, 'one business, however many users');
  // the new lesson 'x' was saved unpublished (a draft), so T1 has still finished the course
  assert.equal(s.completed, 1);
  assert.equal(o.data.grants.find((g) => g.tenant_id === T1)!.business, 'הסטודיו של דנה');
  assert.deepEqual(courseStats([], [], [], []), []);
});

// ── 7. nothing purchasable is rendered ──────────────────────────────────────────────────────────────────────────────────────────

const SELLING = /₪|מחיר|לרכישה|לרכוש|קני |קנייה|רכישה|בקרוב|שדרוג|פרימיום|Premium|price|290/;

await ok('screens: catalog, course, lesson and certificate show no price, no buy, no "בקרוב"', async () => {
  const V = await importApp('app/dashboard/academy/AcademyViews.tsx');
  const D = world() as unknown as Db;
  const cat = await loadCatalog(D, viewer, false);
  assert.ok(cat.ok);
  const catHtml = renderApp(V.CatalogView, { items: cat.items, isAdmin: false });
  assert.doesNotMatch(catHtml, SELLING);
  assert.ok(catHtml.includes('קורס paid-social'));
  assert.ok(!catHtml.includes('קורס google-business'), 'a course she cannot open is not listed at all');
  assert.equal((catHtml.match(/data-testid="academy-course"/g) || []).length, 1);
  assert.ok(!catHtml.includes('טיוטה'));

  const cv = await loadCourse(D, viewer, false, 'paid-social');
  assert.ok(cv.ok && cv.view);
  const courseHtml = renderApp(V.CourseView, { view: cv.view, isAdmin: false });
  assert.doesNotMatch(courseHtml, SELLING);
  assert.equal((courseHtml.match(/data-testid="academy-lesson"/g) || []).length, 2);
  assert.ok(courseHtml.includes('0 מתוך 2 שיעורים'));

  const lessonHtml = renderApp(V.LessonView, { view: cv.view, lesson: cv.view.lessons[0], isAdmin: false });
  assert.doesNotMatch(lessonHtml, SELLING);
  assert.ok(lessonHtml.includes('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&amp;modestbranding=1"'));
  assert.ok(lessonHtml.includes('סיימתי'));
  assert.ok(lessonHtml.includes('המשימה שלך'));
  assert.ok(lessonHtml.includes('role="progressbar"'));

  const evil = renderApp(V.LessonView, { view: cv.view, lesson: { ...cv.view.lessons[0], video_url: 'https://evil.com/x' }, isAdmin: false });
  assert.ok(!evil.includes('<iframe'), 'a link outside the allowlist renders no frame at all');

  const cert = renderApp(V.CertificateView, { cert: { name: 'דנה כהן', business: 'הסטודיו של דנה', course: 'קורס', completedAt: '2026-11-11T09:30:00Z' } });
  assert.doesNotMatch(cert, SELLING);
  assert.ok(cert.includes('תעודת סיום') && cert.includes('דנה כהן') && cert.includes('הסטודיו של דנה') && cert.includes('11.11.2026'));

  const empty = renderApp(V.CatalogView, { items: [], isAdmin: false });
  assert.doesNotMatch(empty, SELLING);
});

await ok('no screen or admin form reads or offers a price; no em dash in the copy', () => {
  for (const f of ['app/dashboard/academy/AcademyViews.tsx', 'app/dashboard/academy/FinishButton.tsx', 'app/AcademyNavEntry.jsx', 'app/dashboard/admin/academy/AcademyAdminClient.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/price_ils/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${f} reads price_ils`);
    assert.ok(!src.includes('—'), `${f} has an em dash`);
  }
});

globalThis.fetch = realFetch;
console.log(`\n${n} checks passed`);
