// test-smart-reminders.js
//
// Proves the smart-reminder fix at target scale. Run with plain node:
//
//     node test-smart-reminders.js
//
// NO DATABASE. NO NETWORK. NO WHATSAPP. Every query is served by an in-memory
// fake that counts calls, and the sender is a stub that records what it was
// asked to send. Nothing here can reach a real client.
//
// ── Why a synthetic dataset and not production ─────────────────────────────
// Production has 9 clients, 5 with appointments, 0 lapsed, 0 packages, 0
// birthdays. A before/after against it measures 0 vs 0 and proves nothing
// about the bug, which only appears at scale. So this drives the REAL engine -
// lib/reminders/smartReminders.js, the same module the cron imports - against
// 50 tenants x 200 clients, and asserts the properties that actually matter:
//
//   1. Query count does not grow with the candidate set. This is the fix. The
//      old code ran one database round trip per candidate; at 4,000 lapsed
//      clients that was 4,000 sequential queries and a timeout.
//   2. The caps hold, globally and per tenant, no matter how big the backlog.
//   3. The global cap is spread across tenants rather than eaten by the first
//      few.
//   4. Birthdays are never the thing that gets deferred.

import {
  runSmartReminders,
  selectWithCaps,
  pooled,
  dateNDaysAgo,
  DEFAULT_CAPS,
  TYPE_PRIORITY,
  computeLastVisits,
  winbackLogRow,
  WINBACK_TYPE,
} from './lib/reminders/smartReminders.js';

let passed = 0;
let failed = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passed++;
  else { failed++; console.log(`  FAIL  ${label}\n        got  ${a}\n        want ${b}`); }
};
const ok = (label, cond) => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label}`); } };
const group = (n) => console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}`);

// ── the fake database ──────────────────────────────────────────────────────
//
// Implements just enough of the supabase-js chain to serve this engine, and
// counts every call so the query count can be asserted rather than eyeballed.

function makeDb(tables) {
  const counts = { total: 0, byTable: {} };
  const api = {
    counts,
    from(table) {
      counts.total++;
      counts.byTable[table] = (counts.byTable[table] || 0) + 1;
      let rows = tables[table] ? [...tables[table]] : [];
      const chain = {
        select() { return chain; },
        order() { return chain; },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return chain; },
        in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return chain; },
        range(from, to) {
          const slice = rows.slice(from, to + 1);
          return Promise.resolve({ data: slice, error: null, count: rows.length });
        },
        insert(row) { tables[table] = tables[table] || []; tables[table].push(row); return Promise.resolve({ error: null }); },
        then(res) { return Promise.resolve({ data: rows, error: null }).then(res); },
      };
      return chain;
    },
  };
  return api;
}

// ── the fake sender ────────────────────────────────────────────────────────
function makeSender({ failEvery = 0 } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    send: async (phone, message, opts) => {
      n++;
      calls.push({ phone, message, ...opts });
      return { ok: !(failEvery && n % failEvery === 0) };
    },
  };
}

// ── the synthetic world ────────────────────────────────────────────────────
function buildWorld({ tenants = 50, clientsPer = 200, stalePct = 0.4, now = new Date('2026-08-26T12:00:00Z') }) {
  const clients = [], appointments = [], settings = [], packages = [];
  const staleDate = dateNDaysAgo(400, now);   // long past the 90-day cutoff
  const freshDate = dateNDaysAgo(10, now);
  for (let t = 0; t < tenants; t++) {
    const tid = `tenant-${String(t).padStart(3, '0')}`;
    settings.push({ tenant_id: tid, business_name: `עסק ${t}`, automations: null });
    for (let c = 0; c < clientsPer; c++) {
      const id = `${tid}-client-${String(c).padStart(4, '0')}`;
      clients.push({ id, name: `לקוחה ${c}`, phone: `97254${String(1000000 + t * 1000 + c)}`, tenant_id: tid, birthday: null, marketing_consent: true });
      appointments.push({
        id: `${id}-appt`, client_id: id, tenant_id: tid,
        date: c < clientsPer * stalePct ? staleDate : freshDate,
        confirmation_status: 'confirmed', service: 'פילינג',
      });
    }
  }
  return { clients, appointments, settings, packages, auto_reminders_log: [], now };
}

