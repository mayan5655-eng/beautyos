// lib/facebook/dailySpend.js
//
// Account-level spend per DAY between two ISO dates (inclusive), for the ad_spend table.
// Returns [{ day: 'YYYY-MM-DD', spend: number, currency }]. Throws the Graph error (err.fbError) when the token
// lacks ads_read - the caller treats that as "not approved yet", not as a failure.
import { fbGet } from "./insights.js";

export async function getDailyAccountSpend(accessToken, adAccountId, sinceIso, untilIso) {
  const actId = String(adAccountId).startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const data = await fbGet(`${actId}/insights`, accessToken, {
    level: "account",
    fields: "spend,account_currency,date_start",
    time_increment: 1,
    time_range: JSON.stringify({ since: sinceIso, until: untilIso }),
    limit: 100,
  });
  return (data.data || [])
    .map((r) => ({
      day: String(r.date_start || "").slice(0, 10),
      spend: Number(r.spend) || 0,
      currency: r.account_currency || "ILS",
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}
