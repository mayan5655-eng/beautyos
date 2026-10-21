// app/api/content/publish-due/route.ts
//
// Cron, every 5 minutes (vercel.json): publishes the approved posts whose time has come (lib/content/publisher.ts runDue).
// Service role, cron secret only. Each business is checked before anything is published: demo never, on hold -> paused
// (fails CLOSED here, unlike billing reads: an unreadable plan state must not publish for a blocked business).
// Until add_publish_jobs.sql has run this answers { skipped: 'tables-missing' }.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth';
import { markCronRun } from '@/lib/cronHeartbeat';
import { notifyOwner } from '@/lib/ownerNotify';
import { raiseOpsAlert } from '@/lib/opsAlert.js';
import { decryptToken } from '@/lib/facebook/encryption';
import { isDemoTenantId } from '@/lib/demoTenants';
import { PRIVATE_BUCKET } from '@/lib/clientImages';
import { planState } from '@/lib/planState';
import { runDue } from '@/lib/content/publisher';

export const maxDuration = 120;

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('content-publish');
  return run();
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('content-publish');
  return run();
}

async function run() {
  const db = admin();
  const probe = await db.from('publish_jobs').select('id', { head: true, count: 'exact' }).limit(1);
  if (probe.error) {
    if (probe.error.code === '42P01' || probe.error.code === 'PGRST205') return NextResponse.json({ skipped: 'tables-missing' });
    console.error('[content/publish] probe failed:', probe.error.message);
    return NextResponse.json({ error: 'read-failed' }, { status: 500 });
  }
  const report = await runDue({
    db,
    decrypt: decryptToken,
    signUrl: async (path) => {
      const { data, error } = await db.storage.from(PRIVATE_BUCKET).createSignedUrl(path, 3600);
      return error ? null : data?.signedUrl || null;
    },
    notify: async ({ tenantId, title, body }) => {
      const settingsRow = (await db.from('settings').select('business_phone, automations').eq('tenant_id', tenantId).maybeSingle()).data;
      await notifyOwner({ tenantId, kind: 'content_published', title, body, settingsRow });
    },
    // Fails CLOSED: publishing spends her reputation, so an unreadable plan state means "do not publish now".
    isBlocked: async (tenantId) => {
      const { data, error } = await db.from('tenants').select('plan_status, trial_started_at, trial_ends_at').eq('id', tenantId).maybeSingle();
      if (error || !data) return true;
      return planState(data).isBlocked;
    },
    isDemo: isDemoTenantId,
    alert: async (message) => { await raiseOpsAlert({ db, source: 'content-publish', severity: 'warning', message }); },
  });
  return NextResponse.json(report);
}
