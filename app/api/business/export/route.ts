// POST /api/business/export  { table: 'clients' | 'appointments' | 'receipts' }
// Her whole client list, appointment history or payments, as a CSV she can open in Excel (2026-11-16 audit: once the trial ended
// the system closed completely and she had no way to take her own data with her). The business comes from the signed-in session,
// never from the body. Read-only, so it is open while the plan is blocked: taking your own data is not a paid feature. A POST, so a
// link or a prefetch can never trigger it. The demo is refused (its data is shared and fake).
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase/server'
import { checkTenantLimit } from '../../../../lib/rateLimit'
import { rowsToCsv } from '../../../../lib/clientData'
import { readAllRows } from '../../../../lib/pagedRead.js'
import { isDemoTenantId } from '../../../../lib/demoTenants'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

// The three tables she would need to carry on anywhere else. Ordered by id (readAllRows pages on it).
export const EXPORT_TABLES = ['clients', 'appointments', 'receipts'] as const
type Table = (typeof EXPORT_TABLES)[number]

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ success: false, error: 'לא מחוברת' }, { status: 401 })
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) return Response.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 })
    if (isDemoTenantId(String(tenantId))) return Response.json({ success: false, error: 'זו תצוגת דמו' }, { status: 403 })

    const limited = checkTenantLimit(String(tenantId), 'client-export')
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    const table = String(body?.table ?? '') as Table
    if (!EXPORT_TABLES.includes(table)) return Response.json({ success: false, error: 'לא ידוע מה להוריד' }, { status: 400 })

    const r = await readAllRows(admin, table, { filter: (q: any) => q.eq('tenant_id', String(tenantId)) })
    if (r.error || !r.complete) {
      console.error(`[business/export] ${table} read failed:`, r.error?.message || 'incomplete')
      return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 })
    }
    const rows = (r.data || []).map(({ tenant_id: _t, ...rest }: Record<string, unknown>) => rest)
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(rowsToCsv(rows), {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="kalmea-${table}-${stamp}.csv"` },
    })
  } catch (e) {
    console.error('[business/export] failed:', (e as Error)?.message)
    return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 })
  }
}
