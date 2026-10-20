// app/dashboard/admin/SystemHealth.tsx
//
// "Is everything working?" in one card, on the admin panel. Server component: it only READS, through the service-role client the
// admin page already holds, after requirePlatformAdmin() has passed. Four rows, each a fact read just now:
//   1. scheduled jobs   each cron's last start (cron_runs, lib/cronHeartbeat.js) against its schedule
//   2. SQL files        tables / columns the code uses that the database does not have yet (the same check the nightly job runs)
//   3. alerts           errors written to ops_events in the last 24 hours
//   4. the nightly data check's own last run
// Nothing here writes. A source that cannot be read says so; it is never shown as healthy.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CRON_JOBS, CRON_JOB_HE, staleCronJobs } from '@/lib/cronHeartbeat.js'
import { readSchemaObjects } from '@/lib/invariants.js'
import { REFERENCED_TABLES, REFERENCED_COLUMNS } from '@/lib/referencedTables.js'

type Line = { label: string; ok: boolean | null; text: string; detail?: string }

const ago = (iso: string | null | undefined, now: number): string => {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return 'אף פעם'
  const m = Math.round((now - t) / 60000)
  if (m < 60) return `לפני ${Math.max(m, 1)} דק׳`
  const h = Math.round(m / 60)
  if (h < 36) return `לפני ${h} שע׳`
  return `לפני ${Math.round(h / 24)} ימים`
}

async function cronLine(db: SupabaseClient, now: number): Promise<{ line: Line; jobs: Array<{ job: string; at: string | null; late: boolean }> }> {
  const { data, error } = await db.from('cron_runs').select('job, last_run_at')
  if (error) {
    const missing = /cron_runs|PGRST205|42P01/.test(`${error.code} ${error.message}`)
    return { line: { label: 'משימות מתוזמנות', ok: null, text: missing ? 'עוד לא נמדד: צריך להריץ את kalmea-sql-cron-runs' : 'לא הצלחנו לקרוא' }, jobs: [] }
  }
  const rows = (data || []) as Array<{ job: string; last_run_at: string }>
  const stale = new Set(staleCronJobs(rows, new Date(now)).map((s) => s.job))
  const at = new Map(rows.map((r) => [r.job, r.last_run_at]))
  const jobs = Object.keys(CRON_JOBS).map((job) => ({ job, at: at.get(job) || null, late: stale.has(job) && at.has(job) }))
  const never = jobs.filter((j) => !j.at).length
  const late = jobs.filter((j) => j.late).length
  const ok = late === 0 && never === 0
  return {
    line: {
      label: 'משימות מתוזמנות',
      ok: late > 0 ? false : ok ? true : null,
      text: late > 0 ? `${late} לא רצו בזמן` : never > 0 ? `${jobs.length - never} מתוך ${jobs.length} כבר נרשמו (השאר עוד לא הגיע תורן)` : `כל ${jobs.length} רצו בזמן`,
    },
    jobs,
  }
}

async function schemaLine(db: SupabaseClient): Promise<Line> {
  try {
    const objs = await readSchemaObjects(db)
    const tables = new Set(objs.filter((o: { kind: string }) => o.kind === 'table').map((o: { name: string }) => o.name))
    const cols = new Set(objs.filter((o: { kind: string }) => o.kind === 'column').map((o: { name: string }) => o.name))
    const missingTables = (REFERENCED_TABLES as string[]).filter((t) => !tables.has(t))
    const missingCols: string[] = []
    for (const [t, cs] of Object.entries(REFERENCED_COLUMNS as Record<string, string[]>)) {
      if (!tables.has(t)) continue
      for (const c of cs) if (!cols.has(`${t}.${c}`)) missingCols.push(`${t}.${c}`)
    }
    const n = missingTables.length + missingCols.length
    return {
      label: 'קובצי SQL',
      ok: n === 0,
      text: n === 0 ? 'כל הטבלאות והעמודות שהקוד צריך קיימות' : `חסרים ${n} פריטים: כנראה קובץ SQL שעוד לא הורץ`,
      detail: n ? [...missingTables, ...missingCols].join(', ') : undefined,
    }
  } catch (e) {
    return { label: 'קובצי SQL', ok: null, text: `הבדיקה לא רצה: ${(e as Error).message.slice(0, 80)}` }
  }
}

async function alertsLine(db: SupabaseClient, now: number): Promise<Line> {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await db.from('ops_events').select('id', { count: 'exact', head: true }).eq('severity', 'error').gte('created_at', since)
  if (error) return { label: 'התראות', ok: null, text: 'לא הצלחנו לקרוא את יומן ההתראות' }
  return { label: 'התראות', ok: !count, text: count ? `${count} תקלות ב-24 השעות האחרונות (פירוט למטה)` : 'אין תקלות ב-24 השעות האחרונות' }
}

export default async function SystemHealth({ db }: { db: SupabaseClient }) {
  const now = Date.now()
  const [cron, schema, alerts] = await Promise.all([cronLine(db, now), schemaLine(db), alertsLine(db, now)])
  const nightly = cron.jobs.find((j) => j.job === 'invariants')
  const lines: Line[] = [
    cron.line,
    schema,
    alerts,
    { label: 'בדיקת נתונים לילית', ok: nightly?.at ? !nightly.late : null, text: nightly?.at ? `רצה ${ago(nightly.at, now)}` : 'עוד לא נרשמה' },
  ]
  const allOk = lines.every((l) => l.ok === true)
  const anyBad = lines.some((l) => l.ok === false)

  return (
    <section id="system-health" dir="rtl" style={{ fontFamily: 'var(--sans)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 18px', margin: '24px 0', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h2 style={{ fontFamily: 'var(--display-heavy)', fontSize: 22, fontWeight: 800, color: 'var(--brand-accent)', margin: 0 }}>בריאות המערכת</h2>
        <span style={{
          fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 10px',
          background: anyBad ? 'var(--k-petal)' : allOk ? 'var(--k-sage)' : 'var(--surface-2)',
          color: anyBad ? 'var(--brand-highlight-text)' : allOk ? 'var(--brand-accent)' : 'var(--ink-3)',
        }}>{anyBad ? 'יש מה לבדוק' : allOk ? 'הכל תקין' : 'חלקי'}</span>
      </div>
      {lines.map((l) => (
        <div key={l.label} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)', alignItems: 'flex-start' }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: l.ok === true ? 'var(--brand-sage, #7C846B)' : l.ok === false ? 'var(--brand-highlight, #B26557)' : 'var(--line-2)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{l.label}</div>
            <div style={{ fontSize: 13, color: l.ok === false ? 'var(--brand-highlight-text)' : 'var(--ink-2)', lineHeight: 1.6 }}>{l.text}</div>
            {l.detail && <div dir="ltr" style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'right', overflowWrap: 'anywhere' }}>{l.detail}</div>}
          </div>
        </div>
      ))}
      {cron.jobs.length > 0 && (
        <details style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <summary style={{ fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>כל המשימות</summary>
          {cron.jobs.map((j) => (
            <div key={j.job} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '5px 0', color: j.late ? 'var(--brand-highlight-text)' : 'var(--ink-2)' }}>
              <span>{CRON_JOB_HE[j.job as keyof typeof CRON_JOB_HE] || j.job}</span>
              <span>{ago(j.at, now)}</span>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}
