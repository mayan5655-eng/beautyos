// lib/addonOffer.ts
//
// Client-safe. Which add-on pack (lib/pricing.ts) a refusal belongs to, and the one event that opens the add-ons in her billing settings.
// A refusal is recognised by its own wording: every "you used this month's ___" message is built by capRefusalHe('calls', callSite)
// (lib/ai/capMessages.ts), so the same pure function tells the app which pack to offer, with no change to the AI routes.
import { capRefusalHe } from './ai/capMessages.ts';
import { ADDON_PACK_KEYS, ADDON_PACKS, addonPacksEnabled, type AddonPack } from './pricing.ts';

export const OPEN_ADDONS_EVENT = 'kalmea:open-addons';

export function addonPackForMessage(msg: unknown, enabled: boolean = addonPacksEnabled()): AddonPack | null {
  if (!enabled || typeof msg !== 'string' || !msg) return null;
  for (const k of ADDON_PACK_KEYS) {
    const p = ADDON_PACKS[k];
    if (msg.startsWith(capRefusalHe('calls', p.callSite))) return p;
  }
  return null;
}

/** Opens Settings > העסק שלי at the add-ons (app/beautyos.jsx listens). */
export function openAddons(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_ADDONS_EVENT));
}
