// app/api/facebook/ad-spend/route.ts
//
// Daily cron: for every tenant with an active Facebook page, pull the last 35 days of account-level ad spend
// from the Marketing API into ad_spend (origin 'facebook').
//
// It degrades, it does not fail:
//   - ads_read not approved / no ad account / token expired -> that tenant is counted as "skipped" and nothing is
//     written; the report simply shows no spend for Facebook.
//   - the ad_spend table not created yet (migration not run) -> the whole run answers { skipped: 'no-table' }.
// Nothing is sent to anyone and nothing is deleted. Re-running is safe: rows are upserted by day.
//
// Authorised like the other crons (CRON_SECRET), because it fans out to every tenant.

import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron, cronUnauthorized } from '@/lib/cronAuth';
import { decryptToken } from '@/lib/facebook/encryption';
import { getAdAccounts } from '@/lib/facebook/insights';
import { getDailyAccountSpend } from '@/lib/facebook/dailySpend';
import { pullWindow, spendRowsForUpsert, isAdsPermissionError } from '@/lib/adSpend';

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const out = { tenants: 0, written: 0, skippedNoPermission: 0, skippedNoAccount: 0, failed: 0, skipped: '' as string };
  try {
    const { data: pages, error } = await db.from('facebook_pages').select('tenant_id, page_access_token_encrypted').eq('is_active', true);
    if (error) return Response.json({ success: false, error: 'pages-read-failed' }, { status: 500 });

    const probe = await db.from('ad_spend').select('id').limit(1);
    if (probe.error && (probe.error.code === '42P01' || /does not exist|schema cache/i.test(probe.error.message || ''))) {
      return Response.json({ success: true, ...out, skipped: 'no-table' });
    }

    const seen = new Set<string>();
    const { since, until } = pullWindow();
    for (const p of (pages || []) as { tenant_id: string; page_access_token_encrypted: string }[]) {
      if (!p.tenant_id || seen.has(p.tenant_id)) continue; // one pull per tenant, however many pages
      seen.add(p.tenant_id);
      out.tenants++;
      try {
        const token = decryptToken(p.page_access_token_encrypted);
        const accounts = await getAdAccounts(token);
        if (!accounts.length) { out.skippedNoAccount++; continue; }
        const daily = await getDailyAccountSpend(token, accounts[0].account_id, since, until);
        const rows = spendRowsForUpsert(p.tenant_id, daily);
        if (!rows.length) continue;
        const up = await db.from('ad_spend').upsert(rows, { onConflict: 'tenant_id,day,origin,source,campaign_id' });
        if (up.error) { out.failed++; console.error('[ad-spend] upsert failed:', up.error.message); } else out.written += rows.length;
      } catch (e) {
        if (isAdsPermissionError(e)) out.skippedNoPermission++;
        else { out.failed++; console.error('[ad-spend] pull failed for a tenant:', (e as Error)?.message); }
      }
    }
    return Response.json({ success: true, ...out });
  } catch (e) {
    console.error('[ad-spend] run threw:', (e as Error)?.message);
    return Response.json({ success: false, error: 'internal' }, { status: 500 });
  }
}
