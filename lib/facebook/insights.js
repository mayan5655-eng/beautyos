/**
 * Facebook Campaign Insights
 *
 * Fetches ad campaign performance (spend, leads, impressions, clicks)
 * for a given access token. Multi-tenant safe: the caller passes the
 * decrypted token that belongs to a specific tenant.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/insights/
 */

const FB_API_VERSION = "v21.0";
const FB_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;

// Generic GET helper against the Graph API
async function fbGet(path, accessToken, params = {}) {
  const url = new URL(`${FB_BASE}/${path}`);
  url.searchParams.set("access_token", accessToken);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message || "Facebook API error");
    err.fbError = data.error;
    throw err;
  }
  return data;
}

/**
 * Get the ad accounts the user/token has access to.
 * Returns [{ id, account_id, name, currency }]
 */
export async function getAdAccounts(accessToken) {
  const data = await fbGet("me/adaccounts", accessToken, {
    fields: "account_id,name,currency,account_status",
    limit: 50,
  });
  return data.data || [];
}

/**
 * Get campaigns for a given ad account, with last-30-day insights.
 * adAccountId should be in the form "act_XXXXXXXX" (or raw id; we normalize).
 * Returns [{ id, name, status, objective, spend, leads, impressions, clicks, cpl }]
 */
export async function getCampaignsWithInsights(accessToken, adAccountId, datePreset = "last_30d") {
  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // 1) list campaigns
  const campaignsRes = await fbGet(`${actId}/campaigns`, accessToken, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
    limit: 100,
  });
  const campaigns = campaignsRes.data || [];

  // 2) for each campaign, fetch insights (spend, leads, impressions, clicks)
  const results = [];
  for (const c of campaigns) {
    let insights = { spend: 0, leads: 0, impressions: 0, clicks: 0 };
    try {
      const ins = await fbGet(`${c.id}/insights`, accessToken, {
        fields: "spend,impressions,clicks,actions",
        date_preset: datePreset,
      });
      const row = ins.data?.[0];
      if (row) {
        insights.spend = Number(row.spend) || 0;
        insights.impressions = Number(row.impressions) || 0;
        insights.clicks = Number(row.clicks) || 0;
        // leads come from the "actions" array, action_type "lead" (or onsite/offsite variants)
        if (Array.isArray(row.actions)) {
          const leadAction = row.actions.find((a) =>
            a.action_type === "lead" ||
            a.action_type === "onsite_conversion.lead_grouped" ||
            a.action_type === "leadgen_grouped"
          );
          insights.leads = leadAction ? Number(leadAction.value) || 0 : 0;
        }
      }
    } catch (e) {
      // a single campaign's insights failing should not break the whole list
      console.error(`[fb insights] campaign ${c.id} failed:`, e.fbError || e.message);
    }

    const cpl = insights.leads > 0 ? Math.round(insights.spend / insights.leads) : null;
    results.push({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      spend: insights.spend,
      leads: insights.leads,
      impressions: insights.impressions,
      clicks: insights.clicks,
      cpl, // cost per lead
    });
  }

  return results;
}
