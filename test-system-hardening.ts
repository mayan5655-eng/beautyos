// System hardening (2026-10-20): cron heartbeat, plan vs billing, money without a document, the paged schema read, the push
// channel for critical alerts, and the encryption key rotation.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_JOBS, CRON_JOB_HE, staleCronJobs, markCronRun } from './lib/cronHeartbeat.js';
import { planBillingMismatches, readSchemaObjects } from './lib/invariants.js';
import { raiseOpsAlert } from './lib/opsAlert.js';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

await ok('every vercel.json cron is a known job, and every job is scheduled', () => {
  // A path may appear twice (the Saturday-night runs, lib/shabbat.js): each JOB is still listed once.
  const crons = [...new Set((JSON.parse(rd('vercel.json')).crons as Array<{ path: string }>).map((c) => c.path))].sort();
  const jobs = Object.values(CRON_JOBS).map((j) => j.path).sort();
  assert.deepEqual(jobs, crons);
  for (const job of Object.keys(CRON_JOBS)) assert.ok((CRON_JOB_HE as Record<string, string>)[job], `Hebrew name for ${job}`);
});

await ok('every cron route stamps its run right after the auth check, with its own job name', () => {
  for (const [job, { path }] of Object.entries(CRON_JOBS)) {
    const dir = join('app', ...path.split('/').filter(Boolean));
    const file = readdirSync(dir).find((f) => /^route\.(js|ts)$/.test(f));
    assert.ok(file, path);
    const src = rd(join(dir, file!));
    const auth = src.indexOf('isAuthorizedCron(request)) return cronUnauthorized()');
    const mark = src.indexOf(`markCronRun('${job}')`);
    assert.ok(auth > 0 && mark > auth, `${path}: markCronRun('${job}') after the auth check`);
  }
});

await ok('stale jobs: older than the allowed gap, or never stamped', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const h = (x: number) => new Date(now.getTime() - x * 3600_000).toISOString();
  const rows = Object.keys(CRON_JOBS).map((job) => ({ job, last_run_at: h(1) }));
  assert.deepEqual(staleCronJobs(rows, now), []);
  const late = rows.map((r) => (r.job === 'billing-charge-due' ? { ...r, last_run_at: h(30) } : r.job === 'grow-release-holds' ? { ...r, last_run_at: h(2) } : r));
  assert.deepEqual(staleCronJobs(late, now).map((s) => s.job).sort(), ['billing-charge-due', 'grow-release-holds']);
  assert.ok(staleCronJobs(rows.filter((r) => r.job !== 'invariants'), now).some((s) => s.job === 'invariants' && s.lastRunAt === null));
});

await ok('markCronRun never throws and ignores unknown jobs', async () => {
  assert.deepEqual(await markCronRun('nope'), { ok: false, reason: 'unknown-job' });
  const broken = { from: () => ({ upsert: async () => { throw new Error('down'); } }) };
  assert.equal((await markCronRun('invariants', broken)).ok, false);
  const missing = { from: () => ({ upsert: async () => ({ error: { code: 'PGRST205', message: 'cron_runs' } }) }) };
  assert.equal((await markCronRun('invariants', missing)).ok, false);
  const rows: unknown[] = [];
  const fine = { from: (t: string) => ({ upsert: async (row: unknown) => { rows.push([t, row]); return { error: null }; } }) };
  assert.equal((await markCronRun('invariants', fine, new Date('2026-10-20T01:00:00Z'))).ok, true);
  assert.deepEqual(rows, [['cron_runs', { job: 'invariants', last_run_at: '2026-10-20T01:00:00.000Z' }]]);
});

await ok('plan vs billing: only clear contradictions', () => {
  const subs = [
    { tenant_id: 'a', status: 'active' }, { tenant_id: 'b', status: 'active' }, { tenant_id: 'c', status: 'canceled' },
    { tenant_id: 'd', status: 'past_due' }, { tenant_id: 'e', status: 'trialing' }, { tenant_id: 'f', status: 'canceled' },
  ];
  const plan = new Map<string, string | null>([['a', 'active'], ['b', 'paused'], ['c', 'active'], ['d', 'expired'], ['e', 'expired'], ['f', 'paused']]);
  assert.deepEqual(planBillingMismatches(subs, plan).map((m) => m.tenantId), ['b', 'c', 'e']);
});

