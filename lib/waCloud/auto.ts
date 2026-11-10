// lib/waCloud/auto.ts
//
// SERVER ONLY. The automatic reminder and booking confirmation through Meta's Cloud API, for ONE appointment.
// Called by the hourly run (lib/waCloud/autoRun.ts, the reminder and deferred confirmations) and by lib/bookingNotify.js
// (the confirmation right after an online booking).
//
// Off unless THREE things are true: WA_AUTO_ENABLED=true (the kill switch, lib/waCloud/autoConfig.ts), the business
// turned it on herself (settings.automations.wa_auto_messages === true), and live mode with every credential. With
// WA_AUTO_ENABLED unset this returns 'dormant' before it reads anything, and every caller carries on exactly as before.
//
// Outcomes, and what the caller does with each:
//   dormant / not_opted_in  nothing happened: send the way it always did (her queue or the central number).
//   dry_run                 WA_AUTO_ENABLED but not live: the decision was logged as a mock row, nothing was sent.
//                           Carry on as before.
//   sent                    Meta accepted it (a wamid). Accepted is not delivered: the webhook records delivery.
//   duplicate               this appointment already had this message (idempotency key). Send nothing.
//   deferred                a booking confirmation in quiet hours / Shabbat: claimed, the hourly run sends it at the first
//                           allowed hour. Send nothing now.
//   held                    a reminder in quiet hours / Shabbat: nothing claimed, the next hourly run tries again.
//   fallback                refused here (client asked to stop, a ceiling, the migration has not run, Meta's error):
//                           put the message in her manual send queue (sendWhatsApp with forceManual). Never silently
//                           dropped, and never quietly re-sent through another automatic channel.
//
// Cost safety, in order: the kill switch, her opt-in, the client's opt-out, quiet hours and rest days, one claim per
// (mode, kind, appointment) taken in the database BEFORE the send (wa_auto_claims, primary key), the three ceilings
// (lib/waCloud/caps.ts), and then a moneyAlert each time the month's estimated spend crosses WA_AUTO_SPEND_ALERT_USD.
// Every decision is a row in the cost log (wa_cloud_messages) with its estimated cost.

import { autoConfig, tenantOptedIn, type AutoConfig } from './autoConfig.ts';
import { buildAutoTemplate, WA_AUTO_TEMPLATES, type AutoKind } from './autoTemplates.ts';
import { confirmExpiry } from '../confirmToken.ts';
import { autoAllowedNow, type YomTov } from './autoPlan.ts';
import { checkCaps, countAccepted } from './caps.ts';
import { israelMonthStartIso, israelMonthKey, israelDayStartIso } from './policy.ts';
import { utilityCostUsd, type WaCloudEnv } from './config.ts';
import { resolveWaCloudAdapter, mockAdapter, type WaCloudAdapter } from './adapter.ts';
import { recipientHash } from './send.ts';
import { toWhatsAppNumber, normalizeIsraeliMobile } from '../phone.ts';
import { isDemoTenantId } from '../demoTenants.ts';
import { suppressionHash, phoneVariants } from '../clientData.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };
export type Alert = (source: string, message: string, details?: Record<string, unknown> | null, opts?: { severity?: 'warning' | 'error'; key?: string }) => Promise<unknown>;

export const CLAIMS_TABLE = 'wa_auto_claims';
export const OPTOUT_TABLE = 'wa_auto_optouts';
const LOG_TABLE = 'wa_cloud_messages';

export type AutoOutcome =
  | { outcome: 'dormant' }
  | { outcome: 'not_opted_in' }
  | { outcome: 'dry_run'; status: 'accepted' | 'refused' | 'held' | 'deferred' | 'duplicate'; reason: string | null }
  | { outcome: 'sent'; messageId: string; preview: string }
  | { outcome: 'duplicate' }
  | { outcome: 'deferred' }
  | { outcome: 'held' }
  | { outcome: 'fallback'; reason: string; detail: string };

export function idempotencyKey(mode: 'live' | 'mock', kind: AutoKind, appointmentId: string): string {
  return `${mode}:${kind}:${String(appointmentId).toLowerCase()}`;
}

const isUniqueViolation = (e: { code?: string } | null | undefined) => !!e && e.code === '23505';

