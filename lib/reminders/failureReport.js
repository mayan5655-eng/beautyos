// lib/reminders/failureReport.js
//
// The push half of the send log: when tomorrow's appointment reminders fail,
// tell the cosmetician tonight, not when the client does not turn up.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The WhatsApp tab has a log of every send, including the failures. It is
// pull: she has to think to go and look, at 20:00, on the one night something
// went wrong. Nothing about a failed reminder announced itself, so the first
// she heard of it was an empty chair the next morning. REVIEW.md (cosmetician
// F3) named this as the real gap behind the log.
//
// ── Who gets told ──────────────────────────────────────────────────────────
// Two audiences, two messages, both only when there is something to say:
//
//   * HER - one WhatsApp per tenant that had a failure, listing who was not
//     reached and when their appointment is, so she can send the reminder
//     herself from the calendar. Sent to settings.business_phone, which is
//     already the owner's alert number for a new booking (lib/bookingNotify.js)
//     and for a hot skin-scan lead (app/api/skin-scan/send). No new setting,
//     no new column: the number she gave for alerts is where alerts go.
//
//   * THE OPERATOR - one line to the platform's support number when any
//     tenant had a failure, because a run where every send fails is a
//     GreenAPI outage, not a wrong phone number, and that is ours to fix.
//     Same channel as the nightly invariants report.
//
// Silence means every reminder went out. A message means look.
//
// ── What it must never do ──────────────────────────────────────────────────
// Fail the reminder run. The reminders have already been sent by the time this
// runs; a report that threw would turn a partial failure into a 500 that hides
// the results the log needs. Every send here is caught, and the caller catches
// the whole thing again.
//
// `send` is injected so the whole path is provable without a network:
// test-reminder-failure-report.js drives it with a fake sender.

import { lines, hebrewDate, MARK } from '../messages.js';
import { toWhatsAppNumber } from '../phone.ts';

// The two result statuses that mean "this client is not going to be reminded".
// Exactly the strings send-reminders writes into its results, so a rename
// there is a test failure here rather than a report that quietly goes empty.
export const STATUS_FAILED = 'נכשל';
export const STATUS_NO_PHONE = 'אין מספר טלפון';

// Message types written to whatsapp_messages by the two sends below.
export const TYPE_OWNER = 'reminder_failure';
export const TYPE_OPERATOR = 'reminder_failure_ops';

/**
 * Group a reminder run's results by tenant, keeping only the rows that mean a
 * client will not be reminded.
 *
 * @param {Array<{name?: string, status?: string, tenantId?: string, time?: string}>} results
 * @returns {Map<string, {failed: Array<{name: string, time: string}>, noPhone: Array<{name: string, time: string}>}>}
 */
export function groupReminderResults(results) {
  const byTenant = new Map();
  for (const r of results || []) {
    if (!r || !r.tenantId) continue;
    if (r.status !== STATUS_FAILED && r.status !== STATUS_NO_PHONE) continue;
    if (!byTenant.has(r.tenantId)) byTenant.set(r.tenantId, { failed: [], noPhone: [] });
    const group = byTenant.get(r.tenantId);
    const row = { name: String(r.name || '').trim() || 'לקוחה', time: String(r.time || '').trim() };
    (r.status === STATUS_FAILED ? group.failed : group.noPhone).push(row);
  }
  return byTenant;
}

const who = (row) => (row.time ? `• ${row.name} — ${row.time}` : `• ${row.name}`);

/**
 * The message to the cosmetician. Null when there is nothing to report, and
 * the caller must treat null as "send nothing" - an "all clear" every night
 * is a message that stops being read within a fortnight.
 *
 * @param {{date: string, failed: Array<{name: string, time: string}>, noPhone: Array<{name: string, time: string}>}} p
 * @returns {string | null}
 */
