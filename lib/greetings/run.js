// lib/greetings/run.js
//
// The database side of personal greetings, shared by the screen (preview) and the daily job (queue).
// The planning rules are in greetings.js; this file only reads rows, calls the planner and, for the job, queues messages.
//
// Reads are always one tenant. A read that is not complete (a partial client list or first-visit list) makes the whole thing refuse:
// a partial log would queue a greeting twice, a partial appointment list would congratulate someone on the wrong year.

import { readAllRows } from '../pagedRead.js';
import {
  normalizeGreetings, planGreetings, selectDue, sendWindow, israelToday, addDays,
  GREETING_TYPES, LEGACY_BIRTHDAY_TYPE, logKey, anyGreetingOn,
} from './greetings.js';
import { explicitBirthdayOffer } from '../birthdayOffer.js';

export const PREVIEW_DAYS = 7;
const CLIENT_COLUMNS = 'id, tenant_id, name, phone, birthday, status, marketing_consent, marketing_consent_at, marketing_opted_out_at';

async function readAll(db, table, opts) {
  const r = await readAllRows(db, table, opts);
  if (r.error) throw new Error(`${table} read failed: ${r.error.message}`);
  if (!r.complete) throw new Error(`${table} could not be read completely (${r.fetched}/${r.total})`);
  return r.data || [];
}

/** First real visit per client: the earliest non-cancelled appointment that is not in the future. */
export function firstVisitsOf(appointments, today) {
  const first = {};
  for (const a of appointments || []) {
    if (!a.client_id || !a.date) continue;
    const d = String(a.date).slice(0, 10);
    if (d > today || a.confirmation_status === 'cancelled') continue;
    if (!first[a.client_id] || d < first[a.client_id]) first[a.client_id] = d;
  }
  return first;
}

/**
 * Everything the planner needs for one tenant, and the plan itself.
 * @param {any} o
 */
export async function planForTenant({ db, tenantId, config, now = new Date(), days = PREVIEW_DAYS, holidaysFor, isYomTov }) {
  const today = israelToday(now);
  const { data: settingsRows, error } = await db.from('settings').select('business_name, automations').eq('tenant_id', tenantId).limit(1);
  if (error) throw new Error(`settings read failed: ${error.message}`);
  const settings = settingsRows?.[0] || null;
  const automations = settings?.automations && typeof settings.automations === 'object' ? settings.automations : {};
  const cfg = normalizeGreetings(config ?? automations.greetings);

  const clients = await readAll(db, 'clients', { columns: CLIENT_COLUMNS, filter: (q) => q.eq('tenant_id', tenantId) });
  const appts = cfg.anniversary.enabled
    ? await readAll(db, 'appointments', { columns: 'id, client_id, date, confirmation_status', filter: (q) => q.eq('tenant_id', tenantId) })
    : [];
  const logRows = await readAll(db, 'auto_reminders_log', {
    columns: 'id, client_id, reminder_type, reference_id',
    filter: (q) => q.eq('tenant_id', tenantId).in('reminder_type', [...Object.values(GREETING_TYPES), LEGACY_BIRTHDAY_TYPE]),
  });
  const sent = new Set(logRows.map((r) => logKey(r.client_id, r.reminder_type, r.reference_id || '')));

  const to = addDays(today, days - 1);
  const plan = planGreetings({
    clients, firstVisit: firstVisitsOf(appts, today), config: cfg, sent,
    holidays: cfg.holiday.enabled ? holidaysFor(now, days + 3) : [],
    from: today, to, today,
    businessName: settings?.business_name || '',
    birthdayGift: explicitBirthdayOffer(automations),
    isYomTov,
  });
  return { cfg, today, to, clientCount: clients.length, ...plan };
}

/** Greetings of this tenant already queued or sent in the last 24 hours (the daily cap counts them). */
export async function greetingsInLast24h(db, tenantId, now = Date.now()) {
  const since = new Date(now - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db.from('whatsapp_messages').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).in('message_type', Object.values(GREETING_TYPES).map((t) => `auto_${t}`)).gte('created_at', since);
  return error ? null : count ?? 0;
}

/**
 * Queue today's greetings for ONE tenant. `send` is lib/whatsapp.js sendWhatsApp; greeting types are outreach, so it can only
 * queue them for her (never send). Returns an honest account: queued / sent / failed / why nothing.
 */
export async function queueGreetingsForTenant({ db, send, tenantId, now = new Date(), holidaysFor, isYomTov, dryRun = false }) {
  const out = { tenantId, queued: 0, sent: 0, failed: 0, logFailed: 0, deferred: 0, held: null, results: [] };
  const win = sendWindow(now, { isYomTov });
  if (!win.ok) { out.held = win.reason; return out; }
  const plan = await planForTenant({ db, tenantId, now, days: 1, holidaysFor, isYomTov });
  if (!anyGreetingOn(plan.cfg)) { out.held = 'off'; return out; }
  const already = await greetingsInLast24h(db, tenantId, now.getTime());
  // The cap counts what already went into her queue; if it cannot be counted, nothing is queued.
  if (already === null) { out.held = 'cap_unreadable'; return out; }
  const { selected, deferred } = selectDue({ items: plan.items, today: plan.today, alreadyToday: already, cap: plan.cfg.daily_cap });
  out.deferred = deferred.length;
  for (const it of selected) {
    if (dryRun) { out.results.push({ name: it.name, occasion: it.occasion, status: 'preview' }); continue; }
    const type = GREETING_TYPES[it.occasion];
    const res = await send(it.phone, it.message, { name: it.name, type: `auto_${type}`, tenantId });
    if (res && (res.ok || res.queued)) {
      const { error } = await db.from('auto_reminders_log').insert({ tenant_id: tenantId, client_id: it.clientId, reminder_type: type, reference_id: it.ref });
      if (error) { out.logFailed++; console.error(`[greetings] queued but NOT LOGGED (may repeat tomorrow): ${tenantId}|${it.clientId}|${type} - ${error.message}`); }
      if (res.ok) out.sent++; else out.queued++;
      out.results.push({ name: it.name, occasion: it.occasion, status: res.ok ? 'sent' : 'queued' });
    } else {
      out.failed++;
      out.results.push({ name: it.name, occasion: it.occasion, status: 'failed' });
    }
  }
  return out;
}
