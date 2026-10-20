// app/api/content/remind/route.ts
//
// Daily cron (vercel.json, 05:30 UTC = 08:30 Israel in summer, 07:30 in winter): "היום מפרסמים". For every business whose
// content plan has a post planned for TODAY (Israel calendar) that is not posted or skipped and was not reminded yet, one
// notification to HER (owner_notifications + push, lib/ownerNotify.js), listing today's posts and their times. Nothing is
// ever sent to her clients, and nothing is published.
//
// Skipped: demo businesses, a business whose plan is on hold (tenantIsBlocked), and anyone who turned reminders off in
// her plan preferences. Each item is stamped reminder_sent_at, so a retried run does not ring twice.
// Until add_content_plan.sql has run this answers { skipped: 'tables-missing' } and does nothing.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth';
import { markCronRun } from '@/lib/cronHeartbeat';
import { notifyOwner } from '@/lib/ownerNotify';
import { tenantIsBlocked } from '@/lib/tenantActive';
import { isDemoTenantId } from '@/lib/demoTenants';
import { israelDay, israelHourToUtc } from '@/lib/content/pack';
import { isMissingContentTable } from '@/lib/content/db';
import { contentReminderHe } from '@/lib/content/remind';

export const maxDuration = 60;

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('content-remind');
  return run();
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('content-remind');
  return run();
}

type Row = { id: string; tenant_id: string; topic: string; planned_for: string };

async function run() {
  const db = admin();
  const now = new Date();
  const today = israelDay(now);
  const from = israelHourToUtc(today, 0).toISOString();
  const to = new Date(israelHourToUtc(today, 0).getTime() + 24 * 3600_000).toISOString();

  const { data, error } = await db.from('content_items')
    .select('id, tenant_id, topic, planned_for')
    .in('status', ['planned', 'approved'])
    .is('reminder_sent_at', null)
    .gte('planned_for', from).lt('planned_for', to)
    .order('planned_for', { ascending: true })
    .limit(2000);
  if (error) {
    if (isMissingContentTable(error)) return NextResponse.json({ skipped: 'tables-missing' });
    console.error('[content/remind] read failed:', error.message);
    return NextResponse.json({ error: 'read-failed' }, { status: 500 });
  }

  const byTenant = new Map<string, Row[]>();
  for (const r of (data || []) as Row[]) {
    if (isDemoTenantId(r.tenant_id)) continue;
    const list = byTenant.get(r.tenant_id) || [];
    list.push(r);
    byTenant.set(r.tenant_id, list);
  }

  let sent = 0, skipped = 0;
  for (const [tenantId, items] of byTenant) {
    try {
      if (await tenantIsBlocked(db, tenantId)) { skipped++; continue; }
      const prefs = await db.from('content_preferences').select('reminders').eq('tenant_id', tenantId).maybeSingle();
      if (!prefs.error && prefs.data && prefs.data.reminders === false) { skipped++; continue; }
      const settingsRow = (await db.from('settings').select('business_phone, automations').eq('tenant_id', tenantId).maybeSingle()).data;
      const msg = contentReminderHe(items.map((i) => ({ topic: i.topic, plannedFor: new Date(i.planned_for) })));
      await notifyOwner({ tenantId, kind: 'content_today', title: msg.title, body: msg.body, settingsRow });
      await db.from('content_items').update({ reminder_sent_at: now.toISOString() }).in('id', items.map((i) => i.id));
      sent++;
    } catch (e) {
      console.error('[content/remind] one business failed:', e instanceof Error ? e.message : 'unknown');
    }
  }
  return NextResponse.json({ day: today, businesses: byTenant.size, sent, skipped });
}
