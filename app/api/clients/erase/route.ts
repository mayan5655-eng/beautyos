// POST /api/clients/erase  { clientId, confirmName }
// Erases one client's personal data (lib/clientData.ts says exactly what is deleted and what is kept anonymously).
// The business comes from the signed-in session. The caller must type the client's name: a stray tap or a replayed request cannot erase
// anyone. Never runs for a demo business. A mutation, so it is behind the plan guard like every other route that writes.
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase/server'
import { requireActiveTenant } from '../../../../lib/planGuard'
import { checkTenantLimit } from '../../../../lib/rateLimit'
import { isDemoTenantId } from '../../../../lib/demoTenants'
import { eraseClientData } from '../../../../lib/clientData'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const UUID = /^[0-9a-f-]{8,64}$/i
const sameName = (a: unknown, b: unknown) => String(a ?? '').replace(/\s+/g, ' ').trim() === String(b ?? '').replace(/\s+/g, ' ').trim() && String(a ?? '').trim() !== ''

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ success: false, error: 'לא מחוברת' }, { status: 401 })
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) return Response.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 })
    if (isDemoTenantId(String(tenantId))) return Response.json({ success: false, error: 'בתצוגה לא מוחקים לקוחות' }, { status: 403 })

    const guard = await requireActiveTenant(supabase)
    if (!guard.ok) return guard.response

    const limited = checkTenantLimit(tenantId, 'client-erase')
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    const clientId = String(body?.clientId ?? '')
    if (!UUID.test(clientId)) return Response.json({ success: false, error: 'חסרה לקוחה' }, { status: 400 })

    const { data: client } = await admin.from('clients').select('id, name').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle()
    if (!client) return Response.json({ success: false, error: 'הלקוחה לא נמצאה' }, { status: 404 })
    if (!sameName(body?.confirmName, (client as { name?: string }).name)) {
      return Response.json({ success: false, error: 'כדי למחוק צריך להקליד את שם הלקוחה בדיוק' }, { status: 400 })
    }

    const r = await eraseClientData(admin as never, String(tenantId), clientId)
    // No name, phone or content in the log: only that it happened and how it went.
    console.log(`[clients/erase] tenant=${tenantId} client=${clientId} ok=${r.ok} steps=${r.steps.map((s) => `${s.table}:${s.action}${s.count != null ? `:${s.count}` : ''}`).join(',')}`)
    if (!r.ok) return Response.json({ success: false, error: 'המחיקה לא הושלמה, הלקוחה נשארה. אפשר לנסות שוב.', steps: r.steps }, { status: 500 })
    return Response.json({ success: true, steps: r.steps })
  } catch (e) {
    console.error('[clients/erase] failed:', (e as Error)?.message)
    return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 })
  }
}
