// lib/moneyAlert.js
//
// One call for "something went wrong on the money path" (Grow callbacks, deposits, billing, holds).
// Until 2026-11-03 these were console.error lines inside catch blocks: Sentry never sees a caught error and nothing
// alerted, so a double payment or a refused Grow callback was visible only to someone reading Vercel logs.
//
// It goes through raiseOpsAlert (lib/opsAlert.js): the log, a row in ops_events (the admin panel) and, for 'error',
// a web push to the operator's own devices. No WhatsApp: the central number is the least reliable channel we have.
//
// Rules:
//   * Never throws, never delays the caller more than the alert's own timeout. A callback that is reporting a failure
//     must not fail because the report did.
//   * Ids and short codes only in details. Never a payload, a card token, a phone or a name.
//   * At most one alert per key per hour per server instance, so a scan of refused IPs or a cron that fails every
//     5 minutes does not become a flood of pushes. The first one is the signal; the log keeps the rest.

import { createClient } from '@supabase/supabase-js'
import { raiseOpsAlert } from './opsAlert.js'
import { opsPush } from './opsPush.js'

const WINDOW_MS = 60 * 60 * 1000
const lastSent = new Map()

let cached
function adminDb() {
  if (cached !== undefined) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return cached
}

/** True when this key was alerted within the window (and records it otherwise). Exported for tests. */
export function throttled(key, now = Date.now()) {
  const prev = lastSent.get(key)
  if (prev && now - prev < WINDOW_MS) return true
  lastSent.set(key, now)
  if (lastSent.size > 500) lastSent.clear()
  return false
}

/**
 * @param {string} source e.g. 'grow:webhook', 'billing:grow-notify'
 * @param {string} message short English line for the operator
 * @param {object|null} [details] ids and codes only
 * @param {{ severity?: 'warning'|'error', key?: string, db?: any }} [opts]
 */
export async function moneyAlert(source, message, details = null, opts = {}) {
  try {
    const key = `${source}:${opts.key || message}`
    if (throttled(key)) return { skipped: 'throttled' }
    // Only on Vercel (or with a db passed in): unit tests and local runs log, they never write to a real database or push.
    const db = opts.db || (process.env.VERCEL ? adminDb() : null)
    if (!db) { console.error(`[money-alert] ${source}: ${message} (no database to record it)`); return { skipped: 'no_db' } }
    const severity = opts.severity === 'warning' ? 'warning' : 'error'
    return await raiseOpsAlert({ db, source, severity, message, details, timeoutMs: 5000, push: severity === 'error' ? opsPush(db) : undefined })
  } catch (e) {
    console.error('[money-alert] failed to raise:', e?.message || String(e))
    return { skipped: 'failed' }
  }
}
