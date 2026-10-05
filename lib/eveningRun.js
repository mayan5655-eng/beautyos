// lib/eveningRun.js
//
// The evening "tomorrow in ten seconds" summary for every tenant that opted in:
// the engine behind app/api/send-owner-evening, extracted so it can be tested
// past the row cap and with a slow or failing tenant.
//
// Same three changes as lib/reminders/dailyReminders.js, for the same reasons:
// reads go through readAllRows (settings and tomorrow's appointments were
// unpaged, so past 1,000 rows some tenants simply got no summary); each tenant
// is its own job through lib/cronFanout.js (the old loop was serial against a
// 120 s limit, and one hung notification held up everyone behind it); and the
// result lists every tenant it did not finish.
import { readAllRows } from './pagedRead.js';
import { fanOut } from './cronFanout.js';

/**
 * @param {object} o
 * @param {any} o.db
 * @param {string} o.date YYYY-MM-DD (tomorrow, Israel)
 * @param {{ notifyOwner: Function, buildEveningSummary: Function, startMinute: Function,
 *           endMinute: Function, isPersonal: Function, isMissingColumnError: Function }} o.deps
 */
export async function runEveningSummaries({
  db, date, deps, concurrency = 4, budgetMs = 60_000, itemTimeoutMs = 30_000, now = () => Date.now(),
}) {
  const { notifyOwner, buildEveningSummary, startMinute, endMinute, isPersonal, isMissingColumnError } = deps;

  const s = await readAllRows(db, 'settings', { columns: 'tenant_id, business_phone, branding, automations', order: 'tenant_id' });
  if (s.error) throw new Error(`settings read failed: ${s.error.message}`);
  if (!s.complete) throw new Error(`settings could not be read completely (${s.fetched}/${s.total})`);
  const wanted = (s.data || []).filter((r) => {
    const b = r.branding && typeof r.branding === 'object' ? r.branding : {};
    const paused = r.automations && typeof r.automations === 'object' && r.automations.paused === true;
    return b.evening_summary === true && !paused;
  });
  if (!wanted.length) return { none: true, sent: 0, fanout: null };

  const COLS = 'id, name, service, date, hour, start_minute, duration, tenant_id, confirmation_status';
  const load = (cols) => readAllRows(db, 'appointments', {
    columns: cols, filter: (q) => q.eq('date', date).neq('confirmation_status', 'cancelled'),
  });
  let appts = await load(COLS + ', kind');
  if (appts.error && isMissingColumnError(appts.error)) appts = await load(COLS);
  if (appts.error) throw new Error(`appointments read failed: ${appts.error.message}`);
  if (!appts.complete) throw new Error(`appointments for ${date} could not be read completely (${appts.fetched}/${appts.total})`);

  const byTenant = new Map();
  for (const a of appts.data || []) {
    if (isPersonal(a)) continue;
    if (!byTenant.has(a.tenant_id)) byTenant.set(a.tenant_id, []);
    byTenant.get(a.tenant_id).push(a);
  }

  const { outcomes, summary } = await fanOut(wanted, async (r) => {
    const msg = buildEveningSummary({ date, appointments: byTenant.get(r.tenant_id) || [], startMinute, endMinute });
    if (!msg) return 'empty'; // an empty day is not worth a message
    await notifyOwner({ tenantId: r.tenant_id, kind: 'evening_summary', title: 'מחר ב-10 שניות', body: msg, settingsRow: r });
    return 'sent';
  }, { keyOf: (r) => r.tenant_id, concurrency, budgetMs, itemTimeoutMs, now });

  return { none: false, sent: outcomes.filter((o) => o.value === 'sent').length, fanout: summary };
}
