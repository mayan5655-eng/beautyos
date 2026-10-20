// lib/operatorPush.js (plain JS like lib/ownerNotify.js: web-push ships no types)
//
// SERVER ONLY. A web push to the platform owner's OWN devices (the browsers she allowed notifications in, on her own business:
// push_subscriptions, the same rows lib/ownerNotify.js pushes to). Used by the morning digest (/api/owner-digest).
//
// Read-only on her data: it never writes an owner_notifications row and never deletes a subscription (a dead one is only
// counted), so her business's data stays exactly as it was. Best-effort: never throws.
import webpush from 'web-push'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db service-role client
 * @param {string[]} tenantIds her own business(es)
 * @param {{ title: string, body: string, url?: string, tag?: string }} payload
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<{ configured: boolean, devices: number, sent: number, dead: number, failed: number }>}
 */
export async function pushToOperator(db, tenantIds, payload, env = process.env) {
  const out = { configured: false, devices: 0, sent: 0, dead: 0, failed: 0 }
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = env.VAPID_PRIVATE_KEY
  if (!pub || !priv || tenantIds.length === 0) return out
  out.configured = true
  try {
    webpush.setVapidDetails('mailto:support@kalmea.app', pub, priv)
    const { data, error } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').in('tenant_id', tenantIds)
    if (error || !data) {
      if (error) console.error('[operatorPush] subscriptions read failed:', error.message)
      return out
    }
    out.devices = data.length
    const json = JSON.stringify(payload)
    await Promise.all(
      data.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json)
          out.sent++
        } catch (e) {
          const code = e?.statusCode
          if (code === 404 || code === 410) out.dead++
          else { out.failed++; console.error('[operatorPush] push failed:', code ?? 'error') }
        }
      }),
    )
  } catch (e) {
    console.error('[operatorPush] threw:', e?.message || 'error')
  }
  return out
}