console.log('='.repeat(64));
console.log('smart-reminder engine — scale + cap proof');
console.log('NO database, NO network, NO WhatsApp.');
console.log('='.repeat(64));

// ── 1. unit: cap selection ─────────────────────────────────────────────────
group('selectWithCaps');
{
  const mk = (tenant, i, type = 'winback') => ({ tenantId: tenant, clientId: `${tenant}-${i}`, type, referenceId: 'r', client: {} });
  const many = [];
  for (let t = 0; t < 50; t++) for (let i = 0; i < 100; i++) many.push(mk(`t${String(t).padStart(2, '0')}`, i));
  const { selected, deferred } = selectWithCaps(many, DEFAULT_CAPS);
  eq('global cap respected', selected.length, 200);
  eq('nothing lost - selected + deferred = input', selected.length + deferred.length, many.length);

  const perTenant = {};
  for (const s of selected) perTenant[s.tenantId] = (perTenant[s.tenantId] || 0) + 1;
  ok('no tenant exceeds the per-tenant cap', Object.values(perTenant).every((n) => n <= DEFAULT_CAPS.perTenant));
  ok('cap is SPREAD, not eaten by the first tenants', Object.keys(perTenant).length >= 10);
  eq('with 50 tenants and 200 global, every tenant gets 4', new Set(Object.values(perTenant)).size, 1);

  // Per-tenant cap binds when one tenant dominates.
  const one = Array.from({ length: 500 }, (_, i) => mk('solo', i));
  const r2 = selectWithCaps(one, DEFAULT_CAPS);
  eq('single tenant capped at perTenant', r2.selected.length, DEFAULT_CAPS.perTenant);
  eq('the rest deferred', r2.deferred.length, 480);

  // Priority: birthday must never be the one deferred.
  const mixed = [];
  for (let i = 0; i < 30; i++) mixed.push(mk('solo', `w${i}`, 'winback'));
  mixed.push(mk('solo', 'b1', 'birthday'));
  const r3 = selectWithCaps(mixed, { perRun: 200, perTenant: 5 });
  ok('birthday is selected even when winbacks outnumber it 30:1', r3.selected.some((c) => c.type === 'birthday'));
  eq('birthday is first in priority order', TYPE_PRIORITY[0], 'birthday');

  eq('empty input', selectWithCaps([], DEFAULT_CAPS), { selected: [], deferred: [] });
}

// ── 2. unit: bounded concurrency ───────────────────────────────────────────
group('pooled');
{
  let inFlight = 0, maxInFlight = 0, done = 0;
  const items = Array.from({ length: 50 }, (_, i) => i);
  await pooled(items, 6, async () => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--; done++;
  });
  eq('every item processed', done, 50);
  ok(`never exceeded the limit (peak ${maxInFlight})`, maxInFlight <= 6);
  ok('actually ran concurrently', maxInFlight > 1);
  await pooled([], 6, async () => { throw new Error('should not run'); });
  passed++; // empty list does not hang or throw
}

// ── 3. THE FIX: query count is flat as candidates grow ─────────────────────
group('query count does not grow with candidates');
{
  const sizes = [10, 50, 200];
  const observed = [];
  for (const tenants of sizes) {
    const w = buildWorld({ tenants, clientsPer: 200, stalePct: 0.4 });
    const db = makeDb({
      settings: w.settings, clients: w.clients, appointments: w.appointments,
      packages: w.packages, auto_reminders_log: w.auto_reminders_log,
    });
    const { stats } = await runSmartReminders({ db, send: async () => ({ ok: true }), dryRun: true, now: w.now });
    observed.push({ tenants, candidates: stats.considered, queries: stats.queries });
  }
  for (const o of observed) {
    console.log(`     ${String(o.tenants).padStart(3)} tenants -> ${String(o.candidates).padStart(6)} candidates, ${o.queries} queries`);
  }
  const qs = observed.map((o) => o.queries);
  eq('query count identical at every scale', new Set(qs).size, 1);
  ok('candidate count really did grow', observed[2].candidates > observed[0].candidates * 10);
  ok('queries stay in single digits', qs[0] < 10);
  console.log(`     OLD behaviour would have been ~${observed[2].candidates} queries at the largest size.`);
}

