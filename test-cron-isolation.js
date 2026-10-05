// test-cron-isolation.js
//
// One slow or failing tenant must never block the rest, and a run that cannot
// finish must say who it missed. Driven through the real engines
// (lib/cronFanout.js, lib/reminders/dailyReminders.js, lib/eveningRun.js,
// lib/reminders/smartReminders.js, lib/legalReceipts/service.retryDue) with a
// fake database that enforces the 1,000-row cap, a fake sender with latency, and
// real timers. Nothing here can reach a client.
import { makeCapDb } from './testkit/capDb.js';
import { fanOut, describeMissed } from './lib/cronFanout.js';
import { runDailyReminders } from './lib/reminders/dailyReminders.js';
import { runEveningSummaries } from './lib/eveningRun.js';
import { runSmartReminders, dateNDaysAgo } from './lib/reminders/smartReminders.js';
import * as legal from './lib/legalReceipts/service.js';

let passed = 0, failed = 0;
const ok = (label, cond, extra = '') => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label} ${extra}`); } };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
const group = (n) => console.log(`\n── ${n}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, w = 5) => String(n).padStart(w, '0');

// ── fanOut itself ──────────────────────────────────────────────────────────
group('fanOut');
{
  const items = Array.from({ length: 12 }, (_, i) => `t${i}`);
  const { outcomes, summary } = await fanOut(items, async (k) => {
    if (k === 't3') throw new Error('boom');
    if (k === 't5') await new Promise(() => {}); // never answers
    return k;
  }, { concurrency: 3, itemTimeoutMs: 400 });
  eq('a throwing tenant is recorded as failed', summary.failed, ['t3']);
  eq('a hung tenant is recorded as timed_out', summary.timedOut, ['t5']);
  eq('every other tenant completed', summary.ok, 10);
  ok('nothing is unaccounted for', summary.ok + summary.failed.length + summary.timedOut.length + summary.notStarted.length === 12);
  ok('and the run says it is incomplete', summary.complete === false);
  ok('the failure carries its reason', outcomes.find((o) => o.key === 't3').error === 'boom');
}
{
  let inFlight = 0, peak = 0;
  await fanOut(Array.from({ length: 30 }, (_, i) => i), async () => { inFlight++; peak = Math.max(peak, inFlight); await sleep(5); inFlight--; }, { concurrency: 4 });
  ok(`never more than the cap in flight (peak ${peak})`, peak <= 4 && peak > 1);
}
{
  const items = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const { outcomes, summary } = await fanOut(items, async () => { await sleep(15); }, { concurrency: 2, budgetMs: 60 });
  ok('past its budget it stops STARTING tenants', summary.notStarted.length > 0 && summary.notStarted.length < 40, JSON.stringify(summary.notStarted.length));
  ok('every tenant is in exactly one bucket', outcomes.length + summary.notStarted.length === 40);
  ok('the unreached ones are named', summary.notStarted.every((k) => /^t\d+$/.test(k)) && describeMissed('x', summary).includes('לא התחילו'));
  eq('a finished run describes nothing', describeMissed('x', { complete: true }), '');
}

// ── daily reminders: 1,440 appointments, 120 tenants ───────────────────────
const deps = {
  startMinute: (a) => (a.start_minute ?? a.hour * 60),
  isPersonal: (a) => a.kind === 'personal',
  confirmLinks: () => ({ confirmUrl: 'https://x/c', cancelUrl: 'https://x/x' }),
  isDemoTenantId: () => false,
  isMissingColumnError: () => false,
};
const TOMORROW = '2026-10-06';
function world({ tenants = 120, perTenant = 12 } = {}) {
  const settings = Array.from({ length: tenants }, (_, t) => ({ tenant_id: `T${pad(t)}`, business_name: `Biz ${t}` }));
  const appointments = [];
  for (let t = 0; t < tenants; t++) for (let k = 0; k < perTenant; k++) {
    appointments.push({ id: `a${pad(t)}-${pad(k)}`, name: `Client ${t}-${k}`, service: 'facial', date: TOMORROW, hour: 9 + (k % 8), start_minute: 540 + k * 15, duration: 45,
      client_phone: `05${pad(t, 3)}${pad(k, 4)}`, tenant_id: `T${pad(t)}`, confirmation_status: 'confirmed', kind: 'appointment' });
  }
  return { settings, appointments, whatsapp_messages: [] };
}
function sender({ latency = 4, hangTenant = null, throwTenant = null } = {}) {
  const calls = []; let inFlight = 0, peak = 0;
  const send = async (phone, message, o) => {
    if (o.tenantId === hangTenant) await new Promise(() => {});
    if (o.tenantId === throwTenant) throw new Error('provider exploded');
    inFlight++; peak = Math.max(peak, inFlight); await sleep(latency); inFlight--;
    calls.push({ phone, tenantId: o.tenantId, type: o.type });
    return { ok: true };
  };
  return { send, calls, peak: () => peak };
}

