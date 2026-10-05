// app/dashboard/admin/OpsEvents.tsx
//
// The operator-alert log, on the admin panel. Server component: it only READS,
// through the service-role client the admin page already holds, after
// requirePlatformAdmin() has passed. Written by lib/opsAlert.js.
//
// This is the channel that does not depend on WhatsApp. An alert used to be one
// WhatsApp message through the same central number whose disconnection it
// reported, so it could not arrive exactly when it mattered; here it is a row in
// a table you read in a browser, and next to it is what WhatsApp did with it.
// "Handed to GreenAPI" is shown as exactly that - never "delivered" - because
// GreenAPI answers 200 whether or not a phone ever receives the message.

import type { SupabaseClient } from '@supabase/supabase-js'

type Event = {
  id: string
  created_at: string
  source: string
  severity: 'info' | 'warning' | 'error'
  message: string
  details: Record<string, unknown> | null
  whatsapp_delivery: string
}

const DELIVERY_HE: Record<string, { label: string; ok: boolean }> = {
  handed_to_greenapi: { label: 'נמסר ל-GreenAPI (לא מבטיח שהגיע לטלפון)', ok: true },
  queued_not_sent: { label: 'לא נשלח - ממתין בתור ידני', ok: false },
  failed: { label: 'השליחה נכשלה', ok: false },
  timed_out: { label: 'השליחה נתקעה', ok: false },
  no_operator_number: { label: 'לא הוגדר מספר למפעילה', ok: false },
  pending: { label: 'בתהליך', ok: false },
}
const SEVERITY: Record<Event['severity'], { label: string; color: string }> = {
  error: { label: 'תקלה', color: '#B4453C' },
  warning: { label: 'אזהרה', color: '#9A6B00' },
  info: { label: 'מידע', color: '#4A5B54' },
}

export default async function OpsEvents({ db }: { db: SupabaseClient }) {
  const { data, error } = await db
    .from('ops_events')
    .select('id, created_at, source, severity, message, details, whatsapp_delivery')
    .order('created_at', { ascending: false })
    .limit(30)

  const box: React.CSSProperties = { marginTop: 28, padding: 16, border: '1px solid #E4DED3', borderRadius: 12, background: '#fff', direction: 'rtl' }
  const title = <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>התראות מערכת</h2>

  if (error) {
    const missing = /ops_events|PGRST205|42P01/.test(`${error.code} ${error.message}`)
    return (
      <section style={box}>
        {title}
        <p style={{ color: '#B4453C', fontSize: 'var(--t-md)' }}>
          {missing
            ? 'יומן ההתראות עדיין לא קיים בבסיס הנתונים - צריך להריץ את add_ops_events.sql. עד אז התראות נרשמות רק ביומן של Vercel ובוואטסאפ.'
            : `לא הצלחנו לקרוא את יומן ההתראות: ${error.message}`}
        </p>
      </section>
    )
  }

  const events = (data || []) as Event[]
  return (
    <section style={box}>
      {title}
      <p style={{ color: '#4A5B54', fontSize: 'var(--t-sm)', marginBottom: 12 }}>
        כל מה שהמערכת רצתה לספר לך - נרשם כאן לפני שנשלח לוואטסאפ, כך שגם אם וואטסאפ מנותק ההתראה לא הולכת לאיבוד.
      </p>
      {events.length === 0 ? (
        <p style={{ color: '#4A5B54', fontSize: 'var(--t-md)' }}>אין התראות. זה טוב.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map((e) => {
            const d = DELIVERY_HE[e.whatsapp_delivery] || { label: e.whatsapp_delivery, ok: false }
            const sev = SEVERITY[e.severity] || SEVERITY.error
            return (
              <li key={e.id} style={{ borderInlineStart: `4px solid ${sev.color}`, paddingInlineStart: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 'var(--t-sm)' }}>
                  <strong style={{ color: sev.color }}>{sev.label}</strong>
                  <span style={{ fontWeight: 600 }}>{e.source}</span>
                  <time dateTime={e.created_at} style={{ color: '#4A5B54' }} dir="ltr">
                    {new Date(e.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                  </time>
                  <span style={{ color: d.ok ? '#2E6B4A' : '#B4453C' }}>וואטסאפ: {d.label}</span>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--t-md)', margin: '4px 0 0' }}>{e.message}</pre>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
