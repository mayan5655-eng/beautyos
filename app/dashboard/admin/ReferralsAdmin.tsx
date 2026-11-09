// app/dashboard/admin/ReferralsAdmin.tsx
//
// Admin panel section: "חברה מביאה חברה" (lib/referral.ts). Who referred whom, when, and where each side's free month stands
// (waiting for the first payment / held / available / used / voided), with the owner's "void" action (ReferralActions). Server
// component, service-role read after requirePlatformAdmin() has passed on the page. Shown only with NEXT_PUBLIC_REFERRALS=1; before
// add_referrals_annual_2026-11-08.sql runs it says so.

import type { SupabaseClient } from '@supabase/supabase-js'
import ReferralActions from './ReferralActions'
import { referralsEnabled, rewardStatusHe, REFERRAL_HOLD_DAYS } from '@/lib/referral'

type Ref = { id: string; referrer_tenant_id: string; referred_tenant_id: string; status: string; ineligible_reason: string | null; created_at: string; rewarded_at: string | null }
type Rw = { referral_id: string; role: 'referrer' | 'referred'; available_at: string; consumed_at: string | null; voided_at: string | null }

const STATUS_HE: Record<string, string> = { joined: 'הצטרפה, עוד לא שילמה', rewarded: 'שילמה, חודשים חולקו', ineligible: 'לא מזכה', voided: 'בוטל' }
const REASON_HE: Record<string, string> = { same_owner: 'אותה בעלת עסק', same_email: 'אותו אימייל', same_phone: 'אותו נייד' }

const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short' }).format(d)
}

export default async function ReferralsAdmin({ db }: { db: SupabaseClient }) {
  if (!referralsEnabled()) return null
  const wrap = { direction: 'rtl' as const, fontFamily: "'Heebo','Assistant',sans-serif", marginTop: 28 }
  const note = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }
  const { data, error } = await db.from('referrals').select('id, referrer_tenant_id, referred_tenant_id, status, ineligible_reason, created_at, rewarded_at').order('created_at', { ascending: false }).limit(300)
  if (error) {
    return (
      <section id="referrals" style={wrap}>
        <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600 }}>חברה מביאה חברה</h2>
        <p style={note}>הרשימה עוד לא זמינה: צריך להריץ את add_referrals_annual_2026-11-08.sql.</p>
      </section>
    )
  }
  const refs = (data || []) as Ref[]
  const ids = [...new Set(refs.flatMap((r) => [r.referrer_tenant_id, r.referred_tenant_id]))]
  const names: Record<string, string> = {}
  const rewards = new Map<string, Rw>()
  if (refs.length) {
    const [ts, rw] = await Promise.all([
      db.from('tenants').select('id, name').in('id', ids),
      db.from('referral_rewards').select('referral_id, role, available_at, consumed_at, voided_at').in('referral_id', refs.map((r) => r.id)),
    ])
    for (const t of ts.data || []) names[String(t.id)] = String(t.name || '')
    for (const r of (rw.data || []) as Rw[]) rewards.set(`${r.referral_id}:${r.role}`, r)
  }
  const now = new Date()
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' as const }
  const side = (r: Ref, role: 'referrer' | 'referred') => {
    if (r.status === 'ineligible') return '—'
    const w = rewards.get(`${r.id}:${role}`) || null
    if (!w && r.status === 'rewarded' && role === 'referrer') return 'לא חולק (תקרה שנתית)'
    const label = rewardStatusHe(w, now)
    return w && !w.consumed_at && !w.voided_at && Date.parse(w.available_at) > now.getTime() ? `${label} עד ${fmt(w.available_at)}` : w?.consumed_at ? `${label} ${fmt(w.consumed_at)}` : label
  }

  return (
    <section id="referrals" style={wrap}>
      <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>חברה מביאה חברה</h2>
      <p style={note}>מי הביאה את מי. חודש במתנה לשני הצדדים אחרי התשלום הראשון של העסק החדש, {REFERRAL_HOLD_DAYS} ימים אחריו, במקום החיוב הבא. אחרי החזר כספי כדאי לבטל כאן.</p>
      {refs.length === 0 ? (
        <p style={note}>עוד אין הפניות.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="admin-referrals" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-sm)' }}>
            <thead>
              <tr>
                {['תאריך', 'הביאה', 'הצטרפה', 'סטטוס', 'חודש למביאה', 'חודש למצטרפת', 'פעולות'].map((h) => (
                  <th key={h} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                  <td style={td}>{names[r.referrer_tenant_id] || r.referrer_tenant_id.slice(0, 8)}</td>
                  <td style={td}>{names[r.referred_tenant_id] || r.referred_tenant_id.slice(0, 8)}</td>
                  <td style={td}>{STATUS_HE[r.status] || r.status}{r.ineligible_reason ? ` (${REASON_HE[r.ineligible_reason] || r.ineligible_reason})` : ''}</td>
                  <td style={td}>{side(r, 'referrer')}</td>
                  <td style={td}>{side(r, 'referred')}</td>
                  <td style={td}>{r.status !== 'voided' && r.status !== 'ineligible' ? <ReferralActions referralId={r.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
