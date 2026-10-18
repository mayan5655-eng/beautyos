// app/dashboard/admin/GrowRequests.tsx
//
// Read-only list on the admin panel: cosmeticians who tapped "I don't have Grow yet" in Settings > Connections and left their details,
// so the platform owner can forward them to Grow. Server component, service-role read after requirePlatformAdmin() has passed.
// The details are shown in full on purpose (they are what gets forwarded); the table is server-only (add_grow_signup_requests.sql).

import type { SupabaseClient } from '@supabase/supabase-js'

type Row = { tenant_id: string; name: string; phone: string; business_name: string; business_id: string; status: string; created_at: string }

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(d)
}

export default async function GrowRequests({ db }: { db: SupabaseClient }) {
  const { data, error } = await db
    .from('grow_signup_requests')
    .select('tenant_id, name, phone, business_name, business_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  const wrap = { direction: 'rtl' as const, fontFamily: "'Heebo','Assistant',sans-serif", marginTop: 28 }
  const note = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }

  if (error) {
    return (
      <section style={wrap}>
        <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600 }}>בקשות לפתיחת חשבון Grow</h2>
        <p style={note}>הרשימה עוד לא זמינה: צריך להריץ את add_grow_signup_requests.sql.</p>
      </section>
    )
  }

  const rows = (data || []) as Row[]
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' as const }
  return (
    <section id="grow-requests" style={wrap}>
      <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>בקשות לפתיחת חשבון Grow</h2>
      <p style={note}>קוסמטיקאיות שהשאירו פרטים ואין להן עדיין חשבון Grow. להעביר ל-Grow. תצוגה בלבד.</p>
      {rows.length === 0 ? (
        <p style={note}>עוד אין בקשות.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-sm)' }}>
            <thead>
              <tr>
                {['התקבל', 'שם', 'נייד', 'עסק', 'עוסק / ח.פ.', 'סטטוס'].map((h) => (
                  <th key={h} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenant_id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.phone}</td>
                  <td style={td}>{r.business_name}</td>
                  <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.business_id}</td>
                  <td style={td}>{r.status === 'new' ? 'חדשה' : r.status === 'forwarded' ? 'הועברה ל-Grow' : 'טופלה'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