await ok('schema_objects is read in pages until a short page, in a stable order', async () => {
  const all = Array.from({ length: 2345 }, (_, i) => ({ kind: 'column', name: `t.c${i}` }));
  const calls: Array<[number, number]> = [];
  const builder = (from = 0, to = 0) => {
    const b = {
      order: () => b,
      range: (f: number, t: number) => { calls.push([f, t]); return Promise.resolve({ data: all.slice(f, t + 1), error: null }); },
    };
    return b;
  };
  const db = { rpc: () => builder() };
  const out = await readSchemaObjects(db);
  assert.equal(out.length, 2345);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.match(rd('lib/invariants.js'), /const data = await readSchemaObjects\(db\);/);
});

await ok('critical alerts also go to her devices by push; info and warning do not', async () => {
  const db = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }), update: () => ({ eq: async () => ({}) }) }) };
  const pushes: unknown[] = [];
  const push = async (p: unknown) => { pushes.push(p); };
  const e = await raiseOpsAlert({ db, source: 'invariants', severity: 'error', message: 'וואטסאפ לא מחובר', push });
  assert.equal(e.pushed, true);
  await raiseOpsAlert({ db, source: 'owner-digest', severity: 'info', message: 'סיכום', push });
  await raiseOpsAlert({ db, source: 'x', severity: 'warning', message: 'אזהרה', push });
  assert.equal(pushes.length, 1);
  assert.match(JSON.stringify(pushes[0]), /וואטסאפ לא מחובר/);
  // a push that throws or hangs never breaks the alert
  const r = await raiseOpsAlert({ db, source: 'x', severity: 'error', message: 'm', push: async () => { throw new Error('no'); }, timeoutMs: 50 });
  assert.equal(r.pushed, false);
  const hang = await raiseOpsAlert({ db, source: 'x', severity: 'error', message: 'm', push: () => new Promise(() => {}), timeoutMs: 50 });
  assert.equal(hang.pushed, false);
  assert.match(rd('app/api/invariants/route.js'), /push: opsPush\(admin\)/);
});

await ok('encryption key rotation: new key seals, the previous key still opens old values, a wrong key still fails', async () => {
  const OLD = 'a'.repeat(64), NEW = 'b'.repeat(64), OTHER = 'c'.repeat(64);
  process.env.TOKEN_ENCRYPTION_KEY = OLD;
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  const { encryptToken, decryptToken } = await import('./lib/facebook/encryption.ts');
  const sealedOld = encryptToken('grow-merchant-key');
  process.env.TOKEN_ENCRYPTION_KEY = NEW;
  assert.throws(() => decryptToken(sealedOld), 'without _PREVIOUS the old value does not open');
  process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = OLD;
  assert.equal(decryptToken(sealedOld), 'grow-merchant-key');
  const sealedNew = encryptToken('fresh');
  assert.equal(decryptToken(sealedNew), 'fresh');
  process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = OTHER;
  assert.throws(() => decryptToken(sealedOld), 'a wrong previous key does not open it');
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
});

await ok('the health board is read-only and only on the gated admin page', () => {
  const h = rd('app/dashboard/admin/SystemHealth.tsx');
  assert.doesNotMatch(h, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(h, /'use client'|"use client"/);
  const p = rd('app/dashboard/admin/page.tsx');
  assert.ok(p.indexOf('requirePlatformAdmin()') < p.indexOf('<SystemHealth db={db} />'));
  const sql = rd('supabase/migrations/add_cron_runs.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.cron_runs from anon, authenticated/);
});

await ok('the app says which account she is signed in to, where she signs out', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /setAuthEmail\(user\.email \|\| ""\)/);
  assert.match(a, /את מחוברת כ-\$\{authEmail\}/);
});

console.log(`${n} passed`);
void statSync;
