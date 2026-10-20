// lib/cronHeartbeat.js
//
// "Did each scheduled job actually run?" The nightly invariants check could already say that a job FAILED; it could not say that a
// job never ran at all (a changed vercel.json, a cron Vercel dropped, an expired CRON_SECRET), because a job that never starts
// writes nothing. So every cron route stamps public.cron_runs right after its auth check (markCronRun), and the nightly check
// compares each job's last stamp to how often it is scheduled (staleCronJobs).
//
// CRON_JOBS mirrors vercel.json's "crons" exactly (test-cron-heartbeat.ts pins that), with the longest gap that still counts as
// healthy: the schedule interval plus a margin for Vercel's own jitter.
//
// Never throws and never blocks the job: a missing table (add_cron_runs.sql not run yet) is logged once per call and ignored.

import { createClient } from '@supabase/supabase-js';

const HOUR = 60 * 60 * 1000;

/** job -> { path, maxGapMs }. Keep in the same order as vercel.json. */
export const CRON_JOBS = {
  'send-reminders': { path: '/api/send-reminders', maxGapMs: 26 * HOUR },
  'send-smart-reminders': { path: '/api/send-smart-reminders', maxGapMs: 26 * HOUR },
  'send-owner-evening': { path: '/api/send-owner-evening', maxGapMs: 26 * HOUR },
  'legal-receipts-retry': { path: '/api/legal-receipts/retry', maxGapMs: 26 * HOUR },
  'invariants': { path: '/api/invariants', maxGapMs: 26 * HOUR },
  'demo-reset': { path: '/api/demo/reset', maxGapMs: 26 * HOUR },
  'facebook-ad-spend': { path: '/api/facebook/ad-spend', maxGapMs: 26 * HOUR },
  'send-weekly-report': { path: '/api/send-weekly-report', maxGapMs: 8 * 24 * HOUR },
  'grow-release-holds': { path: '/api/grow/release-holds', maxGapMs: 1 * HOUR },
  'billing-charge-due': { path: '/api/billing/charge-due', maxGapMs: 26 * HOUR },
  'owner-digest': { path: '/api/owner-digest', maxGapMs: 26 * HOUR },
  'content-remind': { path: '/api/content/remind', maxGapMs: 26 * HOUR },
};

/** Hebrew names for the report. */
export const CRON_JOB_HE = {
  'send-reminders': 'תזכורות לתורים',
  'send-smart-reminders': 'תזכורות חכמות',
  'send-owner-evening': 'סיכום ערב לבעלת העסק',
  'legal-receipts-retry': 'ניסיון חוזר לקבלות',
  'invariants': 'בדיקת נתונים לילית',
  'demo-reset': 'איפוס הדמו',
  'facebook-ad-spend': 'הוצאות פרסום מפייסבוק',
  'send-weekly-report': 'דוח שבועי',
  'grow-release-holds': 'שחרור מסגרות אשראי ב-Grow',
  'owner-digest': 'סיכום בוקר על המנויות',
  'billing-charge-due': 'חיוב חודשי של מנויות',
  'content-remind': 'תזכורת בוקר ללוח התוכן',
};

const isMissingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /cron_runs/.test(String(e.message || '')));

/**
 * Stamps "this job started now". Call it right after the cron auth check. Awaited but silent on failure.
 * @param {string} job a key of CRON_JOBS
 * @param {{ from: Function }} [db] service-role client; built from the environment when not given
 */
export async function markCronRun(job, db, now = new Date()) {
  if (!CRON_JOBS[job]) return { ok: false, reason: 'unknown-job' };
  try {
    if (!db) {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: 'no-db' };
      db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    const { error } = await db.from('cron_runs').upsert({ job, last_run_at: now.toISOString() }, { onConflict: 'job' });
    if (error) {
      console.warn('[cron-heartbeat]', job, isMissingTable(error) ? 'cron_runs missing (add_cron_runs.sql not run)' : error.message);
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[cron-heartbeat]', job, e?.message || 'threw');
    return { ok: false, reason: 'threw' };
  }
}

/**
 * The jobs whose last stamp is older than their allowed gap, or that never stamped at all.
 * @param {Array<{ job: string, last_run_at: string | null }>} rows
 * @returns {Array<{ job: string, lastRunAt: string | null }>}
 */
export function staleCronJobs(rows, now = new Date()) {
  const last = new Map((rows || []).map((r) => [r.job, r.last_run_at]));
  const out = [];
  for (const [job, cfg] of Object.entries(CRON_JOBS)) {
    const at = last.get(job) || null;
    const t = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(t) || now.getTime() - t > cfg.maxGapMs) out.push({ job, lastRunAt: at });
  }
  return out;
}
