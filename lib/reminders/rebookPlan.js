// lib/reminders/rebookPlan.js
//
// "הגיע הזמן לטיפול הבא": the rebook nudge, PER SERVICE. Pure: no database, no clock, no imports beyond the rhythm helpers,
// so test-waitlist-rebook.ts proves every rule with plain arrays. Used by the daily engine (lib/reminders/smartReminders.js)
// and by the "who gets a reminder today" list in Settings (app/api/rebook/today), so the list she reads is the run.
//
// ── Where the number of days comes from, per service ───────────────────────
//   1. service_prices.rebook_days, when she typed one (add_service_rebook_days_2026-11-09.sql, run by hand).
//      0 means "never nudge for this treatment" (a yearly touch-up, a one-off).
//   2. her client's own rhythm FOR THAT TREATMENT: the median gap between that client's visits of it (lib/reminders/rebook.js),
//   3. a suggestion by the treatment's name (gel 21, pedicure 28, brows 28, lashes 42, facial 35, waxing 28, laser 42),
//   4. the business default (21 nails-only, otherwise 35), which is what the nudge always used.
// Until the migration runs, (1) is simply absent and the nudge works exactly as before, now per treatment.
//
// ── Who gets one ───────────────────────────────────────────────────────────
//   - she has NO future appointment (not cancelled): a booked client is never asked to book;
//   - the last visit OF THAT SERVICE was between N and N + 14 days ago (N + 2 when N is inferred, as before): one timely
//     nudge, not a drip. After the window the 90-day win-back is the next and only message;
//   - she was not nudged in the last COOLDOWN_DAYS days for anything, and never for this same visit;
//   - the service is not archived (she cannot book it from the link);
//   - one nudge per client per day, for the most overdue treatment.
// Consent, archived cards, phone numbers and the pause are checked by the callers, like every other promotional message.
//
// ── The log key ────────────────────────────────────────────────────────────
// auto_reminders_log.reference_id for a per-service nudge is "<last visit date>|<nudge date>|<service>". The visit date
// makes it once per visit, the nudge date gives the cooldown without trusting a created_at column, and a row written by
// the older whole-client nudge (reference_id = just the last visit date) still counts: it covers every visit up to that date.

import { typicalIntervalDays, defaultRebookDays, sinceHe, REBOOK_GRACE_DAYS, REBOOK_WINDOW_DAYS } from './rebook.js';
import { greet, lines } from '../messages.js';
import { MARKETING_FOOTER } from '../marketingConsent.js';

/** The nudge itself, in her voice. `url` is her booking link. Promotional: always carries the opt-out footer. */
export function rebookText({ name, businessName, service, daysSince, url }) {
  return lines(
    greet(name),
    `עברו כבר ${sinceHe(daysSince)} מהביקור האחרון שלך ב${businessName || 'העסק'}${service ? ` (${service})` : ''}.`,
    'הגיע הזמן לטיפול הבא? אפשר לבחור זמן שנוח לך כאן:',
    url,
    '',
    MARKETING_FOOTER
  );
}

export const REBOOK_FLAG = 'rebook_nudges';
export const COOLDOWN_DAYS = 21;
export const MIN_REBOOK_DAYS = 7;
export const MAX_REBOOK_DAYS = 365;

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * Is the nudge on for this business? OFF BY DEFAULT (opt-in: it messages her clients in her name): her own switch
 * (automations.rebook_enabled, Settings > הודעות, or the suggestion card) must be exactly true, and the platform flag
 * (automations.feature_flags.rebook_nudges, or the settings.feature_flags column) must not be an explicit false. The platform
 * key is protected from the settings save.
 */
export function rebookOn(settings) {
  const a = asObj(settings?.automations);
  const flags = { ...asObj(a.screens), ...asObj(a.feature_flags), ...asObj(settings?.feature_flags) };
  return flags[REBOOK_FLAG] !== false && a.rebook_enabled === true;
}

/** Is the platform flag letting her see the switch at all? */
export function rebookVisible(settings) {
  const a = asObj(settings?.automations);
  const flags = { ...asObj(a.screens), ...asObj(a.feature_flags), ...asObj(settings?.feature_flags) };
  return flags[REBOOK_FLAG] !== false;
}

/** A stored per-service value: null (automatic), 0 (never) or 7..365. Anything else is "automatic". */
export function cleanRebookDays(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;
  return Math.min(MAX_REBOOK_DAYS, Math.max(MIN_REBOOK_DAYS, n));
}

