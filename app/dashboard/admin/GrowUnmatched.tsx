// app/dashboard/admin/GrowUnmatched.tsx
//
// Admin panel: Grow onboarding updates that arrived WITHOUT a way to match a business (no tracking code, or a code no pending
// registration of ours carries). Each one can be attached to a business picked by search (GrowAttach.tsx), which posts to
// /api/admin/grow-onboarding: the webhook's own attach code, admin-checked, rate-limited and logged to ops_events.
//
// Server component, service-role read after requirePlatformAdmin() has passed on the page. What it shows: the time, the business
// title and name Grow reported, Grow's status words, the package, the tracking code, the business id MASKED
// (lib/grow/payload.maskUserId) and whether a key came with it (yes/no). What it never shows: a key (none is ever stored) or the
// full business id. Below the list: updates Grow sent that could not be read at all (ops_events grow:onboarding-ignored), with the
// field NAMES only, so a new Grow format is visible. Those cannot be attached: nothing of them was stored.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoTenantId } from '@/lib/demoTenants'
import { formatIlTime as fmt, toAttachRow, type AttachTenant, type UnmatchedRaw } from '@/lib/grow/adminOnboarding'
import GrowAttach from './GrowAttach'

export default async function GrowUnmatched({ db }: { db: SupabaseClient }) {
  const wrap = { direction: 'rtl' as const, fontFamily: "'Heebo','Assistant',sans-serif", marginTop: 28 }
  const note = { fontSize: 'var(--t-sm)', color: '#5C4F63', lineHeight: 1.7 }
  const title = <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>עדכוני Grow שלא שויכו לעסק</h2>

  const { data, error } = await db
    .from('grow_onboarding_updates')
    .select('id, received_at, user_id, tracking_code, business_title, name, package_name, tracking_status_message, grow_status, grow_error, had_api_key')
    .eq('match_state', 'unmatched')
    .order('received_at', { ascending: false })
    .limit(30)
  if (error) {
    return (
      <section id="grow-unmatched" style={wrap}>
        {title}
        <p style={note}>הרשימה עוד לא זמינה: צריך להריץ את add_grow_onboarding.sql.</p>
      </section>
    )
  }
  const rows = ((data || []) as UnmatchedRaw[]).map(toAttachRow)

  let tenants: AttachTenant[] = []
  if (rows.length) {
    const t = await db.from('tenants').select('id, name').order('name').limit(2000)
    tenants = ((t.data || []) as { id: string; name: string | null }[])
      .filter((x) => !isDemoTenantId(x.id))
      .map((x) => ({ id: x.id, name: x.name || '' }))
  }

  // Unreadable updates: field names only, never values (the webhook writes nothing else for them).
  const ign = await db
    .from('ops_events')
    .select('id, created_at, details')
    .eq('source', 'grow:onboarding-ignored')
    .order('created_at', { ascending: false })
    .limit(10)
  const ignored = (ign.error ? [] : (ign.data || [])) as { id: string; created_at: string; details: { fields?: unknown } | null }[]

  return (
    <section id="grow-unmatched" style={wrap}>
      {title}
      <p style={note}>
        עדכון שהגיע מ-Grow בלי קוד מעקב שמזהה עסק. בוחרים את העסק בחיפוש ולוחצים &quot;שיוך&quot;, וזה נרשם בדיוק כמו עדכון שזוהה לבד.
        מזהה העסק מוסתר חלקית, ואף מפתח לא נשמר.
      </p>
      {rows.length === 0 ? (
        <p style={note}>אין כרגע עדכונים שמחכים לשיוך.</p>
      ) : (
        <GrowAttach rows={rows} tenants={tenants} />
      )}
      {ignored.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ ...note, fontWeight: 600 }}>עדכונים שלא הצלחנו לקרוא (שמות השדות בלבד, אי אפשר לשייך אותם):</p>
          <ul style={{ ...note, margin: '4px 0 0', paddingInlineStart: 18 }}>
            {ignored.map((e) => (
              <li key={e.id}>
                {fmt(e.created_at)}: <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{String(e.details?.fields ?? '').slice(0, 300) || 'ללא שדות'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