let defaultAlert: Alert | null = null;
async function realAlert(): Promise<Alert> {
  if (!defaultAlert) {
    const mod = await import('../moneyAlert.js');
    defaultAlert = mod.moneyAlert as Alert;
  }
  return defaultAlert;
}

/**
 * Has this client asked not to get automatic messages from this business? true / false, or null when the record cannot
 * be read (the migration has not run): the caller treats null as "do not send automatically".
 * Respects the existing consent records too: a client who already wrote "הסר" (marketing_opted_out_at on her card, or the
 * hashed marketing_suppressions record that outlives a deleted card) is not sent automatic messages either.
 */
export async function isAutoOptedOut(db: Db, tenantId: string, digits: string, clientId?: string | null): Promise<boolean | null> {
  try {
    const { data, error } = await db.from(OPTOUT_TABLE).select('tenant_id').eq('tenant_id', tenantId).eq('recipient_hash', recipientHash(digits)).limit(1);
    if (error) return null;
    if (Array.isArray(data) && data.length > 0) return true;
  } catch {
    return null;
  }
  // The older records are best-effort: a read that fails here does not block (the dedicated table above answered).
  try {
    const e164 = normalizeIsraeliMobile(digits);
    if (e164.ok) {
      const { data } = await db.from('marketing_suppressions').select('tenant_id').eq('tenant_id', tenantId).eq('phone_hash', suppressionHash(tenantId, e164.e164)).limit(1);
      if (Array.isArray(data) && data.length > 0) return true;
    }
  } catch { /* not decisive */ }
  try {
    let q = db.from('clients').select('id, marketing_opted_out_at').eq('tenant_id', tenantId);
    if (clientId) q = q.eq('id', clientId);
    else {
      const v = phoneVariants(digits);
      if (!v.length) return false;
      q = q.in('phone', v);
    }
    const { data } = await q.limit(5);
    if (Array.isArray(data) && data.some((c: { marketing_opted_out_at?: string | null }) => !!c.marketing_opted_out_at)) return true;
  } catch { /* not decisive */ }
  return false;
}