// ── 4. end to end at target scale ──────────────────────────────────────────
group('50 tenants x 200 clients, live send path');
{
  const w = buildWorld({ tenants: 50, clientsPer: 200, stalePct: 0.4 });
  const db = makeDb({
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  });
  const sender = makeSender();
  const t0 = Date.now();
  const { stats } = await runSmartReminders({ db, send: sender.send, dryRun: false, now: w.now });
  const ms = Date.now() - t0;

  console.log(`     candidates ${stats.considered}, selected ${stats.selected}, deferred ${stats.deferredByCap}, sent ${stats.sent}, queries ${stats.queries}, ${ms} ms`);
  eq('4,000 winback candidates found', stats.candidates.winback, 4000);
  eq('sends capped at 200', sender.calls.length, DEFAULT_CAPS.perRun);
  eq('stats.sent matches actual sends', stats.sent, DEFAULT_CAPS.perRun);
  eq('the rest deferred, not dropped', stats.deferredByCap, 4000 - 200);
  eq('selected + deferred = eligible', stats.selected + stats.deferredByCap, 4000);

  const perTenant = {};
  for (const c of sender.calls) perTenant[c.tenantId] = (perTenant[c.tenantId] || 0) + 1;
  ok('per-tenant cap held on the real send path', Object.values(perTenant).every((n) => n <= DEFAULT_CAPS.perTenant));
  eq('all 50 tenants got some', Object.keys(perTenant).length, 50);
  ok('every send had a phone number', sender.calls.every((c) => !!c.phone));
  ok('every send is tagged auto_*', sender.calls.every((c) => String(c.type).startsWith('auto_')));
  eq('log rows written = sends', w.auto_reminders_log.length, DEFAULT_CAPS.perRun);
}

// ── 5. idempotency: a second run does not re-send ──────────────────────────
group('anti-spam still works');
{
  const w = buildWorld({ tenants: 5, clientsPer: 40, stalePct: 0.5 });
  const tables = {
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  };
  const db = makeDb(tables);
  const s1 = makeSender();
  const r1 = await runSmartReminders({ db, send: s1.send, now: w.now });
  const s2 = makeSender();
  const r2 = await runSmartReminders({ db, send: s2.send, now: w.now });

  console.log(`     run 1 sent ${s1.calls.length}, run 2 sent ${s2.calls.length}, skipped as already-sent ${r2.stats.skipped.alreadySent}`);
  ok('run 1 sent something', s1.calls.length > 0);
  eq('run 2 re-sent nothing to the same people', r2.stats.skipped.alreadySent, s1.calls.length);
  const s1keys = new Set(s1.calls.map((c) => `${c.tenantId}|${c.name}`));
  ok('no overlap between the two runs', s2.calls.every((c) => !s1keys.has(`${c.tenantId}|${c.name}`)));
}

// ── 6. gates still respected ───────────────────────────────────────────────
group('pause and toggles');
{
  const w = buildWorld({ tenants: 4, clientsPer: 30, stalePct: 1 });
  w.settings[0].automations = { paused: true };        // tenant-000 fully paused
  w.settings[1].winback_enabled = false;               // tenant-001 winback off
  w.settings[2].automations = { paused: 'yes' };       // malformed -> must NOT pause
  const db = makeDb({
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  });
  const sender = makeSender();
  const { stats } = await runSmartReminders({ db, send: sender.send, now: w.now });
  const tenantsSent = new Set(sender.calls.map((c) => c.tenantId));
  ok('paused tenant got nothing', !tenantsSent.has('tenant-000'));
  ok('winback-disabled tenant got nothing', !tenantsSent.has('tenant-001'));
  ok('malformed pause value FAILS OPEN (still sends)', tenantsSent.has('tenant-002'));
  ok('normal tenant sends', tenantsSent.has('tenant-003'));
  ok('paused counted in stats', stats.skipped.paused > 0);
  ok('toggle counted in stats', stats.skipped.toggledOff > 0);
}

// ── 7. no phone, and send failures ─────────────────────────────────────────
group('edge cases');
{
  const w = buildWorld({ tenants: 2, clientsPer: 20, stalePct: 1 });
  w.clients[0].phone = null;
  w.clients[1].phone = '';
  const db = makeDb({
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  });
  const sender = makeSender({ failEvery: 3 });
  const { stats } = await runSmartReminders({ db, send: sender.send, now: w.now });
  eq('clients without a phone are skipped', stats.skipped.noPhone, 2);
  ok('failures counted, not thrown', stats.failed > 0);
  eq('sent + failed = attempted', stats.sent + stats.failed, sender.calls.length);
  eq('only successes were logged', w.auto_reminders_log.length, stats.sent);
}

