// test-ops-events.js
//
// An operator alert is written to the admin panel's log FIRST and sent to
// WhatsApp second, so it exists even when WhatsApp is the thing that is down.
//
// The alerts used to ride one channel: a WhatsApp message to the operator,
// through the same central GreenAPI number whose silence they were meant to
// report. When that session is disconnected the alert cannot arrive - and
// GreenAPI answers 200 either way, so even "sent" proved nothing (12 nightly
// alerts sat logged "sent" while none arrived, 2026-10-01). raiseOpsAlert
// records to the ops_events table (read by /dashboard/admin) before it tries
// WhatsApp, records what WhatsApp did, and survives every failure along the way
// - including the table not existing yet, which must not stop the WhatsApp
// attempt or throw into the cron that raised it.
import { raiseOpsAlert } from './lib/opsAlert.js';

let passed = 0, failed = 0;
const ok = (label, cond, extra = '') => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label} ${extra}`); } };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);

// Just enough of the supabase-js chain: insert().select().single(), update().eq().
function fakeDb({ missingTable = false, insertFails = false } = {}) {
  const rows = [];
  return {
    rows,
    from(table) {
      if (table !== 'ops_events') throw new Error('unexpected table ' + table);
      return {
        insert(row) {
          return {
            select() {
              return {
                single: async () => {
                  if (missingTable) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.ops_events'" } };
                  if (insertFails) return { data: null, error: { code: 'XX000', message: 'boom' } };
                  const r = { id: 'e' + (rows.length + 1), ...row };
                  rows.push(r);
                  return { data: { id: r.id }, error: null };
                },
              };
            },
          };
        },
        update(patch) {
          return { eq: async (_c, id) => { const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); return { error: null }; } };
        },
      };
    },
  };
}
const quiet = () => { const orig = console.error; console.error = () => {}; return () => { console.error = orig; }; };
const base = { source: 'send-reminders', severity: 'error', message: 'לא הושלם: T0007' };

// 1. WhatsApp down (the whole point): the alert is still recorded, with the outcome.
{
  const db = fakeDb();
  const restore = quiet();
  const res = await raiseOpsAlert({ ...base, db, to: '972500000000', send: async () => { throw new Error('GreenAPI unreachable'); } });
  restore();
  ok('recorded in the admin log even though WhatsApp threw', res.recorded === true && db.rows.length === 1);
  eq('and the row says WhatsApp failed', db.rows[0].whatsapp_delivery, 'failed');
  ok('the failure reason is kept', /GreenAPI unreachable/.test(db.rows[0].details?.whatsapp_error || ''));
  ok('raising an alert never throws into the cron', true);
}
// 2. Queued, not sent (central number not connected): said plainly.
{
  const db = fakeDb();
  await raiseOpsAlert({ ...base, db, to: '972500000000', send: async () => ({ ok: false, queued: true, reason: 'not_connected' }) });
  eq('a queued-not-sent result is recorded as exactly that', db.rows[0].whatsapp_delivery, 'queued_not_sent');
}
// 3. Handed over. NOT "delivered": GreenAPI returns 200 regardless.
{
  const db = fakeDb();
  await raiseOpsAlert({ ...base, db, to: '972500000000', send: async () => ({ ok: true }) });
  eq('success is "handed to GreenAPI", never "delivered"', db.rows[0].whatsapp_delivery, 'handed_to_greenapi');
}
// 4. A send that hangs cannot hold the cron hostage.
{
  const db = fakeDb();
  const t0 = Date.now();
  const restore = quiet();
  await raiseOpsAlert({ ...base, db, to: '972500000000', send: () => new Promise(() => {}), timeoutMs: 60 });
  restore();
  ok('a hung WhatsApp send is abandoned at the timeout', Date.now() - t0 < 1000);
  eq('and recorded as timed out', db.rows[0].whatsapp_delivery, 'timed_out');
}
// 5. The table is not there yet: still attempts WhatsApp, still does not throw.
{
  const db = fakeDb({ missingTable: true });
  let sent = 0;
  const restore = quiet();
  const res = await raiseOpsAlert({ ...base, db, to: '972500000000', send: async () => { sent++; return { ok: true }; } });
  restore();
  ok('a missing ops_events table does not stop the WhatsApp attempt', sent === 1);
  ok('and the result says the log was NOT recorded, so the caller knows', res.recorded === false && res.logProblem === 'table_missing');
}
// 6. No operator number configured: the log is the only channel, and says so.
{
  const db = fakeDb();
  let sent = 0;
  const restore = quiet();
  await raiseOpsAlert({ ...base, db, to: '', send: async () => { sent++; return { ok: true }; } });
  restore();
  ok('no number configured: nothing sent', sent === 0);
  eq('...recorded as such', db.rows[0].whatsapp_delivery, 'no_operator_number');
}
// 7. Both channels broken: still returns, still writes to the console (the third).
{
  const db = fakeDb({ insertFails: true });
  const errs = [];
  const orig = console.error; console.error = (...a) => errs.push(a.join(' '));
  const res = await raiseOpsAlert({ ...base, db, to: '972500000000', send: async () => { throw new Error('down'); } });
  console.error = orig;
  ok('log AND WhatsApp failing still returns', res.recorded === false && res.delivery === 'failed');
  ok('the console (Vercel logs) still got the alert', errs.some((l) => l.includes('[ops-alert]') && l.includes('send-reminders')));
}
// 8. Severity is constrained to what the table accepts.
{
  const db = fakeDb();
  await raiseOpsAlert({ ...base, db, to: '', send: async () => ({ ok: true }), severity: 'catastrophic' });
  ok('an unknown severity is stored as "error", not rejected by the table', db.rows[0].severity === 'error');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
