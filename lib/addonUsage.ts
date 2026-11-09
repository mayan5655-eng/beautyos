// lib/addonUsage.ts
//
// SERVER ONLY. This month's use of every metered AI feature that has an add-on pack, from the server's real counts (ai_usage through
// lib/ai/callCaps.ts getCallCapStatus, and billing_addons through lib/addonQuota.ts). Shared by /api/billing/status (the billing card) and
// /api/billing/upgrades (the "שדרוגים" store and the chips on each screen), so both always show the same numbers.
import { ADDON_PACKS, ADDON_PACK_KEYS, addonButtonHe, type AddonPackKey } from './pricing.ts';
import { getCallCapStatus } from './ai/callCaps.ts';
import { purchasedAddons } from './addonQuota.ts';

export type AddonUsageRow = { key: AddonPackKey; label: string; used: number | null; cap: number | null; purchased: number; units: number; price: number; button: string };

export async function addonUsageFor(tenantId: string): Promise<AddonUsageRow[]> {
  const bought = await purchasedAddons(tenantId, { noCache: true });
  return Promise.all(ADDON_PACK_KEYS.map(async (k) => {
    const p = ADDON_PACKS[k];
    const st = await getCallCapStatus(tenantId, p.callSite, { purchased: bought });
    // An unreadable count is shown as unknown ("…"), never as zero used.
    return { key: k, label: p.unitHe, used: st.unknown ? null : st.used, cap: st.cap, purchased: st.purchased || 0, units: p.units, price: p.price, button: addonButtonHe(p) };
  }));
}
