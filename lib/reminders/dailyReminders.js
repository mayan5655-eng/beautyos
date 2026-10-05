// lib/reminders/dailyReminders.js
//
// Tomorrow's appointment reminders, for every tenant - the engine behind
// app/api/send-reminders, extracted (like smartReminders.js) so it can be driven
// with a synthetic dataset, a fake clock and a fake sender.
//
// What changed from the loop it replaces, and why:
//   * ONE SERIAL LOOP -> ONE JOB PER TENANT. Tenants run in parallel (capped) and
//     in isolation through lib/cronFanout.js: a tenant whose sends throw or hang
//     is recorded as failed/timed_out and the others are unaffected, and no
//     tenant is STARTED after the budget, so the run ends on its own terms
//     instead of being killed mid-list with nobody told who was missed.
//   * UNPAGED READS -> PAGED. Tomorrow's appointments and every settings row
//     come back through readAllRows; past PostgREST's silent 1,000-row cap the
//     old query dropped tenants without a sound. A read that cannot be finished
//     aborts the run with an error rather than reminding "most" tenants.
//   * RETRY. `only` restricts the run to named tenants (the report lists who was
//     missed) and, because those tenants may have been part-way through, skips a
//     phone that already has a reminder logged in the last 20 hours.
//
// Within one tenant the sends stay serial: a single WhatsApp number is behind
// all of them, and a tenant's clients are best served in order.
//
// Dependencies that are TypeScript or Next-only are injected (`deps`) so this
// file imports nothing the plain-node test cannot load.
import { greet, lines, hebrewDate, timeRange, hhmm, durationHe, mapsLink } from '../messages.js';
import { readAllRows } from '../pagedRead.js';
import { fanOut } from '../cronFanout.js';
import { STATUS_FAILED, STATUS_NO_PHONE } from './failureReport.js';

const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000;

/**
 * @param {object} o
 * @param {any} o.db supabase client (service role)
 * @param {(phone: string, message: string, opts: object) => Promise<any>} o.send
 * @param {string} o.tomorrow YYYY-MM-DD
 * @param {string} o.baseUrl
 * @param {{ startMinute: Function, isPersonal: Function, confirmLinks: Function,
 *           isDemoTenantId: Function, isMissingColumnError: Function }} o.deps
 * @param {string[] | null} [o.only] tenant ids to restrict the run to (retry)
 * @param {number} [o.concurrency]
 * @param {number} [o.budgetMs]
 * @param {number} [o.itemTimeoutMs]
 * @param {() => number} [o.now]
 */
