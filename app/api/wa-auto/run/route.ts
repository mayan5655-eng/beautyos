// app/api/wa-auto/run/route.ts
//
// The hourly run of the automatic WhatsApp reminders and held-over booking confirmations (lib/waCloud/autoRun.ts),
// through Meta's Cloud API, for the businesses that turned it on in their settings.
//
// Cron only (CRON_SECRET). With WA_AUTO_ENABLED unset (the default, and the state until Meta approves the templates)
// it stamps its heartbeat and returns { dormant: true } without reading anything else and without calling Meta.

import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth';
import { markCronRun } from '@/lib/cronHeartbeat.js';
import { autoConfig } from '@/lib/waCloud/autoConfig';
import { runAutoMessages } from '@/lib/waCloud/autoRun';
import { sendWhatsApp } from '@/lib/whatsapp';
import { confirmLinks } from '@/lib/confirmToken';
import { isYomTov } from '@/lib/greetings/calendar';
import { moneyAlert } from '@/lib/moneyAlert.js';
import { notifyOwner } from '@/lib/ownerNotify.js';
import { APP_URL } from '@/lib/appUrl';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('wa-auto-messages');
  if (!autoConfig().enabled) return Response.json({ success: true, dormant: true });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const run = await runAutoMessages({
      db,
      deps: { queue: sendWhatsApp, confirmLinks, baseUrl: APP_URL, isYomTov, alert: moneyAlert },
    });
    // Each business with messages now waiting in her queue: one notice, so she sends them from her own WhatsApp today.
    for (const [tenantId, n] of Object.entries(run.queuedByTenant)) {
      try {
        await notifyOwner({
          tenantId, kind: 'reminders_ready',
          title: n === 1 ? 'הודעה אחת מחכה לשליחה ממך' : `${n} הודעות מחכות לשליחה ממך`,
          body: "לא יכולנו לשלוח אותן אוטומטית, והן מוכנות ב'הודעות מוכנות לשליחה'. לחיצה אחת לכל אחת, מהוואטסאפ שלך.",
        });
      } catch (e) { console.warn('[wa-auto] owner notice failed:', (e as Error)?.message); }
    }
    if (run.stoppedEarly) {
      await moneyAlert('wa-auto:run', 'Automatic WhatsApp run stopped at its time budget; the next hourly run continues', { sent: run.sent }, { severity: 'warning', key: 'budget' });
    }
    return Response.json({ success: true, ...run });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error('[wa-auto] run aborted:', msg);
    await moneyAlert('wa-auto:run', `Automatic WhatsApp run aborted: ${msg.slice(0, 200)}`, null, { severity: 'error', key: 'aborted' });
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
