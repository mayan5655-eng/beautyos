// lib/opsAlert.js
//
// Tell Kalmea's operator that something needs attention - on THREE channels,
// so no single outage silences it:
//   1. the Vercel log (console.error), always;
//   2. the admin panel: a row in public.ops_events, shown at /dashboard/admin,
//      written BEFORE WhatsApp is attempted so it exists even if everything
//      after it fails;
//   3. a WhatsApp message to the operator's number.
//
// Why not WhatsApp alone. The alert used to be one WhatsApp message through the
// central GreenAPI number - the very number whose silence it was meant to
// report. If that session is disconnected the alert cannot arrive, and GreenAPI
// answers 200 either way, so even "sent" proved nothing: on 2026-10-01 twelve
// nightly alerts sat logged as sent while none arrived. So the delivery outcome
// is recorded honestly: `handed_to_greenapi` (never "delivered"),
// `queued_not_sent`, `failed`, `timed_out`, or `no_operator_number`.
//
// Never throws. A cron that is trying to report a failure must not be the
// thing that fails because the report did: a missing table, a database error,
// a hung WhatsApp call - each is contained, logged, and reflected in the result.
//
// The table arrives with add_ops_events.sql, run by hand; until it has run the
// helper says so in the log and returns `recorded: false, logProblem:
// 'table_missing'` while still attempting WhatsApp.

const SEVERITIES = new Set(['info', 'warning', 'error']);

/**
 * @param {object} o
 * @param {any} o.db service-role supabase client
 * @param {(phone: string, text: string, opts: object) => Promise<any>} [o.send]
 * @param {string} [o.to] operator's WhatsApp number
 * @param {string} o.source which job raised it (e.g. 'send-reminders')
 * @param {'info'|'warning'|'error'} [o.severity]
 * @param {string} o.message
 * @param {object} [o.details]
 * @param {number} [o.timeoutMs] how long to wait for WhatsApp before moving on
 * @returns {Promise<{ recorded: boolean, delivery: string, logProblem?: string }>}
 */
export async function raiseOpsAlert({ db, send, to, source, severity = 'error', message, details = null, timeoutMs = 15000 }) {
  const sev = SEVERITIES.has(severity) ? severity : 'error';
  // Channel 1: the log. Unconditional, and first.
  console.error(`[ops-alert] ${source} (${sev}): ${message}`);

  // Channel 2: the admin panel, before WhatsApp is touched.
  let id = null;
  let logProblem;
  try {
    const { data, error } = await db
      .from('ops_events')
      .insert({ source, severity: sev, message, details, whatsapp_delivery: 'pending' })
      .select('id')
      .single();
    if (error) {
      logProblem = /ops_events|PGRST205|42P01/.test(`${error.code} ${error.message}`) ? 'table_missing' : 'insert_failed';
      console.error(
        logProblem === 'table_missing'
          ? '[ops-alert] ops_events table does not exist - run add_ops_events.sql; the alert is in this log and (if it can) WhatsApp only'
          : `[ops-alert] could not record the alert in ops_events: ${error.message}`
      );
    } else {
      id = data?.id ?? null;
    }
  } catch (e) {
    logProblem = 'insert_failed';
    console.error('[ops-alert] recording the alert threw:', e?.message || String(e));
  }

  // Channel 3: WhatsApp, bounded.
  let delivery = 'no_operator_number';
  let whatsappError;
  if (to && send) {
    let timer;
    try {
      const res = await Promise.race([
        send(to, message, { name: 'Kalmea', type: 'invariants' }),
        new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('timed out'), { timedOut: true })), timeoutMs); }),
      ]);
      // ok === GreenAPI answered 200. That is a hand-over, not a delivery.
      delivery = res && res.ok ? 'handed_to_greenapi' : res && res.queued ? 'queued_not_sent' : 'failed';
      if (delivery === 'failed') whatsappError = JSON.stringify(res || {}).slice(0, 300);
    } catch (e) {
      delivery = e?.timedOut ? 'timed_out' : 'failed';
      whatsappError = e?.message || String(e);
      console.error(`[ops-alert] WhatsApp to the operator ${delivery}: ${whatsappError}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Record what WhatsApp did.
  if (id) {
    try {
      await db.from('ops_events').update({
        whatsapp_delivery: delivery,
        details: whatsappError ? { ...(details || {}), whatsapp_error: whatsappError } : details,
      }).eq('id', id);
    } catch (e) {
      console.error('[ops-alert] could not record the WhatsApp outcome:', e?.message || String(e));
    }
  }

  return { recorded: id !== null, delivery, ...(logProblem ? { logProblem } : {}) };
}
