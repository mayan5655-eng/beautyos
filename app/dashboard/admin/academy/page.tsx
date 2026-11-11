// app/dashboard/admin/academy/page.tsx
// "האקדמיה" for the platform admin: courses and lessons (create, edit, publish, paste a video link), grants to a business (beta
// testers), and completion counts. NEXT_PUBLIC_ACADEMY off -> 404; not a platform admin -> the same plain 404 as /dashboard/admin.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { academyEnabled } from '@/lib/academy'
import { loadAdminOverview, type Db } from '@/lib/academyData'
import AcademyAdminClient from './AcademyAdminClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'האקדמיה: ניהול' }

export default async function AcademyAdminPage() {
  if (!academyEnabled()) notFound()
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()
  const r = await loadAdminOverview(createAdminClient() as unknown as Db)
  if (!r.ok) {
    return (
      <div dir="rtl" style={{ maxWidth: 720, margin: '0 auto', padding: '16px', fontFamily: 'var(--sans)', color: 'var(--ink)' }}>
        <Link href="/dashboard/admin" style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>→ ניהול מנויים</Link>
        <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-3xl)', fontWeight: 800, color: 'var(--brand-accent)', margin: '8px 0 12px' }}>האקדמיה</h1>
        <p style={{ fontSize: 'var(--t-md)', background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '12px 14px', margin: 0 }}>
          {r.reason === 'missing-migration'
            ? 'הטבלאות של האקדמיה עוד לא קיימות. צריך להריץ את add_academy_2026-11-11.sql ואחריו את academy_seed_2026-11-11.sql.'
            : 'לא הצלחנו לטעון את הנתונים כרגע. אפשר לנסות שוב בעוד רגע.'}
        </p>
      </div>
    )
  }
  return <AcademyAdminClient data={r.data} />
}
