// POST /api/results/photo  { action: 'sign' | 'publish' | 'remove', paths: string[], bucket?: 'private' | 'public' }
// Before/after photos (app/ResultsManager.jsx, 2026-11-16 audit). A new photo is uploaded from the browser to the PRIVATE bucket,
// under <her tenant>/results/. Everything after that runs here, with the service role, because the storage policies do not let a
// signed-in owner read back or delete those objects from the browser (checked against production 2026-11-16: upload works, sign /
// download / remove find nothing):
//   sign     a short-lived link to show her a private draft photo
//   publish  her consent record is complete: the photo moves to the public bucket (same name), the private copy goes
//   remove   a photo that was replaced, cancelled or deleted is removed (private or public bucket)
// The business comes from the session, never the body, and only paths in HER results folder are accepted.
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase/server'
import { checkTenantLimit } from '../../../../lib/rateLimit'
import { PRIVATE_BUCKET, PUBLIC_BUCKET } from '../../../../lib/clientImages'
import { ownResultPath } from '../../../../lib/resultPhotos'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ success: false, error: 'לא מחוברת' }, { status: 401 })
    const { data: tid } = await supabase.rpc('get_user_tenant_id')
    if (!tid) return Response.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 })
    const tenantId = String(tid)
    const limited = checkTenantLimit(tenantId, 'results-photo')
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action ?? '')
    const raw: unknown[] = Array.isArray(body?.paths) ? body.paths.slice(0, 6) : []
    const paths = raw.map((p) => ownResultPath(tenantId, p))
    if (!paths.length || paths.some((p) => !p)) return Response.json({ success: false, error: 'קובץ לא מוכר' }, { status: 400 })
    const list = paths as string[]
    const priv = admin.storage.from(PRIVATE_BUCKET), pub = admin.storage.from(PUBLIC_BUCKET)

    if (action === 'sign') {
      const urls: Record<string, string> = {}
      for (const p of list) { const { data } = await priv.createSignedUrl(p, 3600); if (data?.signedUrl) urls[p] = data.signedUrl }
      return Response.json({ success: true, urls })
    }
    if (action === 'publish') {
      const urls: Record<string, string> = {}
      for (const p of list) {
        const { data: blob, error: de } = await priv.download(p)
        if (de || !blob) return Response.json({ success: false, error: 'התמונה לא נמצאה' }, { status: 404 })
        const { error: ue } = await pub.upload(p, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true })
        if (ue) return Response.json({ success: false, error: 'לא הצלחנו להכין את התמונה לפרסום' }, { status: 500 })
        await priv.remove([p])
        urls[p] = pub.getPublicUrl(p).data.publicUrl
      }
      return Response.json({ success: true, urls })
    }
    if (action === 'remove') {
      const { error } = await (body?.bucket === 'public' ? pub : priv).remove(list)
      return Response.json({ success: !error })
    }
    return Response.json({ success: false, error: 'פעולה לא מוכרת' }, { status: 400 })
  } catch (e) {
    console.error('[results/photo] failed:', (e as Error)?.message)
    return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 })
  }
}
