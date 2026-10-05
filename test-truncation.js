// test-truncation.js
//
// Row 1,001 must count. PostgREST silently returns at most 1,000 rows per read
// (max_rows), so every job that read a whole table was correct up to 1,000 rows
// and wrong after - with no error to say so. These tests seed PAST the cap,
// through a fake that enforces it (testkit/capDb.js), and assert the answers
// that matter are still right:
//
//   * winback never tells a client who visited recently that she has not been
//     seen in a while, and never misses one who really lapsed;
//   * a package finished by a client whose row sits past row 1,000 is found;
//   * the nightly invariants find drift that sits past row 1,000 instead of
//     reporting healthy on a partial look;
//   * the paging helper itself: any max_rows setting, a failed page, a read
//     bigger than its ceiling (reported, never guessed).
//
// Run with plain node. Each section fails on the pre-paging code.
import { makeCapDb } from './testkit/capDb.js';
import { readAllRows } from './lib/pagedRead.js';
import { runSmartReminders, dateNDaysAgo } from './lib/reminders/smartReminders.js';
import { runInvariants } from './lib/invariants.js';
import fs from 'node:fs';

let passed = 0, failed = 0;
const ok = (label, cond, extra = '') => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label} ${extra}`); } };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
const group = (n) => console.log(`\n── ${n}`);

const NOW = new Date('2026-10-05T12:00:00Z');
const day = (n) => dateNDaysAgo(n, NOW);
const pad = (n) => String(n).padStart(6, '0');

// ── the paging helper ──────────────────────────────────────────────────────
group('readAllRows');
{
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: pad(i), n: i }));
  const r = await readAllRows(makeCapDb({ t: rows }), 't');
  eq('2,500 rows through a 1,000-row cap: all of them', r.data.length, 2500);
  ok('reported complete', r.complete === true && r.total === 2500 && !r.truncated);
  ok('in order, none missing or repeated', r.data.every((x, i) => x.n === i));
}
{
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: pad(i) }));
  const r = await readAllRows(makeCapDb({ t: rows }, { maxRows: 300 }), 't');
  eq('a lower max_rows (300) still reads everything', r.data.length, 2500);
  ok('...and says complete', r.complete);
}
{
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: pad(i) }));
  const r = await readAllRows(makeCapDb({ t: rows }), 't');
  eq('exactly 1,000 rows: all of them', r.data.length, 1000);
  ok('...complete', r.complete);
  const r1001 = await readAllRows(makeCapDb({ t: [...rows, { id: pad(1000) }] }), 't');
  eq('1,001 rows: row 1,001 is there', r1001.data.length, 1001);
}
{
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: pad(i) }));
  const empty = await readAllRows(makeCapDb({ t: [] }), 't');
  ok('an empty table is a complete, empty read', empty.complete && empty.data.length === 0 && empty.total === 0);
  const small = await readAllRows(makeCapDb({ t: rows }), 't');
  ok('under the cap needs one request', small.complete && small.data.length === 500);
}
{
  const rows = Array.from({ length: 3200 }, (_, i) => ({ id: pad(i) }));
  const r = await readAllRows(makeCapDb({ t: rows }), 't', { ceiling: 2000 });
  ok('past its ceiling it STOPS and says so', r.truncated === true && r.complete === false);
  eq('...reporting the real total, not what it fetched', r.total, 3200);
  ok('...and hands back what it has, labelled', r.data.length >= 2000 && r.data.length < 3200);
}
{
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: pad(i) }));
  const r = await readAllRows(makeCapDb({ t: rows }, { failPage: (from) => from === 1000 }), 't');
  ok('a failed page fails the whole read', r.error && r.data === null && r.complete === false);
}
{
  const rows = [...Array.from({ length: 1800 }, (_, i) => ({ id: pad(i), tenant_id: i < 1500 ? 'A' : 'B' }))];
  const r = await readAllRows(makeCapDb({ t: rows }), 't', { filter: (q) => q.eq('tenant_id', 'A') });
  eq('a filter applies to every page', r.data.length, 1500);
}

// ── winback: a recent visit past row 1,000 must still be seen ──────────────
group('winback past 1,000 appointments');
{
  const T = 'tenant-1';
  const clients = Array.from({ length: 1500 }, (_, i) => ({ id: `c${pad(i)}`, name: `Client ${i}`, phone: `0501${pad(i)}`, tenant_id: T, birthday: null }));
  // 1,500 appointments, one per client, all long ago and all in an already-
  // reminded state (the log below, which leaves out X and Y), so only the two
  // clients under test can produce a message.
  const appointments = clients.map((c, i) => ({ id: `a${pad(i)}`, client_id: c.id, date: day(200), tenant_id: T, confirmation_status: 'confirmed' }));
  // X: first appointment long ago (early rows), second one YESTERDAY at row 1,401.
  const X = clients[5];
  appointments.push({ id: 'a-x-recent', client_id: X.id, date: day(1), tenant_id: T, confirmation_status: 'confirmed' });
  // Y: a real lapse whose ONLY appointment is at row 1,200 (past the cap).
  const Y = clients[1200];
  appointments[1200] = { ...appointments[1200], date: day(120) };
  const log = clients.filter((c) => c.id !== Y.id && c.id !== X.id).map((c) => ({ tenant_id: T, client_id: c.id, reminder_type: 'winback', reference_id: day(200) }));
  const db = makeCapDb({ settings: [{ tenant_id: T, business_name: 'Studio' }], clients, appointments, packages: [], auto_reminders_log: log });
  const sent = [];
  const { stats } = await runSmartReminders({
    db, now: NOW, send: async (phone, msg, o) => { sent.push({ phone, msg, o }); return { ok: true }; },
    caps: { perRun: 5000, perTenant: 5000 },
  });
  const to = (c) => sent.some((s) => s.phone === c.phone);
  ok('X visited yesterday (her row is past 1,000): NOT told she has been away', !to(X));
  ok('Y really lapsed (her only visit is past 1,000): IS reminded', to(Y));
  eq('nothing else was sent', sent.length, 1);
  ok('the run reports every read as complete', !stats.incomplete || stats.incomplete.length === 0);
}

// ── a read that cannot be completed must stop the sends, not guess ──────────
group('winback refuses to act on a read it could not finish');
{
  const T = 'tenant-1';
  const clients = Array.from({ length: 30 }, (_, i) => ({ id: `c${pad(i)}`, name: `C${i}`, phone: `0502${pad(i)}`, tenant_id: T, birthday: null }));
  const appointments = clients.map((c, i) => ({ id: `a${pad(i)}`, client_id: c.id, date: day(200), tenant_id: T, confirmation_status: 'confirmed' }));
  const db = makeCapDb({ settings: [{ tenant_id: T, business_name: 'S' }], clients, appointments, packages: [], auto_reminders_log: [] }, { failPage: (from) => from >= 0 && false });
  const sent = [];
  const out = await runSmartReminders({ db, now: NOW, send: async (p) => { sent.push(p); return { ok: true }; }, readCeiling: 10 });
  eq('with the appointments read over its ceiling, no winback goes out', sent.length, 0);
  ok('...and the run says which read was incomplete', (out.stats.incomplete || []).includes('appointments'));
}

// ── package finished, client past row 1,000 ────────────────────────────────
group('package-done past 1,000 clients');
{
  const T = 'tenant-1';
  const clients = Array.from({ length: 1300 }, (_, i) => ({ id: `c${pad(i)}`, name: `C${i}`, phone: `0503${pad(i)}`, tenant_id: T, birthday: null }));
  const appointments = clients.map((c, i) => ({ id: `a${pad(i)}`, client_id: c.id, date: day(5), tenant_id: T, confirmation_status: 'confirmed' }));
  const packages = [{ id: 'p1', client_id: clients[1250].id, service: 'laser', total_sessions: 6, used_sessions: 6, active: true, tenant_id: T }];
  const db = makeCapDb({ settings: [{ tenant_id: T, business_name: 'S' }], clients, appointments, packages, auto_reminders_log: [] });
  const sent = [];
  await runSmartReminders({ db, now: NOW, send: async (phone, msg) => { sent.push({ phone, msg }); return { ok: true }; }, caps: { perRun: 5000, perTenant: 5000 } });
  ok('the client at row 1,251 who finished her package is reminded', sent.some((s) => s.phone === clients[1250].phone && s.msg.includes('laser')));
}

// ── invariants: drift past row 1,000 ───────────────────────────────────────
group('invariants past 1,000 rows');
{
  const packages = Array.from({ length: 1400 }, (_, i) => ({ id: `p${pad(i)}`, client_id: `c${i}`, price: 0, created_at: '2026-01-01', used_sessions: 0, tenant_id: 'T' }));
  packages[1300] = { ...packages[1300], used_sessions: 3 }; // counter says 3, ledger says 0
  const entries = [];
  const db = makeCapDb({ packages, package_entries: entries, receipts: [], reviews: [], appointments: [], clients: [], waitlist: [] });
  db.rpc = async () => ({ data: [], error: null });
  const { results } = await runInvariants(db);
  const drift = results.find((r) => r.key === 'package_ledger_drift');
  eq('a drifted package at row 1,301 is counted', drift?.count, 1);
}
{
  const packages = Array.from({ length: 1200 }, (_, i) => ({ id: `p${pad(i)}`, client_id: `c${i}`, price: 100, created_at: '2026-01-01', used_sessions: 0, tenant_id: 'T' }));
  // Every paid package has its receipt EXCEPT the one at row 1,150; the
  // receipts table is itself past the cap (1,600 rows).
  const receipts = packages.filter((_, i) => i !== 1150).map((p, i) => ({ id: `r${pad(i)}`, client_id: p.client_id, service: 'חבילה', amount: 100, tenant_id: 'T' }));
  for (let i = 0; i < 400; i++) receipts.push({ id: `rx${pad(i)}`, client_id: `z${i}`, service: 'טיפול', amount: 50, tenant_id: 'T' });
  const db = makeCapDb({ packages, package_entries: [], receipts, reviews: [], appointments: [], clients: [], waitlist: [] });
  db.rpc = async () => ({ data: [], error: null });
  const { results } = await runInvariants(db);
  const miss = results.find((r) => r.key === 'packages_without_receipt');
  eq('the one package with no receipt is found, not 200 phantom ones', miss?.count, 1);
}
{
  const reviews = Array.from({ length: 1300 }, (_, i) => ({ id: `rv${pad(i)}`, appointment_id: `a${pad(i)}` }));
  const appointments = reviews.slice(0, 1299).map((r) => ({ id: r.appointment_id }));
  const db = makeCapDb({ packages: [], package_entries: [], receipts: [], reviews, appointments, clients: [], waitlist: [] });
  db.rpc = async () => ({ data: [], error: null });
  const { results } = await runInvariants(db);
  eq('exactly one orphaned review among 1,300', results.find((r) => r.key === 'orphan_reviews')?.count, 1);
}

// ── the dashboard boot no longer reads whole tables unpaged ─────────────────
group('dashboard boot');
{
  const src = fs.readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
  for (const t of ['appointments', 'clients', 'leads', 'receipts', 'receipt_voids', 'packages']) {
    ok(`boot reads ${t} through readAllRows`, new RegExp(`readAllRows\\(supabase, "${t}"`).test(src));
    ok(`boot no longer does an unpaged ${t} select`, !new RegExp(`supabase\\.from\\("${t}"\\)\\.select\\("\\*"\\)\\]`).test(src));
  }
  ok('boot tells her when a read was incomplete', /incomplete/.test(src) && /complete === false|!\w+\.complete/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
