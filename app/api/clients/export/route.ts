// POST /api/clients/export  { clientId, format: 'json' | 'csv' }
// A copy of everything this business holds about ONE client. The business comes from the signed-in session (never from the body),
// and only her own clients can be named. Read-only, so it stays open while a trial is on hold: seeing and taking your data is not a
// paid feature. A POST, so a link or a prefetch can never trigger it.
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase/server'
import { checkTenantLimit } from '../../../../lib/rateLimit'
import { exportClientData, exportToCsv } from '../../../../lib/clientData'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const UUID = /^[0-9a-f-]{8,64}$/i

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ success: false, error: 'לא מחוברת' }, { status: 401 })
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) return Response.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 })

    const limited = checkTenantLimit(tenantId, 'client-export')
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    const clientId = String(body?.clientId ?? '')
    const format = body?.format === 'csv' ? 'csv' : 'json'
    if (!UUID.test(clientId)) return Response.json({ success: false, error: 'חסרה לקוחה' }, { status: 400 })

    const r = await exportClientData(admin as never, String(tenantId), clientId)
    if (!r.ok) return Response.json({ success: false, error: r.status === 404 ? 'הלקוחה לא נמצאה' : 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: r.status })

    const stamp = new Date().toISOString().slice(0, 10)
    const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="client-data-${stamp}.${format}"` }
    if (format === 'csv') return new Response(exportToCsv(r.data), { status: 200, headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } })
    return new Response(JSON.stringify(r.data, null, 2), { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e) {
    console.error('[clients/export] failed:', (e as Error)?.message)
    return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 })
  }
}