// ── 8. dry run writes nothing ──────────────────────────────────────────────
group('dryRun');
{
  const w = buildWorld({ tenants: 3, clientsPer: 30, stalePct: 1 });
  const db = makeDb({
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  });
  const sender = makeSender();
  const { stats, results } = await runSmartReminders({ db, send: sender.send, dryRun: true, now: w.now });
  eq('no sends attempted', sender.calls.length, 0);
  eq('no log rows written', w.auto_reminders_log.length, 0);
  ok('but it still reports what it would do', stats.selected > 0);
  ok('preview rows carry the Hebrew preview status', results.winback.some((r) => r.status.includes('תצוגה מקדימה')));
}

// ── 9. collectOnly, used by the backlog marking script ─────────────────────
group('collectOnly (backlog marking)');
{
  const w = buildWorld({ tenants: 10, clientsPer: 100, stalePct: 0.5 });
  const db = makeDb({
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  });
  const { eligible, stats } = await runSmartReminders({
    db,
    send: async () => { throw new Error('must not send'); },
    collectOnly: true,
    now: w.now,
  });
  eq('returns the FULL eligible list, uncapped', eligible.length, 500);
  ok('far more than one run\'s cap', eligible.length > DEFAULT_CAPS.perRun);
  eq('nothing was sent', w.auto_reminders_log.length, 0);
  eq('no cap accounting in collectOnly', stats.selected, 0);
  ok('every entry has what the log insert needs',
    eligible.every((c) => c.tenantId && c.clientId && c.type && c.referenceId !== undefined));

  // Marking the backlog must actually silence the cron afterwards.
  for (const c of eligible) {
    w.auto_reminders_log.push({
      tenant_id: c.tenantId, client_id: c.clientId,
      reminder_type: c.type, reference_id: c.referenceId || '',
    });
  }
  const sender = makeSender();
  const after = await runSmartReminders({ db, send: sender.send, now: w.now });
  eq('after marking, the cron sends nothing', sender.calls.length, 0);
  eq('and reports them as already-sent', after.stats.skipped.alreadySent, 500);
}

// ── 10. the manual lapsed-send must silence the automation ─────────────────
//
// This is the coupling that would fail silently. The lapsed-clients view writes
// a suppression row when she messages someone by hand; if its key does not
// match the key the winback pass looks up, the cron messages that client a
// second time - after she has already spoken to them personally.
group('manual send suppresses the automated winback');
{
  const w = buildWorld({ tenants: 3, clientsPer: 40, stalePct: 1 });
  const tables = {
    settings: w.settings, clients: w.clients, appointments: w.appointments,
    packages: w.packages, auto_reminders_log: w.auto_reminders_log,
  };
  const db = makeDb(tables);

  // What the route does: compute last visits the shared way, write the shared row.
  const lastVisits = computeLastVisits(w.appointments);
  const handled = w.clients.slice(0, 25);
  for (const c of handled) {
    w.auto_reminders_log.push(winbackLogRow(c.tenant_id, c.id, lastVisits[c.id]));
  }
  eq('a row was written per client she messaged', w.auto_reminders_log.length, 25);
  ok('reference_id is the last visit date, not a timestamp',
    w.auto_reminders_log.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.reference_id)));
  eq('reminder_type matches the winback pass', w.auto_reminders_log[0].reminder_type, WINBACK_TYPE);

  const sender = makeSender();
  const { stats } = await runSmartReminders({ db, send: sender.send, now: w.now });
  const messaged = new Set(sender.calls.map((c) => c.name + '|' + c.tenantId));
  const handledKeys = handled.map((c) => c.name + '|' + c.tenant_id);

  eq('the cron skipped exactly the ones she handled', stats.skipped.alreadySent, 25);
  ok('and messaged none of them', handledKeys.every((k) => !messaged.has(k)));
  ok('while still messaging the others', sender.calls.length > 0);

  // If she messages someone and they come BACK and lapse again, the date moves,
  // the key changes, and they become eligible again. That is intended.
  const returner = handled[0];
  w.appointments.push({
    id: `${returner.id}-return`, client_id: returner.id, tenant_id: returner.tenant_id,
    date: dateNDaysAgo(200, w.now), confirmation_status: 'confirmed', service: 'פילינג',
  });
  const db2 = makeDb(tables);
  const sender2 = makeSender();
  await runSmartReminders({ db: db2, send: sender2.send, now: w.now });
  ok('a client who returned and lapsed again is eligible once more',
    sender2.calls.some((c) => c.name === returner.name && c.tenantId === returner.tenant_id));
}