export function formatOwnerReport({ date, failed = [], noPhone = [] }) {
  if (!failed.length && !noPhone.length) return null;
  const failedHead =
    failed.length === 1 ? 'תזכורת אחת לא נשלחה:' : `${failed.length} תזכורות לא נשלחו:`;
  const noPhoneHead =
    noPhone.length === 1 ? 'תור אחד ללא מספר טלפון:' : `${noPhone.length} תורים ללא מספר טלפון:`;
  return lines(
    `BloomOS ${MARK} תזכורות ל${hebrewDate(date)}`,
    '',
    failed.length ? failedHead : null,
    ...failed.map(who),
    failed.length ? 'כדאי לשלוח להן תזכורת ידנית מהיומן.' : null,
    noPhone.length ? '' : null,
    noPhone.length ? noPhoneHead : null,
    ...noPhone.map(who),
    noPhone.length ? 'כשתוסיפי מספר בכרטיס הלקוחה, התזכורת הבאה תישלח לבד.' : null
  );
}

/**
 * The one line to the operator. Only real send failures count here: a client
 * with no phone is her data to fix, not an outage.
 *
 * @param {{date: string, byTenant: Map<string, {failed: unknown[]}>}} p
 * @returns {string | null}
 */
export function formatOperatorReport({ date, byTenant }) {
  let failures = 0;
  let tenants = 0;
  for (const group of byTenant.values()) {
    if (group.failed.length) { failures += group.failed.length; tenants++; }
  }
  if (!failures) return null;
  const tenantWord = tenants === 1 ? 'עסק אחד' : `${tenants} עסקים`;
  return `תזכורות ל${hebrewDate(date)}: ${failures} לא נשלחו (${tenantWord}). הפירוט בלוג של send-reminders.`;
}

/**
 * Send the reports. Never throws; every outcome is in the returned summary and
 * in the log.
 *
 * @param {object} p
 * @param {Array}  p.results          the run's results, with tenantId and time
 * @param {string} p.date             the appointments' date, YYYY-MM-DD
 * @param {Record<string, any>} p.settingsByTenant  tenant_id -> settings row
 * @param {(phone: string, text: string, opts: object) => Promise<{ok?: boolean}>} p.send
 * @param {string} [p.operatorPhone]  NEXT_PUBLIC_SUPPORT_WHATSAPP, or nothing
 * @param {{warn: Function, error: Function}} [p.log]
 * @returns {Promise<{owners: Array<{tenantId: string, status: string}>, operator: string | null}>}
 */
export async function reportReminderFailures({ results, date, settingsByTenant, send, operatorPhone, log = console }) {
  const byTenant = groupReminderResults(results);
  const summary = { owners: [], operator: null };

  for (const [tenantId, group] of byTenant) {
    const text = formatOwnerReport({ date, ...group });
    if (!text) continue;
    const rawPhone = settingsByTenant?.[tenantId]?.business_phone;
    if (!toWhatsAppNumber(rawPhone)) {
      // Not an error: she has not given a number for alerts. The failure is
      // still in her message log and on her dashboard; it just cannot be
      // pushed. Logged so an operator reading the run can see who is silent.
      log.warn(`[send-reminders] failure report: tenant ${tenantId} has no usable business_phone; not sent`);
      summary.owners.push({ tenantId, status: 'no_owner_phone' });
      continue;
    }
    try {
      const res = await send(rawPhone, text, { name: 'BloomOS', type: TYPE_OWNER, tenantId });
      summary.owners.push({ tenantId, status: res && res.ok ? 'sent' : 'failed' });
    } catch (err) {
      log.error(`[send-reminders] failure report to tenant ${tenantId} threw:`, err?.message || String(err));
      summary.owners.push({ tenantId, status: 'failed' });
    }
  }

  const operatorText = formatOperatorReport({ date, byTenant });
  const opPhone = String(operatorPhone || '').trim();
  if (operatorText && opPhone) {
    try {
      const res = await send(opPhone, operatorText, { name: 'BloomOS', type: TYPE_OPERATOR });
      summary.operator = res && res.ok ? 'sent' : 'failed';
    } catch (err) {
      log.error('[send-reminders] operator report threw:', err?.message || String(err));
      summary.operator = 'failed';
    }
  } else if (operatorText) {
    summary.operator = 'no_operator_phone';
  }

  return summary;
}
