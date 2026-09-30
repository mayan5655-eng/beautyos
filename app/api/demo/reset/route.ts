// app/api/demo/reset/route.ts
//
// Nightly: wipe and re-seed both demo tenants back to their canonical fake
// state (lib/demoSeed.ts's resetDemoTenant). Same shape as every other cron
// route (isAuthorizedCron/cronUnauthorized, service-role client, logged in
// full, GET allowed for a by-hand check).

import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth';
import { resetDemoTenant } from '@/lib/demoSeed';
import type { DemoField } from '@/lib/demoTenants';

export const maxDuration = 120;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function run() {
  const results: Record<string, { ok: boolean; error?: string }> = {};
  for (const field of ['cosmetics', 'nails'] as DemoField[]) {
    results[field] = await resetDemoTenant(db, field);
    if (!results[field].ok) {
      console.error(`[demo/reset] ${field} failed:`, results[field].error);
    } else {
      console.log(`[demo/reset] ${field} reseeded`);
    }
  }
  const ok = Object.values(results).every((r) => r.ok);
  return Response.json({ success: ok, results }, { status: ok ? 200 : 500 });
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  return run();
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  return run();
}
