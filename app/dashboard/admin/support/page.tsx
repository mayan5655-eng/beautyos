// app/dashboard/admin/support/page.tsx
// Where the "תקועה?" button's messages finally get read. Until now
// app/api/support/route.ts wrote to support_messages and nothing ever read
// it back - a button that worked and a message that went nowhere.
//
// Same gating as app/dashboard/admin/page.tsx: requirePlatformAdmin() is the
// real gate, a non-admin gets a plain 404, and this page only reads. The one
// mutation (marking a message handled) goes through /api/admin/support,
// which repeats the admin check independently.
//
// support_messages has no client-bearing column by construction (see
// supabase/migrations/pending/support-messages.sql's own header) - her own
// free-text message is the one field she controls, so it is the one place a
// client's name could appear at all, and only if she typed it herself.

import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import SupportClient, { type SupportMessageRow } from './SupportClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_ROWS = 300

export default async function AdminSupportPage() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()

  const db = createAdminClient()

  const { data, error } = await db
    .from('support_messages')
    .select('id, tenant_id, user_id, message, tab, app_version, sentry_event_id, created_at, handled_at')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) {
    // Degrade rather than break (the standing rule in the migrations
    // README): a tenant not yet applied reads as an empty, explained inbox,
    // not a 500.
    const missingTable =
      /support_messages/i.test(error.message) &&
      /does not exist|schema cache|relation/i.test(error.message)
    return (
      <div style={{ direction: 'rtl', fontFamily: "'Heebo','Assistant',sans-serif" }}>
        <h1 style={{ fontSize:"var(--t-3xl)", fontWeight: 600, marginBottom: 12 }}>פניות תמיכה</h1>
        <p style={{ color: '#8A6A2F', fontSize:"var(--t-md)", lineHeight: 1.6 }}>
          {missingTable
            ? 'טבלת support_messages עדיין לא נוצרה - יש להריץ את המיגרציה supabase/migrations/pending/support-messages.sql.'
            : `שגיאה בטעינת הפניות: ${error.message}`}
        </p>
      </div>
    )
  }

  const rows = data || []
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))]

  let nameById = new Map<string, string | null>()
  if (tenantIds.length) {
    const { data: tenants } = await db.from('tenants').select('id, name').in('id', tenantIds)
    for (const t of tenants || []) nameById.set((t as { id: string }).id, (t as { name: string | null }).name)
  }

  const messages: SupportMessageRow[] = rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    tenant_name: nameById.get(r.tenant_id) ?? null,
    message: r.message,
    tab: r.tab,
    app_version: r.app_version,
    sentry_event_id: r.sentry_event_id,
    created_at: r.created_at,
    handled_at: r.handled_at,
  }))

  return <SupportClient initialMessages={messages} />
}
