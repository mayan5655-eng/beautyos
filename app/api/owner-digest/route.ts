// app/api/owner-digest/route.ts
//
// The platform owner's morning digest about her subscribers (lib/subscriberDigest.ts): new signups she has not spoken to,
// follow-ups due today, trials about to end, payments that did not go through. Runs on the Vercel cron every morning
// (vercel.json, 06:00 UTC = 09:00 Israel in summer, 08:00 in winter), behind the cron secret.
//
// Channels, all to HER only, never to a cosmetician:
//   1. the Vercel log and the admin panel's alert log (ops_events, shown at /dashboard/admin): lib/opsAlert.js;
//   2. WhatsApp to the operator number (NEXT_PUBLIC_SUPPORT_WHATSAPP), through the same raiseOpsAlert;
//   3. a web push to her own devices (lib/operatorPush.js), opening /dashboard/admin/subscribers.
// Email is not a channel: the product has no email provider.
//
// Nothing to report -> nothing is sent. At most one digest per Israel day (a second run the same day is skipped).
// ?dry=1 (behind the same secret) returns the text and sends nothing.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth'
import { raiseOpsAlert } from '@/lib/opsAlert.js'
import { sendWhatsApp } from '@/lib/whatsapp'
import { APP_URL } from '@/lib/appUrl'
import { israelDayStart } from '@/lib/ownerControl'
import { readSubscriberRows, platformOwnerTenantIds } from '@/lib/subscribersData'
import { buildDigest, digestMessageHe, digestPushHe } from '@/lib/subscriberDigest'
import { safeBusinessName, SUBSCRIBERS_PATH } from '@/lib/ownerSignupAlert'
import { pushToOperator } from '@/lib/operatorPush'

export const maxDuration = 60

const DIGEST_SOURCE = 'subscriber-digest'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized()
  return run(request)
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized()
  return run(request)
}

async function run(request: Request) {
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const db = admin()
  const now = new Date()

  if (!dry) {
    // One per Israel day: a retried or doubled cron run must not ring her phone twice.
    const since = new Date(israelDayStart(now)).toISOString()
    const prior = await db.from('ops_events').select('id').eq('source', DIGEST_SOURCE).gte('created_at', since).limit(1)
    if (!prior.error && Array.isArray(prior.data) && prior.data.length > 0) {
      return NextResponse.json({ sent: false, reason: 'already-sent-today' })
    }
  }

  const ownerIds = await platformOwnerTenantIds(db)
  const r = await readSubscriberRows(db, ownerIds, now)
  if (!r.ok) {
    console.error('[owner-digest] subscriber rows unavailable')
    return NextResponse.json({ sent: false, reason: 'read-failed' }, { status: 503 })
  }

  const digest = buildDigest(r.rows, now)
  const counts = {
    newUncontacted: digest.newUncontacted.length,
    followUps: digest.followUps.length,
    trialsEnding: digest.trialsEnding.length,
    pastDue: digest.pastDue.length,
    businesses: digest.total,
  }
  const message = digestMessageHe(digest, `${APP_URL}${SUBSCRIBERS_PATH}`, safeBusinessName)
  if (!message) return NextResponse.json({ sent: false, reason: 'nothing-to-report', counts })
  if (dry) return NextResponse.json({ sent: false, dry: true, counts, message, notesAvailable: r.notesAvailable })

  const raised = await raiseOpsAlert({
    db,
    send: sendWhatsApp,
    to: String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').trim(),
    source: DIGEST_SOURCE,
    severity: 'info',
    message,
    details: counts,
  })

  const push = digestPushHe(digest)
  const pushed = push ? await pushToOperator(db, ownerIds, { ...push, url: SUBSCRIBERS_PATH, tag: `${DIGEST_SOURCE}-${now.toISOString().slice(0, 10)}` }) : null

  return NextResponse.json({ sent: true, counts, whatsapp: raised.delivery, recorded: raised.recorded, push: pushed })
}