// ── a queued message is handled, not failed, and is not re-queued tomorrow ───────────────────────────────
// Win-back and package-done carry no date in their key, and while the central number is off every one of them
// comes back queued (ok:false, queued:true). They used to be counted failed and left unlogged, so the same
// clients were queued again every day.
group('a queued message counts as handled');
{
  const w = buildWorld({ tenants: 2, clientsPer: 10, stalePct: 1 });
  const db = makeDb({ settings: w.settings, clients: w.clients, appointments: w.appointments, packages: w.packages, auto_reminders_log: w.auto_reminders_log });
  const calls = [];
  const queuedSend = async (phone, message, opts) => { calls.push(opts.type); return { ok: false, queued: true, waLink: 'https://wa.me/x' }; };
  const first = await runSmartReminders({ db, send: queuedSend, dryRun: false, now: w.now });
  eq('queued is not failed', first.stats.failed, 0);
  ok('queued is counted', first.stats.queued > 0);
  eq('every queued message is logged', w.auto_reminders_log.length, first.stats.queued);
  const before = calls.length;
  await runSmartReminders({ db, send: queuedSend, dryRun: false, now: w.now });
  eq('a second run queues nothing new for the same clients', calls.length, before);
}

// ── her own timing (Settings > messages): win-back days and the review delay ───────────────────────────
group('her own timing');
{
  const now = new Date('2026-08-26T12:00:00Z');
  const mk = (tid, timing) => ({ tenant_id: tid, business_name: tid, automations: timing ? { timing } : null });
  const client = (tid) => ({ id: tid + '-c', name: 'לקוחה', phone: '972541234567', tenant_id: tid, birthday: null, marketing_consent: true });
  const appt = (tid, daysAgo) => ({ id: tid + '-a', client_id: tid + '-c', tenant_id: tid, date: dateNDaysAgo(daysAgo, now), confirmation_status: 'confirmed', service: 'פילינג' });
  // last visit 100 days ago: a default tenant (90) wins her back, one who set 180 does not, one who set 60 does
  const w = {
    settings: [mk('t-default', null), mk('t-180', { winback_days: 180 }), mk('t-60', { winback_days: 60 })],
    clients: [client('t-default'), client('t-180'), client('t-60')],
    appointments: [appt('t-default', 100), appt('t-180', 100), appt('t-60', 100)],
    packages: [], auto_reminders_log: [],
  };
  const calls = [];
  const send = async (phone, message, opts) => { calls.push(opts.tenantId + ':' + opts.type); return { ok: true }; };
  await runSmartReminders({ db: makeDb(w), send, dryRun: false, now });
  eq('winback follows her own days', calls.filter((c) => c.endsWith('auto_winback')).sort(), ['t-60:auto_winback', 't-default:auto_winback']);

  // review: visits 2 and 3 days ago; a default tenant is asked for the 2-day-old one, a "3 days" tenant for the 3-day-old
  const r = {
    settings: [mk('r-default', null), mk('r-3', { review_delay_days: 3 })],
    clients: [client('r-default'), client('r-3')],
    appointments: [appt('r-default', 2), appt('r-3', 2), { ...appt('r-3', 3), id: 'r-3-b', client_id: 'r-3-c' }],
    packages: [], auto_reminders_log: [],
  };
  const calls2 = [];
  const send2 = async (phone, message, opts) => { calls2.push(opts.tenantId + ':' + opts.type); return { ok: true }; };
  await runSmartReminders({ db: makeDb(r), send: send2, dryRun: false, now });
  eq('review follows her own delay', calls2.filter((c) => c.endsWith('auto_review')).sort(), ['r-3:auto_review', 'r-default:auto_review']);
  ok('the default tenant was asked for the 2-day visit only', calls2.filter((c) => c === 'r-default:auto_review').length === 1);
}

console.log('\n' + '='.repeat(64));
console.log(`  passed ${passed}   failed ${failed}`);
console.log('='.repeat(64));
if (failed > 0) process.exit(1);
