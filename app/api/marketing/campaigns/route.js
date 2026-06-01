import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { decryptToken } from "../../../../lib/facebook/encryption";
import { getAdAccounts, getCampaignsWithInsights } from "../../../../lib/facebook/insights";

/**
 * GET /api/marketing/campaigns
 * Returns the logged-in tenant's Facebook ad campaigns + performance.
 * Multi-tenant: reads the token belonging to THIS tenant only (RLS enforced).
 *
 * Optional query: ?adAccountId=act_123  (if omitted, uses the first ad account found)
 *                 ?datePreset=last_7d|last_30d|...
 */
export async function GET(req) {
  try {
    const supabase = await createClient();

    // Identify the current user / tenant (RLS will scope the row for us too)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
    }

    // Get this tenant's active Facebook page row (RLS returns only their own)
    const { data: pages, error: pErr } = await supabase
      .from("facebook_pages")
      .select("page_access_token_encrypted, page_id, page_name, is_active")
      .eq("is_active", true)
      .limit(1);

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    if (!pages || pages.length === 0) {
      return NextResponse.json({
        ok: false,
        notConnected: true,
        error: "פייסבוק עדיין לא מחובר. חברי את הדף שלך כדי לראות קמפיינים.",
      });
    }

    const page = pages[0];
    let token;
    try {
      token = decryptToken(page.page_access_token_encrypted);
    } catch (e) {
      return NextResponse.json({ ok: false, error: "שגיאה בפענוח הטוקן" }, { status: 500 });
    }

    const url = new URL(req.url);
    let adAccountId = url.searchParams.get("adAccountId");
    const datePreset = url.searchParams.get("datePreset") || "last_30d";

    // If no ad account specified, discover the first one available to this token
    let adAccounts = [];
    if (!adAccountId) {
      try {
        adAccounts = await getAdAccounts(token);
      } catch (e) {
        // Most common cause: token lacks ads_read permission
        return NextResponse.json({
          ok: false,
          needsAdsPermission: true,
          error: "אין הרשאת גישה לחשבון המודעות. ייתכן שצריך לחבר מחדש את פייסבוק עם הרשאת מודעות.",
          detail: e.fbError?.message || e.message,
        });
      }
      if (adAccounts.length === 0) {
        return NextResponse.json({
          ok: false,
          error: "לא נמצא חשבון מודעות מקושר לחשבון הפייסבוק הזה.",
        });
      }
      adAccountId = adAccounts[0].account_id;
    }

    const campaigns = await getCampaignsWithInsights(token, adAccountId, datePreset);

    // summary totals
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.spend += c.spend;
        acc.leads += c.leads;
        acc.impressions += c.impressions;
        acc.clicks += c.clicks;
        return acc;
      },
      { spend: 0, leads: 0, impressions: 0, clicks: 0 }
    );
    totals.cpl = totals.leads > 0 ? Math.round(totals.spend / totals.leads) : null;

    return NextResponse.json({
      ok: true,
      pageName: page.page_name,
      adAccounts,
      adAccountId,
      datePreset,
      campaigns,
      totals,
    });
  } catch (err) {
    console.error("[marketing/campaigns] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