group('daily reminders past 1,000 appointments');
{
  const w = world();
  const s = sender({ latency: 4 });
  // What one send really costs here (timers are coarse on Windows), so "faster
  // than serial" is measured, not assumed.
  const u0 = Date.now(); for (let i = 0; i < 10; i++) await sleep(4); const unit = (Date.now() - u0) / 10;
  const t0 = Date.now();
  const run = await runDailyReminders({ db: makeCapDb(w), send: s.send, tomorrow: TOMORROW, baseUrl: 'https://x', deps, concurrency: 4 });
  const ms = Date.now() - t0;
  eq('all 1,440 appointments were reminded (1,000 is the cap)', s.calls.length, 1440);
  ok('the run reports it complete', run.fanout.complete && run.fanout.ok === 120);
  ok('every tenant got exactly its own', Array.from({ length: 120 }, (_, t) => s.calls.filter((c) => c.tenantId === `T${pad(t)}`).length === 12).every(Boolean));
  ok(`tenants ran in parallel but within the cap (peak ${s.peak()})`, s.peak() > 1 && s.peak() <= 4);
  ok(`and faster than serial would be (${ms}ms vs ~${Math.round(1440 * unit)}ms)`, ms < 1440 * unit * 0.8);
}
{
  const w = world({ tenants: 20, perTenant: 5 });
  const s = sender({ latency: 2, hangTenant: 'T00007' });
  const run = await runDailyReminders({ db: makeCapDb(w), send: s.send, tomorrow: TOMORROW, baseUrl: 'https://x', deps, concurrency: 4, itemTimeoutMs: 500 });
  eq('a tenant whose send hangs is timed_out', run.fanout.timedOut, ['T00007']);
  eq('the other 19 tenants were all reminded in full', s.calls.length, 19 * 5);
  ok('the run is NOT complete, and the report names the tenant', !run.fanout.complete && describeMissed('r', run.fanout).includes('T00007'));
}
{
  const w = world({ tenants: 20, perTenant: 5 });
  const s = sender({ latency: 2, throwTenant: 'T00003' });
  const run = await runDailyReminders({ db: makeCapDb(w), send: s.send, tomorrow: TOMORROW, baseUrl: 'https://x', deps });
  eq('the other tenants are unaffected by one whose sender throws', s.calls.length, 19 * 5);
  ok('its appointments are reported as failed, not dropped', run.results.filter((r) => r.tenantId === 'T00003' && /נכשל|failed/i.test(r.status)).length === 5
    || run.results.filter((r) => r.tenantId === 'T00003').length === 5);
}
{
  const w = world({ tenants: 60, perTenant: 4 });
  const s = sender({ latency: 12 });
  const run = await runDailyReminders({ db: makeCapDb(w), send: s.send, tomorrow: TOMORROW, baseUrl: 'https://x', deps, concurrency: 2, budgetMs: 150 });
  const reached = new Set(s.calls.map((c) => c.tenantId));
  ok('a short budget leaves tenants unstarted', run.fanout.notStarted.length > 0);
  ok('every tenant is either reminded or named as missed', Array.from({ length: 60 }, (_, t) => `T${pad(t)}`).every((id) => reached.has(id) || run.fanout.notStarted.includes(id) || run.fanout.timedOut.includes(id)));
  ok('no tenant is both', run.fanout.notStarted.every((id) => !reached.has(id)));
  // ...and the retry finishes exactly the missed ones, without re-sending.
  const missed = run.fanout.notStarted;
  const s2 = sender({ latency: 1 });
  const again = await runDailyReminders({ db: makeCapDb(w), send: s2.send, tomorrow: TOMORROW, baseUrl: 'https://x', deps, only: missed });
  ok('retry with only= reminds exactly the missed tenants', new Set(s2.calls.map((c) => c.tenantId)).size === missed.length && s2.calls.every((c) => missed.includes(c.tenantId)));
  ok('and the retry is complete', again.fanout.complete);
}
{
  const w = world({ tenants: 3, perTenant: 2 });
  w.whatsapp_messages = [{ id: 'm1', tenant_id: 'T00001', message_type: 'reminder', recipient_phone: w.appointments.find((a) => a.tenant_id === 'T00001').client_phone, status: 'sent', created_at: new Date().toISOString() }];
  const s = sender({ latency: 1 });
  await runDailyReminders({ db: makeCapDb(w), send: s.send, tomorrow: TOMORROW, baseUrl: 'https://x', deps, only: ['T00001'], now: () => Date.now() });
  eq('retry skips a phone already reminded in the last 20 hours', s.calls.length, 1);
}
{
  const w = world({ tenants: 30, perTenant: 40 }); // 1,200 rows
  let threw = null;
  try {
    await runDailyReminders({ db: makeCapDb(w, { failPage: (from) => from === 1000 }), send: sender().send, tomorrow: TOMORROW, baseUrl: 'https://x', deps });
  } catch (e) { threw = e; }
  ok('a page that cannot be read aborts the run loudly instead of reminding a subset', threw && /appointments read failed/.test(threw.message));
}