export async function runDailyReminders({
  db, send, tomorrow, baseUrl, deps, only = null,
  concurrency = 4, budgetMs = 200_000, itemTimeoutMs = 60_000, now = () => Date.now(),
}) {
  const { startMinute, isPersonal, confirmLinks, isDemoTenantId, isMissingColumnError } = deps;

  const COLS = 'id, name, service, date, hour, start_minute, duration, client_phone, tenant_id, confirmation_status';
  const load = (cols) => readAllRows(db, 'appointments', {
    columns: cols,
    filter: (q) => q.eq('date', tomorrow).neq('confirmation_status', 'cancelled'),
  });
  // `kind` separates a client appointment from her own personal event; the
  // column arrives with a hand-run migration, so ask for it and fall back.
  let appts = await load(COLS + ', kind');
  if (appts.error && isMissingColumnError(appts.error)) appts = await load(COLS);
  if (appts.error) throw new Error(`appointments read failed: ${appts.error.message}`);
  if (!appts.complete) throw new Error(`appointments for ${tomorrow} could not be read completely (${appts.fetched}/${appts.total}) - not sending to a partial list`);

  const onlySet = only && only.length ? new Set(only) : null;
  const rows = (appts.data || [])
    .filter((a) => !isDemoTenantId(a.tenant_id))
    .filter((a) => !onlySet || onlySet.has(a.tenant_id));
  if (rows.length === 0) return { empty: true, date: tomorrow, results: [], fanout: null, missed: '' };

  const settings = await readAllRows(db, 'settings', { order: 'tenant_id' });
  if (settings.error) throw new Error(`settings read failed: ${settings.error.message}`);
  if (!settings.complete) throw new Error(`settings could not be read completely (${settings.fetched}/${settings.total})`);
  const settingsByTenant = {};
  for (const row of settings.data || []) settingsByTenant[row.tenant_id] = row;

  const remindersEnabled = (t) => settingsByTenant[t]?.reminders_enabled !== false;
  // Only a literal true pauses: a missing column or malformed JSONB must never
  // silently stop a paying tenant's messages.
  const tenantPaused = (t) => {
    const autos = settingsByTenant[t]?.automations;
    return !!(autos && typeof autos === 'object' && autos.paused === true);
  };

  const byTenant = new Map();
  for (const a of rows) {
    if (!byTenant.has(a.tenant_id)) byTenant.set(a.tenant_id, []);
    byTenant.get(a.tenant_id).push(a);
  }

  const row = (appt, status) => ({ name: appt.name, status, tenantId: appt.tenant_id, time: hhmm(startMinute(appt)) });

  const remindTenant = async ([tenantId, list]) => {
    const out = [];
    // Retry mode only: a tenant that was part-way through must not re-send to
    // a phone it already reached.
    let already = null;
    if (onlySet) {
      const since = new Date(now() - DEDUPE_WINDOW_MS).toISOString();
      const logged = await readAllRows(db, 'whatsapp_messages', {
        columns: 'id, recipient_phone, status',
        filter: (q) => q.eq('tenant_id', tenantId).eq('message_type', 'reminder').gte('created_at', since),
      });
      if (logged.error || !logged.complete) throw new Error('could not check which reminders already went out - not re-sending blind');
      already = new Set((logged.data || []).filter((m) => m.status === 'sent' || m.status === 'pending_manual').map((m) => String(m.recipient_phone)));
    }

    for (const appt of list) {
      try {
        if (isPersonal(appt)) continue; // her own blocked-out time has nobody to remind
        if (tenantPaused(tenantId)) { out.push(row(appt, 'מושהה (השהיית אוטומציות)')); continue; }
        if (!remindersEnabled(tenantId)) { out.push(row(appt, 'מושבת (הגדרות)')); continue; }
        if (!appt.client_phone) { out.push(row(appt, STATUS_NO_PHONE)); continue; }
        if (already && already.has(String(appt.client_phone))) { out.push(row(appt, 'כבר נשלח')); continue; }

        const s = settingsByTenant[tenantId] || {};
        const businessName = s.business_name || 'העסק';
        const brandJson = s.branding && typeof s.branding === 'object' ? s.branding : {};
        const address = String(brandJson.public_address || brandJson.address || '').trim();
        const arrivalNote = String(brandJson.arrival_note || '').trim();
        const durationText = durationHe(appt.duration);
        // Signed, and dated: the links die three days after the appointment.
        const { confirmUrl: confirmLink, cancelUrl: cancelLink } = confirmLinks(baseUrl, appt.id, { date: appt.date });

        const message = lines(
          greet(appt.name),
          `תזכורת לתור שלך ב${businessName} מחר.`,
          '',
          durationText ? `${appt.service} · ${durationText}` : appt.service,
          `${hebrewDate(appt.date)}, ${timeRange(startMinute(appt), appt.duration)}`,
          address ? '' : null,
          address ? `📍 ${address}` : null,
          address ? mapsLink(address) : null,
          arrivalNote ? '' : null,
          arrivalNote || null,
          '',
          `לאישור: ${confirmLink}`,
          `אם לא מתאים, אפשר לשנות כאן: ${cancelLink}`
        );

        const res = await send(appt.client_phone, message, { name: appt.name, type: 'reminder', tenantId });
        out.push(row(appt, res.ok ? 'נשלח' : res.queued ? 'ממתין לשליחה ידנית' : STATUS_FAILED));
      } catch (err) {
        // One bad appointment must not cost the tenant's remaining clients.
        console.error(`[send-reminders] ${tenantId} appointment ${appt?.id} failed:`, err?.message || String(err));
        out.push(row(appt, STATUS_FAILED));
      }
    }
    return out;
  };

  const { outcomes, summary } = await fanOut([...byTenant.entries()], remindTenant, {
    keyOf: ([tenantId]) => tenantId, concurrency, budgetMs, itemTimeoutMs, now,
  });

  const results = [];
  for (const o of outcomes) if (o.status === 'ok') results.push(...o.value);
  return { empty: false, date: tomorrow, results, fanout: summary, outcomes };
}