/** Records "no more automatic messages" for this number in this business. Returns false when it could not be written. */
export async function recordAutoOptOut(db: Db, tenantId: string, digits: string, source: 'button' | 'reply'): Promise<boolean> {
  try {
    const { error } = await db.from(OPTOUT_TABLE).upsert({ tenant_id: tenantId, recipient_hash: recipientHash(digits), source }, { onConflict: 'tenant_id,recipient_hash' });
    if (error) { console.error('[waAuto] opt-out not recorded:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('[waAuto] opt-out threw:', (e as Error)?.message || String(e));
    return false;
  }
}

async function logRow(db: Db, row: Record<string, unknown>) {
  try {
    const { error } = await db.from(LOG_TABLE).insert(row);
    if (error) console.error('[waAuto] cost log insert failed:', error.message);
  } catch (e) {
    console.error('[waAuto] cost log insert threw:', (e as Error)?.message || String(e));
  }
}

async function setClaim(db: Db, key: string, patch: Record<string, unknown>) {
  try {
    const { error } = await db.from(CLAIMS_TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('idempotency_key', key);
    if (error) console.error('[waAuto] claim update failed:', error.message);
  } catch (e) {
    console.error('[waAuto] claim update threw:', (e as Error)?.message || String(e));
  }
}

/** Once per crossing: a moneyAlert each time the month's estimated live spend passes a multiple of the threshold. */
export async function checkSpendAlert(db: Db, o: { now: Date; env: WaCloudEnv; cfg: AutoConfig; alert: Alert }): Promise<{ crossed: boolean; estimateUsd: number | null }> {
  const n = await countAccepted(db, { tenantId: null, mode: 'live', sinceIso: israelMonthStartIso(o.now) });
  if (n === null) return { crossed: false, estimateUsd: null };
  const cost = utilityCostUsd(o.env);
  const t = o.cfg.spendAlertUsd;
  const now = n * cost;
  const before = Math.max(0, n - 1) * cost;
  const step = Math.floor(now / t);
  if (step >= 1 && step > Math.floor(before / t)) {
    await o.alert('wa-auto:spend', `WhatsApp Cloud month-to-date estimate $${now.toFixed(2)} passed $${(step * t).toFixed(2)} (${n} messages)`,
      { month: israelMonthKey(o.now), messages: n, estimateUsd: Number(now.toFixed(4)), thresholdUsd: t }, { severity: 'error', key: `${israelMonthKey(o.now)}:${step}` });
    return { crossed: true, estimateUsd: now };
  }
  return { crossed: false, estimateUsd: now };
}

export type SendAutoInput = {
  db: Db;
  tenantId: string;
  kind: AutoKind;
  appointmentId: string;
  phone: string;
  name?: string | null;
  clientId?: string | null;
  /** The four template parameters (autoContent.autoParams). */
  params: unknown[];
  /** Her settings row when the caller holds it; otherwise automations is read here (only when the feature is enabled). */
  settingsRow?: { automations?: unknown } | null;
  /** The appointment day (YYYY-MM-DD): the button payloads expire three days after it (90 days when unknown). */
  apptDate?: string | null;
  /** The hourly run sending a confirmation that was deferred at night: it already holds the claim. */
  fromDeferred?: boolean;
  now?: Date;
  env?: WaCloudEnv;
  adapter?: WaCloudAdapter;
  alert?: Alert;
  isYomTov?: YomTov;
};

export async function sendAutoMessage(p: SendAutoInput): Promise<AutoOutcome> {
  const env = p.env || process.env;
  const cfg = autoConfig(env);
  // The kill switch. Nothing below runs, nothing is read.
  if (!cfg.enabled) return { outcome: 'dormant' };
  if (!p.tenantId || isDemoTenantId(p.tenantId)) return { outcome: 'dormant' };

  const db = p.db;
  let settingsRow = p.settingsRow;
  if (settingsRow === undefined || (settingsRow && !('automations' in settingsRow))) {
    try {
      const { data, error } = await db.from('settings').select('automations').eq('tenant_id', p.tenantId).maybeSingle();
      settingsRow = error ? null : data;
    } catch { settingsRow = null; }
  }
  if (!tenantOptedIn(settingsRow)) return { outcome: 'not_opted_in' };

  const now = p.now || new Date();
  const mode: 'live' | 'mock' = cfg.active ? 'live' : 'mock';
  const tpl = WA_AUTO_TEMPLATES[p.kind];
  const digits = toWhatsAppNumber(p.phone) || '';
  const key = idempotencyKey(mode, p.kind, p.appointmentId);
  const base = {
    tenant_id: p.tenantId,
    message_type: p.kind,
    template_name: tpl.name,
    category: tpl.category,
    mode,
    recipient_hash: recipientHash(digits),
    recipient_last4: digits.slice(-4),
    appointment_id: p.appointmentId,
    origin: 'auto',
  };
  const dry = (status: 'accepted' | 'refused' | 'held' | 'deferred' | 'duplicate', reason: string | null): AutoOutcome => ({ outcome: 'dry_run', status, reason });
  const fallback = async (reason: string, detail: string, claimed: boolean): Promise<AutoOutcome> => {
    if (claimed) await setClaim(db, key, { status: 'fallback', detail: `${reason}: ${detail}`.slice(0, 500) });
    if (mode === 'mock') return dry('refused', reason);
    return { outcome: 'fallback', reason, detail };
  };

  // Quiet hours first (a held reminder claims nothing and is tried next hour), then the claim: every refusal after it is
  // recorded on the claim, so the hourly run never puts the same message in her queue twice.
  const allowed = autoAllowedNow(now, p.isYomTov);
  if (!allowed && p.kind === 'reminder') return mode === 'mock' ? dry('held', 'quiet_hours') : { outcome: 'held' };

  if (!p.fromDeferred) {
    let claimErr: { code?: string; message?: string } | null = null;
    try {
      const { error } = await db.from(CLAIMS_TABLE).insert({
        idempotency_key: key, tenant_id: p.tenantId, appointment_id: p.appointmentId, kind: p.kind, mode,
        status: allowed ? 'claimed' : 'deferred',
      });
      claimErr = error || null;
    } catch (e) { claimErr = { message: (e as Error)?.message || String(e) }; }
    if (isUniqueViolation(claimErr)) return mode === 'mock' ? dry('duplicate', null) : { outcome: 'duplicate' };
    if (claimErr) return fallback('migration_missing', `${CLAIMS_TABLE} could not be written (${claimErr.message || claimErr.code}); has add_wa_auto_messages.sql run?`, false);
    // A booking confirmation at night: held in the claim, sent by the first hourly run after 08:00.
    if (!allowed) return mode === 'mock' ? dry('deferred', 'quiet_hours') : { outcome: 'deferred' };
  } else if (!allowed) {
    return mode === 'mock' ? dry('held', 'quiet_hours') : { outcome: 'held' };
  }

  if (!digits) return fallback('invalid_phone', 'phone number is not usable', true);

  const opted = await isAutoOptedOut(db, p.tenantId, digits, p.clientId);
  if (opted === null) return fallback('migration_missing', `${OPTOUT_TABLE} could not be read (has add_wa_auto_messages.sql run?)`, true);
  if (opted) return fallback('client_opted_out', 'the client asked for no automatic messages', true);

  const alert = p.alert || (await realAlert());
  const caps = await checkCaps(db, { tenantId: p.tenantId, mode, now, env });
  if (!caps.ok) {
    await logRow(db, { ...base, status: 'refused', reason: caps.reason, error_detail: caps.detail.slice(0, 500) });
    if (mode === 'live' && caps.reason !== 'cap_unreadable') {
      await alert('wa-auto:cap', `WhatsApp automatic messages stopped by a ceiling: ${caps.detail}`, { tenantId: p.tenantId, reason: caps.reason },
        { severity: caps.reason === 'global_daily_capped' ? 'error' : 'warning', key: `${caps.reason}:${caps.reason === 'global_daily_capped' ? '' : p.tenantId}:${israelDayStartIso(now)}` });
    }
    return fallback(caps.reason, caps.detail, true);
  }

  // Each button payload is bound to this appointment, business and number, and dies three days after the visit.
  const built = buildAutoTemplate(p.kind, p.params, { appointmentId: p.appointmentId, tenantId: p.tenantId, recipient: digits, expiresAtMs: confirmExpiry(p.apptDate ?? null, now.getTime()) }, env);
  if (!built.ok) {
    await logRow(db, { ...base, status: 'refused', reason: 'bad_params', error_detail: built.error.slice(0, 500) });
    return fallback('bad_params', built.error, true);
  }

  const adapter = p.adapter || (mode === 'live' ? resolveWaCloudAdapter(env) : mockAdapter());
  const res = await adapter.sendTemplate(digits, built.payload);
  if (!res.ok) {
    await logRow(db, { ...base, status: 'failed', reason: 'meta_error', error_detail: `${res.httpStatus || ''} ${res.code || ''} ${res.error}`.trim().slice(0, 500) });
    return fallback('meta_error', res.error, true);
  }

  await logRow(db, { ...base, status: 'accepted', wa_message_id: res.messageId, cost_estimate_usd: utilityCostUsd(env) });
  await setClaim(db, key, { status: 'sent', wa_message_id: res.messageId });
  if (mode === 'mock') return dry('accepted', null);

  // Her message log, like every other send: "sent" = Meta accepted it, with the id the webhook updates delivery through.
  try {
    const { error } = await db.from('whatsapp_messages').insert({
      tenant_id: p.tenantId, recipient_name: p.name || null, recipient_phone: p.phone, message_body: built.preview,
      message_type: p.kind, status: 'sent', green_api_id: res.messageId,
    });
    if (error) console.error('[waAuto] message log insert failed:', error.message);
  } catch (e) { console.error('[waAuto] message log insert threw:', (e as Error)?.message || String(e)); }

  await checkSpendAlert(db, { now, env, cfg, alert });
  return { outcome: 'sent', messageId: res.messageId, preview: built.preview };
}

/** Has add_wa_auto_messages.sql run? One cheap read of each new table. Only called when the feature is active. */
export async function autoMigrationReady(db: Db): Promise<boolean> {
  try {
    const a = await db.from(CLAIMS_TABLE).select('idempotency_key').limit(1);
    if (a.error) return false;
    const b = await db.from(OPTOUT_TABLE).select('tenant_id').limit(1);
    return !b.error;
  } catch {
    return false;
  }
}

/** The caller should send nothing else for this message (it was sent, is already handled, or will be sent later). */
export function autoTookIt(o: AutoOutcome): boolean {
  return o.outcome === 'sent' || o.outcome === 'duplicate' || o.outcome === 'deferred' || o.outcome === 'held';
}