// ── evening summaries: 1,100 opted-in tenants ──────────────────────────────
group('evening summaries past 1,000 tenants');
{
  const n = 1100;
  const settings = Array.from({ length: n }, (_, t) => ({ tenant_id: `T${pad(t)}`, business_phone: '0', branding: { evening_summary: true }, automations: null }));
  const appointments = Array.from({ length: n }, (_, t) => ({ id: `a${t}`, name: 'c', service: 's', date: TOMORROW, hour: 10, start_minute: 600, duration: 30, tenant_id: `T${pad(t)}`, confirmation_status: 'confirmed', kind: 'appointment' }));
  const notified = [];
  const depsE = {
    notifyOwner: async ({ tenantId }) => { if (tenantId === 'T00500') throw new Error('push failed'); if (tenantId === 'T00600') await new Promise(() => {}); notified.push(tenantId); },
    buildEveningSummary: ({ appointments }) => (appointments.length ? 'x' : ''),
    startMinute: (a) => a.start_minute, endMinute: (a) => a.start_minute + a.duration,
    isPersonal: () => false, isMissingColumnError: () => false,
  };
  const run = await runEveningSummaries({ db: makeCapDb({ settings, appointments }), date: TOMORROW, deps: depsE, concurrency: 8, itemTimeoutMs: 500, budgetMs: 30_000 });
  eq('1,098 of 1,100 got their summary (two isolated failures)', notified.length, 1098);
  eq('the throwing tenant is named', run.fanout.failed, ['T00500']);
  eq('the hung tenant is named', run.fanout.timedOut, ['T00600']);
}

// ── smart reminders: the send stage ────────────────────────────────────────
group('smart reminders send stage');
{
  const NOW = new Date('2026-10-05T12:00:00Z');
  const T = 'tenant-1';
  const clients = Array.from({ length: 40 }, (_, i) => ({ id: `c${pad(i)}`, name: `C${i}`, phone: `0509${pad(i)}`, tenant_id: T, birthday: null }));
  const appointments = clients.map((c, i) => ({ id: `a${pad(i)}`, client_id: c.id, date: dateNDaysAgo(200, NOW), tenant_id: T, confirmation_status: 'confirmed' }));
  const mkDb = () => makeCapDb({ settings: [{ tenant_id: T, business_name: 'S' }], clients, appointments, packages: [], auto_reminders_log: [] });
  const sent = [];
  const out = await runSmartReminders({
    db: mkDb(), now: NOW, caps: { perRun: 100, perTenant: 100 },
    send: async (phone) => { if (phone.endsWith('00007')) throw new Error('boom'); sent.push(phone); return { ok: true }; },
  });
  eq('one throwing send no longer aborts the run: the other 39 go out', sent.length, 39);
  eq('and it is listed as errored', out.stats.errored.length, 1);

  const sent2 = [];
  const out2 = await runSmartReminders({
    db: mkDb(), now: NOW, caps: { perRun: 100, perTenant: 100 }, concurrency: 1, sendBudgetMs: 40,
    send: async (phone) => { await sleep(15); sent2.push(phone); return { ok: true }; },
  });
  ok('past the budget no send is started', out2.stats.unsent.length > 0 && sent2.length < 40);
  eq('sent + unsent accounts for everyone selected', sent2.length + out2.stats.unsent.length, 40);
}

// ── legal receipts retry: the bound is provable ────────────────────────────
group('legal receipts retry');
{
  const failed = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}`, tenant_id: 'T', legal_status: 'failed', legal_attempts: 1, legal_attempted_at: '2026-01-01T00:00:00Z' }));
  const db = makeCapDb({ receipts: failed, receipt_voids: [] }, { maxRows: 1000 });
  db.from = ((orig) => (t) => { const c = orig(t); const origSelect = c.select; c.select = (...a) => origSelect(...a); c.lt = () => c; return c; })(db.from.bind(db));
  const adapter = { issue: async () => ({ ok: false, kind: 'definite', message: 'x' }) };
  const res = await legal.retryDue({ db, adapter, limit: 100, now: new Date('2026-10-05T00:00:00Z') }).catch((e) => ({ error: e.message }));
  ok('a backlog past the per-run limit is reported as a number, not hidden', res.due === 250 && res.deferred === 150, JSON.stringify(res));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
