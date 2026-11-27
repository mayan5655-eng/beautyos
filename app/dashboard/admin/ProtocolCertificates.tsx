// app/dashboard/admin/ProtocolCertificates.tsx
//
// Cosmetician certificates uploaded to open the facial chapters of the protocol book (lib/protocolBook/certificate.ts).
// Server component, through the service-role client the admin page holds after requirePlatformAdmin(). Each file opens
// through a signed link that lasts ten minutes; the bucket is private. Renders nothing while the book is off or when no
// business has uploaded one. Waiting ones first.
import type { SupabaseClient } from '@supabase/supabase-js'
import { protocolBookEnabled } from '@/lib/protocolBook/book'
import { CERT_BUCKET, CERT_KEY, certificateOf, isCertPath } from '@/lib/protocolBook/certificate'
import ProtocolCertificateActions from './ProtocolCertificateActions'

const STATUS_HE: Record<string, string> = { submitted: 'ממתינה לבדיקה', approved: 'אושרה', rejected: 'נדחתה' }

export default async function ProtocolCertificates({ db }: { db: SupabaseClient }) {
  if (!protocolBookEnabled()) return null
  const { data, error } = await db.from('settings').select('tenant_id, business_name, automations').not(`automations->${CERT_KEY}`, 'is', null).limit(500)
  if (error || !data || data.length === 0) return null

  const rows = (await Promise.all(data.map(async (r) => {
    const cert = certificateOf(r)
    if (!cert) return null
    // Only a path this feature built, inside that business's own folder, is ever signed.
    const signed = isCertPath(String(r.tenant_id), cert.path) ? await db.storage.from(CERT_BUCKET).createSignedUrl(cert.path, 600) : null
    return { tenantId: String(r.tenant_id), name: String(r.business_name || ''), cert, url: signed?.data?.signedUrl || null }
  }))).filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(b.cert.status === 'submitted') - Number(a.cert.status === 'submitted') || b.cert.uploaded_at.localeCompare(a.cert.uploaded_at))
  if (rows.length === 0) return null

  const box: React.CSSProperties = { marginTop: 28, padding: 16, border: '1px solid #E4DED3', borderRadius: 12, background: '#fff', direction: 'rtl' }
  return (
    <section style={box} data-testid="protocol-certificates">
      <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>תעודות קוסמטיקאית (ספר הפרוטוקולים)</h2>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 12 }}>פרקי הפנים נפתחים עם ההעלאה. דחייה סוגרת אותם עד שתעלה תעודה אחרת. הקישור לקובץ תקף לעשר דקות.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.tenantId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 600, margin: 0 }}>{r.name || r.tenantId}</p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: 0 }}>
                {STATUS_HE[r.cert.status]} · הועלתה {new Date(r.cert.uploaded_at).toLocaleDateString('he-IL')}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--k-green)' }}>פתיחת התעודה</a> : <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>הקובץ לא נמצא</span>}
              <ProtocolCertificateActions tenantId={r.tenantId} status={r.cert.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
