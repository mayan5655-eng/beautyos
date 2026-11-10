// lib/waCloud/autoRun.ts
//
// SERVER ONLY. The hourly run of the automatic messages (app/api/wa-auto/run). Injected dependencies, so the plain-node
// test drives it with an in-memory database, a fake clock and the stub adapter.
//
// Each hour, for every business that turned the feature on:
//   1. the reminder of every upcoming appointment whose moment has come (lib/waCloud/autoPlan.ts reminderPlan): about
//      `leadHours` before the visit, never in quiet hours or on Shabbat / yom tov, never under two hours before it, and
//      not at all for a booking made inside the reminder window (she just got the booking confirmation);
//   2. the booking confirmations that were held overnight (claims in status 'deferred').
// Everything refused lands in her manual send queue once (the claim records it), and each business with something
// waiting gets one notice.
//
// Dormant unless WA_AUTO_ENABLED=true: returns before reading anything.

import { autoConfig, tenantOptedIn, tenantLeadHours, type AutoConfig } from './autoConfig.ts';
import { sendAutoMessage, autoMigrationReady, CLAIMS_TABLE, type AutoOutcome, type Alert } from './auto.ts';
import { reminderPlan, reminderSendAt, autoAllowedNow, upcomingDays, type YomTov } from './autoPlan.ts';
import { israelLocalToUtcMs } from './policy.ts';
import { autoParams, reminderQueueText, bookingQueueText } from './autoContent.ts';
import type { WaCloudAdapter } from './adapter.ts';
import type { WaCloudEnv } from './config.ts';
import { readAllRows } from '../pagedRead.js';
import { fillPhonesFromClients } from '../reminders/dailyReminders.js';
import { startMinute } from '../apptTime.ts';
import { isPersonal } from '../calendarKind.ts';
import { isDemoTenantId } from '../demoTenants.ts';
import { isMissingColumnError } from '../pgError.ts';
import { automationsPaused, remindersEnabled } from '../automationPause.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };
type Settings = { tenant_id: string; business_name?: string | null; branding?: unknown; automations?: unknown; reminders_enabled?: boolean | null };
type Appt = {
  id: string; tenant_id: string; name?: string | null; service?: string | null; date: string; hour?: number | null;
  start_minute?: number | null; duration?: number | null; client_phone?: string | null; client_id?: string | null;
  confirmation_status?: string | null; kind?: string | null;
};

export type AutoRunDeps = {
  /** sendWhatsApp, used ONLY with forceManual: the queue fallback. */
  queue: (phone: string, text: string, opts: Record<string, unknown>) => Promise<unknown>;
  confirmLinks: (origin: string, id: string, o: { date?: string | null }) => { confirmUrl: string; cancelUrl: string };
  baseUrl: string;
  isYomTov?: YomTov;
  adapter?: WaCloudAdapter;
  alert?: Alert;
};

export type AutoRunResult = {
  dormant?: boolean;
  dryRun?: boolean;
  migrationMissing?: boolean;
  tenants: number;
  sent: number;
  queued: number;
  held: number;
  deferredSent: number;
  skipped: number;
  dry: number;
  queuedByTenant: Record<string, number>;
  stoppedEarly: boolean;
};

const COLS = 'id, tenant_id, name, service, date, hour, start_minute, duration, client_phone, client_id, confirmation_status';
const LOOKAHEAD_DAYS = 3;

