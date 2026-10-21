// Stage 2 of the content plan (2026-10-21): the Meta publisher, run against an in-memory database and a fake Graph API.
// Nothing here reaches Meta or a database. Pins: a job is claimed once, "published" only after Meta returns an id, the
// Instagram container is stored before media_publish (no double post on a crash), retries only for rate limit / Meta
// down, a blocked business is paused, an un-approved post is cancelled, and she is told either way.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyGraphError, publishAbility, igCaption, PUBLISH_ERROR_HE } from './lib/content/metaPublish.ts';
import { runDue, enqueueApproved, cancelJobs, rescheduleJobs, MAX_ATTEMPTS } from './lib/content/publisher.ts';
import { contentPublishVisible } from './lib/featureFlags.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let n = 0;
const ok = async (name: string, fn: () => unknown) => { await fn(); n++; console.log('ok -', name); };

// ── a tiny in-memory stand-in for the supabase-js query builder (only what the publisher uses) ─────────────────
type Row = Record<string, any>;
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let uid = 0;
  const from = (table: string) => {
    tables[table] ||= [];
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    let head = false;
    let lim = Infinity;
    let wantRows = false;
    const q: any = {
      select(_c?: string, o?: { head?: boolean }) { if (op === 'select') head = !!o?.head; else wantRows = true; return q; },
      eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q; },
      neq(k: string, v: unknown) { filters.push((r) => r[k] !== v); return q; },
      in(k: string, v: unknown[]) { filters.push((r) => v.includes(r[k])); return q; },
      lte(k: string, v: string) { filters.push((r) => r[k] <= v); return q; },
      lt(k: string, v: string) { filters.push((r) => r[k] !== null && r[k] !== undefined && r[k] < v); return q; },
      gte(k: string, v: string) { filters.push((r) => r[k] >= v); return q; },
      is(k: string, v: unknown) { filters.push((r) => (r[k] ?? null) === v); return q; },
      or(expr: string) {
        // only the publisher's claim: state.eq.queued,and(state.in.(claimed,container_created),locked_until.lt.<iso>)
        const at = expr.match(/locked_until\.lt\.(.+)\)$/)?.[1] || '';
        filters.push((r) => r.state === 'queued' || (['claimed', 'container_created'].includes(r.state) && r.locked_until && r.locked_until < at));
        return q;
      },
      order() { return q; },
      limit(k: number) { lim = k; return q; },
      update(p: Row) { op = 'update'; patch = p; return q; },
      insert(p: Row | Row[]) { op = 'insert'; inserted = Array.isArray(p) ? p : [p]; return q; },
      maybeSingle() { return run().then((r: any) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data })); },
      single() { return q.maybeSingle(); },
      then(res: any, rej: any) { return run().then(res, rej); },
    };
    const match = () => tables[table].filter((r) => filters.every((f) => f(r)));
    async function run() {
      if (op === 'insert') {
        for (const r of inserted) {
          if (table === 'publish_jobs' && tables[table].some((x) => x.idempotency_key === r.idempotency_key)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          tables[table].push({ id: r.id || `${table}-${++uid}`, attempts: 0, container_id: null, locked_until: null, ...r });
        }
        return { data: inserted, error: null };
      }
      if (op === 'update') {
        const rows = match();
        for (const r of rows) Object.assign(r, patch);
        return { data: wantRows ? rows.map((r) => ({ ...r })) : null, error: null };
      }
      const rows = match().slice(0, lim);
      return head ? { data: null, count: rows.length, error: null } : { data: rows.map((r) => ({ ...r })), error: null };
    }
    return q;
  };
  return { from, tables };
}

