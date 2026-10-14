// app/dashboard/admin/GrowOnboarding.tsx
//
// Read-only list on the admin panel: the merchant-onboarding updates Grow posted to /api/grow/webhook, and whether each
// one was attached to a tenant. Server component, service-role read after requirePlatformAdmin() has passed.
//
// What it shows: when, the business title and name Grow reported, Grow's own status message, the package, the tracking
// code and the match state. What it never shows: the api_key (never stored) or the full user_id - only the masked form
// (lib/grow/payload.maskUserId), enough to recognise, not enough to use. Nothing here can change anything.

import type { SupabaseClient } from '@supabase/supabase-js'
import { maskUserId } from '@/lib/grow/payload'

type Row = {
  id: string
  received_at: string
  user_id: string | null
  tracking_code: string | null
  business_title: string | null
  name: string | null
  package_name: string | null
  tracking_status_message: string | null
  grow_error: string | null
  match_state: 'unmatched' | 'matched' | 'conflict'
  matched_tenant_id: string | null
}

const STATE_HE: Record<Row['match_state'], { label: string; color: string }> = {
  unmatched: { label: 'לא שויך לעסק', color: '#9A6B00' },
  matched: { label: 'שויך לעסק', color: '#2F7D57' },
  conflict: { label: 'התנגשות - כבר מחוברת ל-Grow אחרת', color: '#B4453C' },
}

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(d)
}

export default async function GrowOnboarding({ db }: { db: SupabaseClient }) {
  const { data, error } = await db
    .from('grow_onboarding_updates')
    .select('id, received_at, user_id, tracking_code, business_title, name, package_name, tracking_status_message, grow_error, match_state, matched_tenant_id')
    .order('received_at', { ascending: false })
    .limit(50)

  const wrap = { direction: 'rtl' as const, fontFamily: "'Heebo','Assistant',sans-serif", marginTop: 28 }
  const note = { fontSize: 'var(--t-sm)', color: '#5C4F63', lineHeight: 1.7 }

  if (error) {
    // The table is created by add_grow_onboarding.sql, run by hand: say so rather than show an empty list.
    return (
      <section style={wrap}>
        <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600 }}>הצטרפות ל-Grow</h2>
        <p style={note}>הרשימה עוד לא זמינה: צריך להריץ את add_grow_onboarding.sql.</p>
      </section>
    )
  }

  const rows = (data || []) as Row[]
  return (
    <section style={wrap}>
      <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>הצטרפות ל-Grow</h2>
      <p style={note}>
        עדכוני הצטרפות ש-Grow שלחה. תצוגה בלבד. מזהה העסק מוסתר חלקית, ואף מפתח לא נשמר.
      </p>
      {rows.length === 0 ? (
        <p style={note}>עוד לא התקבל עדכון.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-sm)' }}>
            <thead>
              <tr>
                {['התקבל', 'עסק', 'שם', 'חבילה', 'סטטוס אצל Grow', 'קוד מעקב', 'מזהה', 'שיוך'].map((h) => (
                  <th key={h} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #E7DFEC', color: '#5C4F63', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATE_HE[r.match_state] || STATE_HE.unmatched
                const td = { padding: '8px 10px', borderBottom: '1px solid #F1EBF4', verticalAlign: 'top' as const }
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.received_at)}</td>
                    <td style={td}>{r.business_title || '—'}</td>
                    <td style={td}>{r.name || '—'}</td>
                    <td style={td}>{r.package_name || '—'}</td>
                    <td style={td}>{r.tracking_status_message || r.grow_error || '—'}</td>
                    <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.tracking_code || '—'}</td>
                    <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.user_id ? maskUserId(r.user_id) : '—'}</td>
                    <td style={{ ...td, color: s.color, fontWeight: 600 }}>{s.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