export async function runAutoMessages(o: { db: Db; deps: AutoRunDeps; now?: Date; env?: WaCloudEnv; budgetMs?: number; clock?: () => number }): Promise<AutoRunResult> {
  const env = o.env || process.env;
  const cfg: AutoConfig = autoConfig(env);
  const res: AutoRunResult = { tenants: 0, sent: 0, queued: 0, held: 0, deferredSent: 0, skipped: 0, dry: 0, queuedByTenant: {}, stoppedEarly: false };
  if (!cfg.enabled) return { ...res, dormant: true };
  res.dryRun = cfg.dryRun;

  const db = o.db;
  const now = o.now || new Date();
  const clock = o.clock || (() => Date.now());
  const t0 = clock();
  const budget = o.budgetMs ?? 200_000;
  const mode: 'live' | 'mock' = cfg.active ? 'live' : 'mock';

  if (!(await autoMigrationReady(db))) {
    // Nothing is claimed without the tables, so nothing may be sent or queued: queueing hourly would repeat every message.
    if (o.deps.alert) await o.deps.alert('wa-auto:migration', 'Automatic WhatsApp messages are ON but add_wa_auto_messages.sql has not run: nothing is being sent', null, { severity: 'error', key: 'migration' });
    return { ...res, migrationMissing: true };
  }

  // reminders_enabled: her reminder switch, honoured below as the daily path does. Asked for, with a fallback for a database
  // without the column (then reminders stay on, exactly as the daily path reads a missing value).
  const SETTINGS_COLS = 'tenant_id, business_name, branding, automations';
  let st = await readAllRows(db, 'settings', { columns: SETTINGS_COLS + ', reminders_enabled', order: 'tenant_id' });
  if (st.error && isMissingColumnError(st.error)) st = await readAllRows(db, 'settings', { columns: SETTINGS_COLS, order: 'tenant_id' });
  if (st.error || !st.complete) throw new Error(`settings read failed: ${st.error?.message || 'incomplete'}`);
  const settings = new Map<string, Settings>();
  const anySettings = new Map<string, Settings>();
  for (const s of (st.data || []) as Settings[]) {
    anySettings.set(s.tenant_id, s);
    // Opted in and NOT paused (her master switch, lib/automationPause.js): a paused business gets no reminders at all.
    // sendAutoMessage's gate checks the pause again, for every caller.
    if (tenantOptedIn(s) && !automationsPaused(s) && !isDemoTenantId(s.tenant_id)) settings.set(s.tenant_id, s);
  }
  res.tenants = settings.size;

  // Booking confirmations held from quiet hours / Shabbat, loaded by their OWN pending state: not by the visit's date
  // (a night booking for a visit weeks away is still owed its confirmation at 08:00) and not by whether the business is
  // still opted in (one that turned it off since gets the message in her manual queue instead).
  const df = await readAllRows(db, CLAIMS_TABLE, {
    columns: 'idempotency_key, tenant_id, appointment_id, kind, mode, status, created_at', order: 'idempotency_key',
    filter: (q: { eq: Function }) => (q.eq('kind', 'booking_confirm') as unknown as { eq: Function }).eq('mode', mode).eq('status', 'deferred'),
  });
  if (df.error || !df.complete) throw new Error(`${CLAIMS_TABLE} deferred read failed: ${df.error?.message || 'incomplete'}`);
  type Claim = { idempotency_key: string; tenant_id: string; appointment_id: string; status: string; created_at: string };
  const deferred = (df.data || []) as Claim[];

  if (settings.size === 0 && deferred.length === 0) return res;
  const ids = [...settings.keys()];

  const days = upcomingDays(now, LOOKAHEAD_DAYS);
  const load = (cols: string) => readAllRows(db, 'appointments', {
    columns: cols,
    filter: (q: { in: Function }) => (q.in('tenant_id', ids) as unknown as { in: Function }).in('date', days),
  });
  let ap: { data: unknown[] | null; error: { message?: string } | null; complete: boolean } = { data: [], error: null, complete: true };
  if (ids.length) {
    ap = await load(COLS + ', kind');
    if (ap.error && isMissingColumnError(ap.error)) ap = await load(COLS);
    if (ap.error || !ap.complete) throw new Error(`appointments read failed: ${ap.error?.message || 'incomplete'}`);
  }
  const appts = ((ap.data || []) as Appt[]).filter((a) => a.confirmation_status !== 'cancelled' && !isPersonal(a));
  await fillPhonesFromClients(db, appts);

  // The deferred confirmations' own appointments, by id, whatever their date (cancelled ones too, so they are recognised).
  const deferredAppt = new Map<string, Appt>();
  for (const a of appts) deferredAppt.set(a.id, a);
  const missing = [...new Set(deferred.map((c) => c.appointment_id).filter((id) => !deferredAppt.has(id)))];
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const r = await readAllRows(db, 'appointments', { columns: COLS, filter: (q: { in: Function }) => q.in('id', chunk) });
    if (r.error || !r.complete) throw new Error(`deferred appointments read failed: ${r.error?.message || 'incomplete'}`);
    const rows = (r.data || []) as Appt[];
    await fillPhonesFromClients(db, rows.filter((a) => a.confirmation_status !== 'cancelled'));
    for (const a of rows) deferredAppt.set(a.id, a);
  }

  // Booking confirmations of the last days: a booking made inside the reminder window gets no reminder on top, and the
  // ones held overnight are sent below.
  const since = new Date(now.getTime() - 4 * 86400_000).toISOString();
  const cl = await readAllRows(db, CLAIMS_TABLE, {
    columns: 'idempotency_key, tenant_id, appointment_id, kind, mode, status, created_at', order: 'idempotency_key',
    filter: (q: { in: Function }) => (q.in('tenant_id', ids) as unknown as { eq: Function }).eq('kind', 'booking_confirm').eq('mode', mode).gte('created_at', since),
  });
  if (cl.error || !cl.complete) throw new Error(`${CLAIMS_TABLE} read failed: ${cl.error?.message || 'incomplete'}`);
  const bookingClaims = new Map<string, Claim>();
  for (const c of (cl.data || []) as Claim[]) bookingClaims.set(c.appointment_id, c);

  const outOfTime = () => clock() - t0 > budget;
  const count = (out: AutoOutcome, tenantId: string, queued: boolean) => {
    if (out.outcome === 'dry_run') res.dry++;
    else if (out.outcome === 'held') res.held++;
    if (queued) { res.queued++; res.queuedByTenant[tenantId] = (res.queuedByTenant[tenantId] || 0) + 1; }
  };
  const queue = async (appt: Appt, text: string, type: string) => {
    try {
      await o.deps.queue(String(appt.client_phone || ''), text, { name: appt.name, type, tenantId: appt.tenant_id, forceManual: true });
      return true;
    } catch (e) {
      console.error(`[wa-auto] ${appt.tenant_id} queue fallback failed for ${appt.id}:`, (e as Error)?.message || String(e));
      return false;
    }
  };

  // 1. reminders
  for (const appt of appts) {
    if (outOfTime()) { res.stoppedEarly = true; break; }
    const s = settings.get(appt.tenant_id);
    if (!s || !appt.client_phone) { res.skipped++; continue; }
    // She turned reminders off (settings.reminders_enabled = false): nothing is sent and nothing is queued. Her booking
    // confirmations are a separate matter and still go (they have no switch of their own).
    if (!remindersEnabled(s)) { res.skipped++; continue; }
    const lead = tenantLeadHours(s, cfg);
    const sm = startMinute(appt);
    const plan = reminderPlan({ date: appt.date, startMinute: sm, leadHours: lead, now, isYomTov: o.deps.isYomTov });
    if (plan === 'held') { res.held++; continue; }
    if (plan !== 'due') continue;
    const bc = bookingClaims.get(appt.id);
    if (bc && sm !== null) {
      const sendAt = reminderSendAt(israelLocalToUtcMs(appt.date, sm), lead);
      if (new Date(bc.created_at).getTime() >= sendAt - 60 * 60 * 1000) { res.skipped++; continue; }
    }
    try {
      const out = await sendAutoMessage({
        db, tenantId: appt.tenant_id, kind: 'reminder', appointmentId: appt.id, phone: String(appt.client_phone), name: appt.name,
        clientId: appt.client_id, apptDate: appt.date, params: autoParams(appt, s), settingsRow: s, now, env, adapter: o.deps.adapter, alert: o.deps.alert, isYomTov: o.deps.isYomTov,
      });
      if (out.outcome === 'sent') res.sent++;
      if (out.outcome === 'paused' || out.outcome === 'reminders_off') res.skipped++;
      let queued = false;
      if (out.outcome === 'fallback') queued = await queue(appt, reminderQueueText(appt, s, o.deps.confirmLinks(o.deps.baseUrl, appt.id, { date: appt.date })), 'reminder');
      count(out, appt.tenant_id, queued);
    } catch (e) {
      console.error(`[wa-auto] ${appt.tenant_id} reminder ${appt.id} failed:`, (e as Error)?.message || String(e));
    }
  }

  // 2. booking confirmations held overnight (or over Shabbat / yom tov), at the first allowed hour
  if (autoAllowedNow(now, o.deps.isYomTov)) {
    for (const c of deferred) {
      if (outOfTime()) { res.stoppedEarly = true; break; }
      // Take it: only the run whose update still finds it deferred sends it.
      const { data: taken, error } = await db.from(CLAIMS_TABLE).update({ status: 'claimed', updated_at: now.toISOString() })
        .eq('idempotency_key', c.idempotency_key).eq('status', 'deferred').select('idempotency_key');
      if (error || !Array.isArray(taken) || taken.length === 0) continue;
      const settle = (status: string, detail: string) =>
        db.from(CLAIMS_TABLE).update({ status, detail, updated_at: now.toISOString() }).eq('idempotency_key', c.idempotency_key);
      const appt = deferredAppt.get(c.appointment_id);
      const sm = appt ? startMinute(appt) : null;
      const startMs = appt && sm !== null ? israelLocalToUtcMs(appt.date, sm) : NaN;
      // Skipped ONLY when there is nothing left to confirm: the appointment was deleted or cancelled, or its time has passed.
      if (!appt || appt.tenant_id !== c.tenant_id || appt.confirmation_status === 'cancelled') {
        await settle('skipped', 'appointment cancelled or removed before the morning'); res.skipped++; continue;
      }
      if (Number.isFinite(startMs) && startMs <= now.getTime()) {
        await settle('skipped', 'the visit time passed before the confirmation could go'); res.skipped++; continue;
      }
      const s = settings.get(c.tenant_id);
      const cancelUrl = () => o.deps.confirmLinks(o.deps.baseUrl, appt.id, { date: appt.date }).cancelUrl;
      if (!s) {
        // She turned the automatic messages off (or paused her automations) overnight: the confirmation is still owed,
        // from her own WhatsApp. Not an automatic send.
        const queued = appt.client_phone ? await queue(appt, bookingQueueText(appt, anySettings.get(c.tenant_id) || {}, cancelUrl()), 'booking_confirm') : false;
        await settle('fallback', 'automatic messages turned off before the morning: her manual queue');
        if (queued) { res.queued++; res.queuedByTenant[c.tenant_id] = (res.queuedByTenant[c.tenant_id] || 0) + 1; }
        continue;
      }
      const out = await sendAutoMessage({
        db, tenantId: appt.tenant_id, kind: 'booking_confirm', appointmentId: appt.id, phone: String(appt.client_phone || ''), name: appt.name,
        clientId: appt.client_id, apptDate: appt.date, params: autoParams(appt, s), settingsRow: s, fromDeferred: true, now, env, adapter: o.deps.adapter, alert: o.deps.alert, isYomTov: o.deps.isYomTov,
      });
      let queued = false;
      if (out.outcome === 'sent') {
        res.deferredSent++;
        await db.from('appointments').update({ confirmation_sent: true }).eq('id', appt.id).eq('tenant_id', appt.tenant_id);
      } else if (out.outcome === 'fallback' || out.outcome === 'paused') {
        if (appt.client_phone) queued = await queue(appt, bookingQueueText(appt, s, cancelUrl()), 'booking_confirm');
      } else if (out.outcome === 'held') {
        // Became quiet between the check and the send: give it back for the next run.
        await db.from(CLAIMS_TABLE).update({ status: 'deferred' }).eq('idempotency_key', c.idempotency_key);
      }
      count(out, appt.tenant_id, queued);
    }
  }
  return res;
}


