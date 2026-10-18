import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { decryptToken } from "../../../../lib/facebook/encryption";
import { getAdAccounts, getCampaignsWithInsights } from "../../../../lib/facebook/insights";
import { ownRow, callerTenantId } from "../../../../lib/tenantScope";

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

    // THIS tenant, named explicitly. The row below holds an encrypted Facebook page TOKEN: it must never be one a policy happened to
    // let through (the service_prices lesson, lib/tenantScope.js). No tenant, no row, no token.
    const tenantId = await callerTenantId(supabase);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "אין גישה" }, { status: 403 });
    }

    // Get this tenant's active Facebook page row: scoped in the query AND checked on the row
    // The ad account is read with the USER token (the Page token cannot list ad accounts); the columns come from
    // add_facebook_user_token.sql, so a deployment without it falls back to the Page token as before.
    const pageQuery = (cols) => supabase
      .from("facebook_pages")
      .select(cols)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .limit(1);
    let { data: pageRows, error: pErr } = await pageQuery("tenant_id, page_access_token_encrypted, user_access_token_encrypted, granted_scopes, page_id, page_name, is_active");
    if (pErr && /user_access_token_encrypted|granted_scopes|schema cache|column/i.test(pErr.message || "")) {
      ({ data: pageRows, error: pErr } = await pageQuery("tenant_id, page_access_token_encrypted, page_id, page_name, is_active"));
    }

    if (pErr) {
      return (console.error("[marketing/campaigns] failed:", pErr?.message), NextResponse.json({ ok: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));
    }
    const pages = (pageRows || []).filter((r) => ownRow(r, tenantId));
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
      token = decryptToken(page.user_access_token_encrypted || page.page_access_token_encrypted);
    } catch (e) {
      return NextResponse.json({ ok: false, error: "שגיאה בפענוח הטוקן" }, { status: 500 });
    }

    // She connected before ads_read was asked for, or Meta has not granted it to her yet: say so plainly instead of
    // failing inside the Graph call. (granted_scopes is only known for connections made after the migration.)
    if (typeof page.granted_scopes === "string" && page.granted_scopes && !page.granted_scopes.split(",").includes("ads_read")) {
      return NextResponse.json({
        ok: false,
        needsAdsPermission: true,
        error: "כדי לראות קמפיינים צריך לחבר מחדש את פייסבוק ולאשר גם את ההרשאה לצפייה במודעות.",
      });
    }

    const url = new URL(req.url);
    // Both values end up in a Graph API path / query with HER page token: only the shapes we use are let through.
    // (The adAccountId used to be interpolated as given, so a crafted query string could address any Graph path.)
    const DATE_PRESETS = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d", "this_month", "last_month"];
    let adAccountId = url.searchParams.get("adAccountId");
    if (adAccountId && !/^(act_)?\d{1,20}$/.test(adAccountId)) {
      return NextResponse.json({ ok: false, error: "חשבון מודעות לא תקין" }, { status: 400 });
    }
    const requestedPreset = url.searchParams.get("datePreset") || "last_30d";
    const datePreset = DATE_PRESETS.includes(requestedPreset) ? requestedPreset : "last_30d";

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
    // The detail stays in the log: a Graph error message can carry request fragments, and it is not for her.
    console.error("[marketing/campaigns] error:", err);
    return NextResponse.json({ ok: false, error: "לא הצלחנו לטעון את הקמפיינים מפייסבוק. נסי שוב בעוד רגע." }, { status: 500 });
  }
}
