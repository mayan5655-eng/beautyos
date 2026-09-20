// lib/outboundCap.js
//
// A daily ceiling on WhatsApp messages that a STRANGER can cause the platform
// number to send, per tenant.
//
// ── Why ────────────────────────────────────────────────────────────────────
// Three public routes end in a send from the platform's WhatsApp number to a
// phone the caller chose: book-appointment (a confirmation to the booked
// number and an alert to the owner), skin-scan/send (a report to the named
// phone and a hot-lead alert to the owner), and the bot's reply on the
// inbound webhook. Each has a per-IP and per-tenant burst limit, but those
// live in memory per serverless instance, so the real ceiling is the limit
// times the number of warm instances, and they reset on every cold start.
// None of them bounds a whole day.
//
// This does. It counts what actually went out - rows in whatsapp_messages -
// so it is the same number on every instance and survives a redeploy.
//
// ── What counts ────────────────────────────────────────────────────────────
// Only the message types the public paths produce (PUBLIC_TYPES), and only
// rows that were SENT. A refused or failed attempt does not move the counter:
// a flood of junk numbers sends nothing and should not lock out a real
// booking. The types are counted regardless of which route produced them -
// an owner alert from the claim route is the same message as one from the
// public booking page, and the ceiling is on the number, not the door.
//
// Reminders, receipts, win-back and every other automated type are NOT here.
// They are gated by the session, the cron secret or a toggle she owns, and a
// busy day of reminders must never be blocked because a stranger was busy
// on her booking page.
//
// ── The number ─────────────────────────────────────────────────────────────
// 120 in a rolling 24 hours, tunable with WHATSAPP_PUBLIC_DAILY_CAP. A full
// solo clinic day is around ten bookings (twenty messages), a handful of
// skin scans (ten more) and some bot chatter; 120 is well past that and well
// short of what makes a number get reported. Rolling rather than midnight so
// there is no timezone to get wrong and no reset moment to time an attack at.
//
// ── When it trips ──────────────────────────────────────────────────────────
// The send is refused and logged as failed with the reason, so it shows in
// her message log and on the dashboard's failure card, and ONE WhatsApp goes
// to the support number per tenant per window, so the operator hears about
// it once rather than 300 times.
//
// ── Fails open ─────────────────────────────────────────────────────────────
// If the count cannot be read the send goes ahead. This is a cost control,
// not a security boundary (lib/ai/callCaps.ts states the same rule): a
// database wobble must not stop a real client's booking confirmation.

export const PUBLIC_TYPES = new Set([
  'booking_confirm',
  'owner_alert',
  'skin_report',
  'skin_lead_alert',
  'ai_agent_reply',
]);

export const DEFAULT_DAILY_CAP = 120;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const ALERT_TYPE = 'cap_alert';
export const CAP_ENV = 'WHATSAPP_PUBLIC_DAILY_CAP';

/** The configured ceiling, or the default when the env var is unset or junk. */
export function dailyCap(env = process.env) {
  const n = Number(env[CAP_ENV]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

export function isPublicType(type) {
  return PUBLIC_TYPES.has(String(type || ''));
}

/**
 * Sent public messages for a tenant in the window ending now.
 * @returns {Promise<number | null>} null when the count could not be read
 */
export async function publicSendsInWindow(db, tenantId, now = Date.now()) {
  const since = new Date(now - WINDOW_MS).toISOString();
  const { count, error } = await db
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .in('message_type', [...PUBLIC_TYPES])
    .gte('created_at', since);
  if (error) return null;
  return Number(count) || 0;
}

/** Has the operator already been told about this tenant in the window? */
export async function alertedInWindow(db, tenantId, now = Date.now()) {
  const since = new Date(now - WINDOW_MS).toISOString();
  const { count, error } = await db
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('message_type', ALERT_TYPE)
    .gte('created_at', since);
  if (error) return null;
  return (Number(count) || 0) > 0;
}

export function formatCapAlert({ tenantId, count, cap }) {
  const short = String(tenantId || '').slice(0, 8);
  return [
    'BloomOS ✦ תקרת הודעות ציבוריות',
    '',
    `העסק ${short} הגיע ל-${count} הודעות מנתיבים ציבוריים ב-24 השעות האחרונות (תקרה: ${cap}).`,
    'הודעות נוספות מהזמנות אונליין, מסורק העור ומהבוט נחסמות עד שהחלון יתפנה.',
    'אם זה עסק אמיתי בשיא עומס, אפשר להעלות את WHATSAPP_PUBLIC_DAILY_CAP. אם לא, זה ניסיון ניצול.',
  ].join('\n');
}

/**
 * Decide whether one more public send may go out, and alert the operator the
 * first time it may not. Never throws.
 *
 * @param {object} p
 * @param {any}    p.db             supabase client (service role)
 * @param {string} p.tenantId
 * @param {string} p.type           the message type about to be sent
 * @param {(phone: string, text: string, opts: object) => Promise<any>} p.send
 * @param {string} [p.operatorPhone]
 * @param {number} [p.cap]
 * @param {number} [p.now]
 * @param {{warn: Function, error: Function}} [p.log]
 * @returns {Promise<{allowed: boolean, count: number | null, cap: number, alerted: boolean}>}
 */
export async function enforcePublicCap({ db, tenantId, type, send, operatorPhone, cap, now = Date.now(), log = console }) {
  const ceiling = cap ?? dailyCap();
  const result = { allowed: true, count: null, cap: ceiling, alerted: false };
  if (!isPublicType(type) || !tenantId) return result;

  let count;
  try {
    count = await publicSendsInWindow(db, tenantId, now);
  } catch (err) {
    log.error('[outboundCap] count threw; failing open:', err?.message || String(err));
    return result;
  }
  if (count === null) {
    log.error('[outboundCap] count could not be read; failing open');
    return result;
  }
  result.count = count;
  if (count < ceiling) return result;

  result.allowed = false;
  log.warn(`[outboundCap] tenant ${tenantId} at ${count}/${ceiling} public sends in 24h; refusing ${type}`);

  const opPhone = String(operatorPhone || '').trim();
  if (!opPhone) return result;
  try {
    const already = await alertedInWindow(db, tenantId, now);
    if (already) return result;
    await send(opPhone, formatCapAlert({ tenantId, count, cap: ceiling }), {
      name: 'BloomOS',
      type: ALERT_TYPE,
      tenantId,
    });
    result.alerted = true;
  } catch (err) {
    log.error('[outboundCap] operator alert failed:', err?.message || String(err));
  }
  return result;
}
