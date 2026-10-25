// app/dashboard/admin/ShareEvents.tsx
//
// "Can they get their posts onto their phones?" on the admin panel: the last 14 days of the save/share panel
// (app/design/SaveShare.jsx), counted by phone family. Server component, read-only, through the service-role client
// the admin page already holds after requirePlatformAdmin(). Written by /api/designs/share-event.
//
// Built 2026-10-24, the day a customer reported she could not download or share a post: nothing in the system had
// noticed. A line here with many "opened" and few "shared"/"download" is the same failure, seen without a complaint.

import type { SupabaseClient } from '@supabase/supabase-js'

type Row = { created_at: string; tenant_id: string; outcome: string; device: string | null; in_app: string | null; can_share: boolean | null; source: string | null }

const DEVICE_HE: Record<string, string> = { ios: 'אייפון', android: 'אנדרואיד', desktop: 'מחשב' }
const SOURCE_HE: Record<string, string> = {
  editor: 'עורך העיצוב', advanced: 'עורך מתקדם', reel: 'רילס', plan: 'תוכנית התוכן', mine: 'העיצובים שלי',
  photo: 'צילום אחרי טיפול', ownreel: 'רילס מהתמונות שלה',
}
const COLS: Array<[string, string]> = [
  ['opened', 'נפתח החלון'],
  ['shared', 'שותף'],
  ['download', 'הורדה'],
  ['posted', 'סומן שפורסם'],
  ['cancelled', 'ביטלה'],
  ['gesture', 'נדרשה לחיצה נוספת'],
  ['failed', 'נכשל'],
]

export default async function ShareEvents({ db }: { db: SupabaseClient }) {
  const since = new Date(Date.now() - 14 * 864e5).toISOString()
  const { data, error } = await db
    .from('share_events')
    .select('created_at, tenant_id, outcome, device, in_app, can_share, source')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  const box: React.CSSProperties = { marginTop: 28, padding: 16, border: '1px solid #E4DED3', borderRadius: 12, background: '#fff', direction: 'rtl' }
  const title = <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>שמירה ושיתוף פוסטים (14 יום)</h2>

  if (error) {
    const missing = /share_events|PGRST205|42P01/.test(`${error.code} ${error.message}`)
    return (
      <section style={box}>
        {title}
        <p style={{ color: '#B4453C', fontSize: 'var(--t-md)' }}>
          {missing ? 'הספירה עוד לא פעילה - צריך להריץ את add_share_events.sql (kalmea-sql-share-events.txt בשולחן העבודה).' : `לא הצלחנו לקרוא: ${error.message}`}
        </p>
      </section>
    )
  }

  const rows = (data || []) as Row[]
  const byDevice = new Map<string, Record<string, number>>()
  const tenants = new Map<string, number>()
  // Which feature the finished post came from: opened, and got out (shared or downloaded).
  const bySource = new Map<string, { opened: number; out: number }>()
  let inApp = 0, noShare = 0, opened = 0
  for (const r of rows) {
    const src = bySource.get(r.source || '') || { opened: 0, out: 0 }
    if (r.outcome === 'opened') src.opened++
    if (r.outcome === 'shared' || r.outcome === 'download') src.out++
    bySource.set(r.source || '', src)
    const key = r.device || 'desktop'
    const counts = byDevice.get(key) || {}
    counts[r.outcome] = (counts[r.outcome] || 0) + 1
    byDevice.set(key, counts)
    if (r.outcome === 'opened') {
      opened++
      if (r.in_app) inApp++
      if (r.can_share === false) noShare++
      tenants.set(r.tenant_id, (tenants.get(r.tenant_id) || 0) + 1)
    }
  }
  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #EEE8DD', textAlign: 'center', fontSize: 'var(--t-sm)' }

  return (
    <section style={box}>
      {title}
      <p style={{ color: '#4A5B54', fontSize: 'var(--t-sm)', marginBottom: 12 }}>
        כל פעם שעסק מסיים פוסט או רילס ומגיע לחלון &quot;הפוסט מוכן&quot;. הרבה &quot;נפתח החלון&quot; ומעט &quot;שותף&quot; או &quot;הורדה&quot; = משהו לא עובד בטלפונים.
        {' '}שמירה בלחיצה ארוכה על התמונה לא נספרת (הדפדפן לא מדווח עליה).
      </p>
      {rows.length === 0 ? (
        <p style={{ color: '#4A5B54', fontSize: 'var(--t-md)' }}>עוד אין נתונים.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: 'right' }}>מכשיר</th>
                  {COLS.map(([k, he]) => <th key={k} style={cell}>{he}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...byDevice.entries()].map(([dev, c]) => (
                  <tr key={dev}>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{DEVICE_HE[dev] || dev}</td>
                    {COLS.map(([k]) => <td key={k} style={{ ...cell, color: (k === 'failed' || k === 'gesture') && c[k] ? '#B4453C' : undefined }}>{c[k] || 0}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#4A5B54', fontSize: 'var(--t-sm)', marginTop: 10 }}>
            {tenants.size} עסקים פתחו את החלון {opened} פעמים. מתוכן {inApp} מתוך דפדפן של אינסטגרם/פייסבוק, ו-{noShare} בדפדפן שלא יודע לשתף קבצים.
          </p>
          <p data-testid="share-by-source" style={{ color: '#4A5B54', fontSize: 'var(--t-sm)', marginTop: 6 }}>
            לפי מקור:{' '}
            {[...bySource.entries()].sort((a, b) => b[1].opened - a[1].opened)
              .map(([src, c]) => `${SOURCE_HE[src] || 'לא ידוע'} ${c.opened} נפתחו, ${c.out} שותפו/הורדו`).join(' · ')}
          </p>
        </>
      )}
    </section>
  )
}