// Order matters: the first match wins, so the specific names come before the general ones.
const SUGGESTIONS = [
  [/מיקרובליידינג|איפור קבוע|פיגמנט|microblad|permanent/i, 0],
  [/פדיקור|pedi/i, 28],
  [/לייזר|laser/i, 42],
  [/שעווה|שעוה|הסרת שיער|שפם|wax|thread/i, 28],
  [/ריסים|ריס |lash/i, 42],
  [/גבות|גבה|brow/i, 28],
  [/ג[׳'`]ל|(?:^|\s)לק(?:\s|$)|מניקור|ציפורנ|אקריל|מבנה|mani|gel|nail/i, 21],
  [/פנים|פילינג|ניקוי עור|הידרה|מיקרונידלינג|facial|peel/i, 35],
];

/** A suggestion for this kind of treatment, by its name, or null when the name says nothing we know. 0 = not a repeat treatment. */
export function suggestedRebookDays(name, field) {
  const s = String(name || '').trim();
  if (s) for (const [re, days] of SUGGESTIONS) if (re.test(s + ' ')) return days;
  if (field === 'nails') return 21;
  return null;
}

const dayNum = (d) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
const svcKey = (s) => String(s || '').trim();

/** "YYYY-MM-DD|YYYY-MM-DD|service" -> { visit, nudged, service }; a legacy "YYYY-MM-DD" -> { visit, nudged: null, service: null }. */
export function parseRebookRef(ref) {
  const s = String(ref || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:\|(\d{4}-\d{2}-\d{2})\|(.*))?$/);
  if (!m) return null;
  return { visit: m[1], nudged: m[2] || null, service: m[3] === undefined ? null : m[3] };
}

export function rebookRef(visit, today, service) {
  return `${visit}|${today}|${svcKey(service)}`.slice(0, 200);
}

/**
 * The interval for one client's service, and where it came from.
 * @returns {{ days: number|null, source: 'service'|'rhythm'|'suggested'|'default'|'off' }}
 */
export function intervalFor({ row, visitDates, businessDefault }) {
  const own = row ? cleanRebookDays(row.rebook_days) : null;
  if (own === 0) return { days: null, source: 'off' };
  if (own) return { days: own, source: 'service' };
  const rhythm = typicalIntervalDays(visitDates);
  if (rhythm) return { days: rhythm, source: 'rhythm' };
  const sug = suggestedRebookDays(row?.name ?? '', row?.field);
  if (sug === 0) return { days: null, source: 'off' };
  if (sug) return { days: sug, source: 'suggested' };
  return { days: businessDefault, source: 'default' };
}

/**
 * Who is due a nudge today, one per client.
 * @param {object} p
 * @param {Array} p.appointments  every appointment of the businesses in question (complete read): client_id, tenant_id, date, service, confirmation_status
 * @param {string} p.today        'YYYY-MM-DD', Israel
 * @param {(tenantId: string) => Array} p.servicesFor   that business's service_prices rows (name, rebook_days, active, field)
 * @param {(tenantId: string) => number} p.defaultDaysFor
 * @param {Array} [p.logRows]     auto_reminders_log rows of type 'rebook' for these clients: { tenant_id, client_id, reference_id }
 * @param {number} [p.cooldownDays]
 * @returns {Array<{ clientId, tenantId, service, lastDate, interval, daysSince, source, referenceId }>}
 */
export function rebookDue({ appointments, today, servicesFor = () => [], defaultDaysFor = () => 35, logRows = [], cooldownDays = COOLDOWN_DAYS }) {
  const t = dayNum(today);
  const byClient = new Map();
  for (const a of appointments || []) {
    if (!a || !a.client_id || !a.date || a.confirmation_status === 'cancelled' || a.kind === 'personal') continue;
    const k = `${a.tenant_id}|${a.client_id}`;
    if (!byClient.has(k)) byClient.set(k, []);
    byClient.get(k).push(a);
  }
  const logsByClient = new Map();
  for (const r of logRows || []) {
    const ref = parseRebookRef(r?.reference_id);
    if (!ref) continue;
    const k = `${r.tenant_id}|${r.client_id}`;
    if (!logsByClient.has(k)) logsByClient.set(k, []);
    logsByClient.get(k).push(ref);
  }
  const svcCache = new Map();
  const svcMap = (tenantId) => {
    if (!svcCache.has(tenantId)) {
      const m = new Map();
      for (const r of servicesFor(tenantId) || []) {
        const key = svcKey(r?.name);
        if (!key) continue;
        // An active row wins over an archived namesake.
        if (!m.has(key) || (m.get(key).active === false && r.active !== false)) m.set(key, r);
      }
      svcCache.set(tenantId, m);
    }
    return svcCache.get(tenantId);
  };

  const out = [];
  for (const [k, list] of byClient) {
    if (list.some((a) => String(a.date).slice(0, 10) > today)) continue; // already booked
    const tenantId = list[0].tenant_id;
    const clientId = list[0].client_id;
    const logs = logsByClient.get(k) || [];
    // Cooldown: nudged (for anything) in the last cooldownDays days.
    if (logs.some((l) => l.nudged && t - dayNum(l.nudged) < cooldownDays)) continue;
    const bySvc = new Map();
    for (const a of list) {
      const d = String(a.date).slice(0, 10);
      if (d > today) continue;
      const s = svcKey(a.service);
      if (!bySvc.has(s)) bySvc.set(s, []);
      bySvc.get(s).push(d);
    }
    const services = svcMap(tenantId);
    let best = null;
    for (const [service, dates] of bySvc) {
      dates.sort();
      const lastDate = dates[dates.length - 1];
      const row = services.get(service) || null;
      if (row && row.active === false) continue; // archived: the link cannot book it
      const { days, source } = intervalFor({ row: row || { name: service }, visitDates: dates, businessDefault: defaultDaysFor(tenantId) });
      if (!days) continue;
      const daysSince = t - dayNum(lastDate);
      const grace = source === 'service' ? 0 : REBOOK_GRACE_DAYS;
      if (daysSince < days + grace || daysSince > days + REBOOK_WINDOW_DAYS) continue;
      // Already nudged for this visit (or, by an older whole-client nudge, for a visit on or after it).
      if (logs.some((l) => (l.service === null ? l.visit >= lastDate : l.visit === lastDate && l.service === service))) continue;
      const overdue = daysSince - days;
      if (!best || overdue > best.overdue || (overdue === best.overdue && service < best.service)) {
        best = { clientId, tenantId, service, lastDate, interval: days, daysSince, source, overdue };
      }
    }
    if (best) {
      const { clientId: c, tenantId: tn, service, lastDate, interval, daysSince, source } = best;
      out.push({ clientId: c, tenantId: tn, service, lastDate, interval, daysSince, source, referenceId: rebookRef(lastDate, today, service) });
    }
  }
  out.sort((a, b) => String(a.tenantId).localeCompare(String(b.tenantId)) || b.daysSince - a.daysSince || String(a.clientId).localeCompare(String(b.clientId)));
  return out;
}

/**
 * "Who gets a reminder today", for ONE business, as Settings shows it. The same rules as the daily run (rebookDue above, then
 * the run's own checks: an archived card, no phone, no marketing consent), plus who already got one today.
 * @param {object} p { settings, clients, appointments, services, logRows, today, canMarket, defaultDays }
 * @returns {{ on: boolean, visible: boolean, paused: boolean, ready: object[], skipped: object[], sentToday: object[] }}
 */
export function rebookToday({ settings, clients, appointments, services, logRows, today, canMarket, defaultDays }) {
  const byId = new Map((clients || []).map((c) => [String(c.id), c]));
  const a = asObj(settings?.automations);
  const due = rebookDue({ appointments, today, servicesFor: () => services || [], defaultDaysFor: () => defaultDays, logRows });
  const ready = [];
  const skipped = [];
  for (const r of due) {
    const c = byId.get(String(r.clientId));
    if (!c) continue;
    const item = { clientId: r.clientId, name: c.name || 'לקוחה', service: r.service, daysSince: r.daysSince, interval: r.interval, source: r.source };
    if (c.status === 'archived') continue; // she put the card away: not even listed
    if (!c.phone) skipped.push({ ...item, reason: 'no_phone' });
    else if (!canMarket(c)) skipped.push({ ...item, reason: 'no_consent' });
    else ready.push(item);
  }
  const sentToday = [];
  const seen = new Set();
  for (const r of logRows || []) {
    const ref = parseRebookRef(r?.reference_id);
    if (!ref || ref.nudged !== today || seen.has(String(r.client_id))) continue;
    seen.add(String(r.client_id));
    const c = byId.get(String(r.client_id));
    sentToday.push({ clientId: r.client_id, name: c?.name || 'לקוחה', service: ref.service || '' });
  }
  return { on: rebookOn(settings), visible: rebookVisible(settings), paused: a.paused === true, ready, skipped, sentToday };
}

export { defaultRebookDays };