// ── a fake Graph API ─────────────────────────────────────────────────────────────────────────────────────────
function fakeMeta(script: Record<string, Array<{ status?: number; body: unknown }>>) {
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const key = `${init?.method || 'GET'} ${u.pathname.replace(/^\/v\d+\.\d+\//, '')}`;
    calls.push(key);
    const list = script[key] || [];
    const next = list.length > 1 ? list.shift()! : list[0];
    if (!next) return new Response(JSON.stringify({ error: { message: 'unexpected ' + key, code: 1 } }), { status: 500 });
    return new Response(JSON.stringify(next.body), { status: next.status || 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const T = 'ten-1';
const NOW = new Date('2026-10-22T16:01:00Z');
const base = () => ({
  facebook_pages: [{ tenant_id: T, page_id: '111', page_access_token_encrypted: 'sealed', instagram_business_id: '999', granted_scopes: 'pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish', publish_enabled: true, is_active: true }],
  content_items: [{ id: 'item-1', tenant_id: T, status: 'approved', media_path: `${T}/content/item-1_1.png` }],
  content_item_platforms: [
    { id: 'pl-ig', item_id: 'item-1', platform: 'instagram', caption: 'טקסט לאינסטגרם', hashtags: ['#עור'] },
    { id: 'pl-fb', item_id: 'item-1', platform: 'facebook', caption: 'טקסט לפייסבוק', hashtags: [] },
  ],
  publish_jobs: [] as Row[],
  publish_events: [] as Row[],
});
const deps = (db: any, meta: ReturnType<typeof fakeMeta>, extra: Partial<Parameters<typeof runDue>[0]> = {}) => {
  const notes: Array<{ title: string; body: string }> = [];
  return {
    notes,
    d: {
      db, now: () => NOW, fetchImpl: meta.f, waitMs: 0,
      decrypt: (s: string) => (s === 'sealed' ? 'PAGE-TOKEN' : (() => { throw new Error('bad'); })()),
      signUrl: async (p: string) => `https://storage.test/signed/${p}`,
      notify: async (o: { title: string; body: string }) => { notes.push(o); },
      isBlocked: async () => false,
      isDemo: () => false,
      ...extra,
    },
  };
};

await ok('Graph errors are classified: token, permission, rate limit, media, Meta down', () => {
  assert.equal(classifyGraphError(400, { code: 190 }).errorClass, 'token_expired');
  assert.equal(classifyGraphError(403, { code: 200 }).errorClass, 'permission_missing');
  assert.equal(classifyGraphError(400, { code: 4 }).retryable, true);
  assert.equal(classifyGraphError(400, { code: 9004, message: 'media' }).errorClass, 'media_rejected');
  assert.equal(classifyGraphError(503, { message: 'x' }).errorClass, 'platform_down');
  for (const v of Object.values(PUBLISH_ERROR_HE)) assert.match(v, /[א-ת]/);
});

await ok('what a Page can publish to comes from what she granted; Instagram needs a linked account', () => {
  assert.deepEqual(publishAbility({ granted_scopes: 'pages_manage_posts', instagram_business_id: '9' }), { facebook: true, instagram: false });
  assert.deepEqual(publishAbility({ granted_scopes: 'pages_manage_posts,instagram_basic,instagram_content_publish', instagram_business_id: null }), { facebook: true, instagram: false });
  assert.deepEqual(publishAbility(null), { facebook: false, instagram: false });
  assert.equal(igCaption('שלום', ['#a', '#b']), 'שלום\n\n#a #b');
});

await ok('approving queues one job per platform at the post time; again is not a second job; undo cancels; moving moves', async () => {
  const db = fakeDb(base());
  const r = await enqueueApproved(db, { tenantId: T, itemId: 'item-1', plannedFor: '2026-10-22T16:00:00.000Z', approvedAt: 'a1', mediaPath: 'x.png' });
  assert.deepEqual(r.queued.sort(), ['facebook', 'instagram']);
  assert.equal(db.tables.publish_jobs.length, 2);
  await enqueueApproved(db, { tenantId: T, itemId: 'item-1', plannedFor: '2026-10-22T16:00:00.000Z', approvedAt: 'a1', mediaPath: 'x.png' });
  assert.equal(db.tables.publish_jobs.length, 2, 'idempotent');
  await rescheduleJobs(db, 'item-1', '2026-10-23T16:00:00.000Z');
  assert.ok(db.tables.publish_jobs.every((j) => j.run_at === '2026-10-23T16:00:00.000Z'));
  await cancelJobs(db, 'item-1', 'status planned');
  assert.ok(db.tables.publish_jobs.every((j) => j.state === 'cancelled'));
  // no picture / no permission: nothing queued, with the reason
  assert.equal((await enqueueApproved(fakeDb(base()), { tenantId: T, itemId: 'item-1', plannedFor: 'x', approvedAt: 'b', mediaPath: null })).reason, 'no-media');
  const noPerm = base(); noPerm.facebook_pages[0].granted_scopes = 'pages_show_list';
  assert.equal((await enqueueApproved(fakeDb(noPerm), { tenantId: T, itemId: 'item-1', plannedFor: 'x', approvedAt: 'b', mediaPath: 'x' })).reason, 'no-permission');
});

const queuedJobs = () => [
  { id: 'job-fb', tenant_id: T, item_id: 'item-1', item_platform_id: 'pl-fb', platform: 'facebook', page_id: '111', run_at: '2026-10-22T16:00:00.000Z', state: 'queued', attempts: 0, container_id: null, idempotency_key: 'k1' },
  { id: 'job-ig', tenant_id: T, item_id: 'item-1', item_platform_id: 'pl-ig', platform: 'instagram', page_id: '111', run_at: '2026-10-22T16:00:00.000Z', state: 'queued', attempts: 0, container_id: null, idempotency_key: 'k2' },
];

await ok('due jobs publish: Facebook photo, Instagram container then publish; the post becomes "posted"; she is told', async () => {
  const seed = base(); seed.publish_jobs = queuedJobs();
  const db = fakeDb(seed);
  const meta = fakeMeta({
    'POST 111/photos': [{ body: { id: 'ph1', post_id: '111_555' } }],
    'POST 999/media': [{ body: { id: 'cont-1' } }],
    'GET cont-1': [{ body: { status_code: 'FINISHED' } }],
    'POST 999/media_publish': [{ body: { id: 'm-1' } }],
    'GET m-1': [{ body: { permalink: 'https://www.instagram.com/p/abc/' } }],
  });
  const { d, notes } = deps(db, meta);
  const r = await runDue(d);
  assert.equal(r.published, 2);
  const fb = db.tables.publish_jobs.find((j) => j.id === 'job-fb')!;
  const ig = db.tables.publish_jobs.find((j) => j.id === 'job-ig')!;
  assert.equal(fb.state, 'published'); assert.equal(fb.external_url, 'https://www.facebook.com/111_555');
  assert.equal(ig.state, 'published'); assert.equal(ig.container_id, 'cont-1'); assert.equal(ig.external_url, 'https://www.instagram.com/p/abc/');
  assert.equal(db.tables.content_items[0].status, 'posted');
  assert.equal(db.tables.content_item_platforms.find((p) => p.id === 'pl-ig')!.external_url, 'https://www.instagram.com/p/abc/');
  assert.deepEqual(notes.map((x) => x.title).sort(), ['הפוסט פורסם באינסטגרם', 'הפוסט פורסם בפייסבוק']);
  assert.ok(meta.calls.indexOf('POST 999/media') < meta.calls.indexOf('POST 999/media_publish'));
  // a second run finds nothing to do: claimed once
  const again = await runDue(d);
  assert.equal(again.due, 0);
});

await ok('a crash after the container: the next run reuses it, never a second container', async () => {
  const seed = base(); seed.publish_jobs = [{ ...queuedJobs()[1], state: 'container_created', container_id: 'cont-7', locked_until: '2026-10-22T15:00:00.000Z' }];
  const db = fakeDb(seed);
  const meta = fakeMeta({ 'GET cont-7': [{ body: { status_code: 'FINISHED' } }], 'POST 999/media_publish': [{ body: { id: 'm-7' } }], 'GET m-7': [{ body: {} }] });
  await runDue(deps(db, meta).d);
  assert.equal(meta.calls.filter((c) => c === 'POST 999/media').length, 0);
  assert.equal(db.tables.publish_jobs[0].state, 'published');
});

await ok('rate limit / Meta down: back to the queue, later; after the last attempt it fails and she gets the reason', async () => {
  const seed = base(); seed.publish_jobs = [queuedJobs()[0]];
  const db = fakeDb(seed);
  const meta = fakeMeta({ 'POST 111/photos': [{ status: 400, body: { error: { code: 4, message: 'too many calls' } } }] });
  const { d, notes } = deps(db, meta);
  const r1 = await runDue(d);
  assert.equal(r1.retried, 1);
  const j = db.tables.publish_jobs[0];
  assert.equal(j.state, 'queued'); assert.ok(j.run_at > NOW.toISOString(), 'later');
  j.attempts = MAX_ATTEMPTS - 1; j.run_at = '2026-10-22T16:00:00.000Z';
  const r2 = await runDue(d);
  assert.equal(r2.failed, 1);
  assert.equal(j.state, 'failed'); assert.equal(j.error_class, 'rate_limited');
  assert.equal(notes.at(-1)!.title, 'הפוסט לא פורסם בפייסבוק');
});

await ok('an expired token fails at once (no retry) with the reconnect message', async () => {
  const seed = base(); seed.publish_jobs = [queuedJobs()[0]];
  const db = fakeDb(seed);
  const { d, notes } = deps(db, fakeMeta({ 'POST 111/photos': [{ status: 400, body: { error: { code: 190, message: 'expired' } } }] }));
  await runDue(d);
  assert.equal(db.tables.publish_jobs[0].state, 'failed');
  assert.equal(notes[0].body, PUBLISH_ERROR_HE.token_expired);
});

await ok('on hold -> paused (not lost); no longer approved -> cancelled; demo -> cancelled; nothing reaches Meta', async () => {
  for (const [setup, expect] of [
    [(x: any) => ({ isBlocked: async () => true }), 'paused'],
    [(x: any) => { x.content_items[0].status = 'planned'; return {}; }, 'cancelled'],
    [(x: any) => ({ isDemo: () => true }), 'cancelled'],
  ] as const) {
    const seed = base(); seed.publish_jobs = [queuedJobs()[0]];
    const extra = setup(seed);
    const db = fakeDb(seed);
    const meta = fakeMeta({});
    await runDue(deps(db, meta, extra as never).d);
    assert.equal(db.tables.publish_jobs[0].state, expect);
    assert.equal(meta.calls.length, 0);
  }
});

await ok('routes and the cron: flag-gated, her tenant only, cron secret, fails closed on plan state; scopes only on ?publish=1', () => {
  assert.equal(contentPublishVisible({ automations: { feature_flags: { content_publish_meta: true } } } as never), false, 'needs content_plan too');
  assert.equal(contentPublishVisible({ automations: { feature_flags: { content_plan: true, content_publish_meta: true } } } as never), true);
  const cron = strip(rd('app/api/content/publish-due/route.ts'));
  assert.match(cron, /isAuthorizedCron\(request\)/);
  assert.match(cron, /if \(error \|\| !data\) return true;/); // unreadable plan state = do not publish
  assert.match(cron, /isDemo: isDemoTenantId/);
  const vercel = JSON.parse(rd('vercel.json')).crons as Array<{ path: string; schedule: string }>;
  assert.ok(vercel.some((c) => c.path === '/api/content/publish-due' && c.schedule === '*/5 * * * *'));
  const items = strip(rd('app/api/content/items/route.ts'));
  assert.ok(items.indexOf("from('content_items').select('id, tenant_id") < items.indexOf('enqueueApproved('), 'her session reads the post first');
  assert.match(items, /contentPublishVisible\(/);
  assert.match(items, /b\.media_path\.startsWith\(`\$\{cur\.data\.tenant_id\}\/content\/\$\{id\}_`\)/);
  const plan = strip(rd('app/api/content/plan/route.ts'));
  assert.match(plan, /\.eq\('tenant_id', s\.tenantId\)\.eq\('page_id', pageId\)/);
  const start = rd('app/api/facebook/oauth/start/route.ts');
  assert.match(start, /scopesFor\(request\.nextUrl\.searchParams\.get\('publish'\) === '1'\)/);
  assert.match(start, /if \(!publish\) return FACEBOOK_SCOPES;/);
  const sql = rd('supabase/migrations/add_publish_jobs.sql');
  assert.match(sql, /idempotency_key  text not null unique/);
  assert.match(sql, /grant select on public\.publish_jobs to authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|all)[^;]*to authenticated/);
});

console.log(`${n} passed`);
