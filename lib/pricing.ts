// lib/pricing.ts
//
// THE ONE PLACE Kalmea's own prices live. Everything that shows or charges a price reads from here: the billing service
// (lib/billing/service.ts REGULAR_PRICE), the trial copy (lib/planCopy.ts), the day-23 nudge (lib/trialNudges.ts), the landing
// page and the terms page. Change a number here and nowhere else; test-pricing.ts fails if a hard-coded copy creeps back in.
//
// Decided 2026-10-21 with Shaked: one plan (option A of the cost table), a launch price and a regular price. A business's own
// agreed price (tenants.plan_price, set from the admin panel) still wins over these for that business.
//
// UPGRADE BUTTONS are a separate switch, OFF until the owner confirms the prices: NEXT_PUBLIC_UPGRADE_BUTTONS=1 in Vercel
// (build-time, so a redeploy is needed). While off, the app looks exactly as before. Even when on, a button only appears where the
// billing screen can really take a card (billing switched on for the deployment), so it never leads to an empty screen.

export const PLAN_PRICES = {
  /** The regular monthly price, in shekels. */
  regular: 499,
  /** The launch price, in shekels. Shown on the landing page next to the regular one until the owner removes it. */
  launch: 349,
} as const

export function upgradeButtonsEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_UPGRADE_BUTTONS: process.env.NEXT_PUBLIC_UPGRADE_BUTTONS }): boolean {
  return String(env.NEXT_PUBLIC_UPGRADE_BUTTONS || '').trim() === '1'
}

/** A price the way the app's copy already writes it: "499 ₪". DOM text only; video and canvas captions have their own rules. */
export function priceHe(n: number): string {
  return `${Math.round(Number(n) * 100) / 100} ₪`
}

// ── Paid add-on packs (decided 2026-10-24 with Shaked) ────────────────────────────────────────────────────────────────────────────
// The subscription includes a monthly amount of each metered AI feature; when it runs out she can buy a pack of more, for this month
// only. `callSite` is the ai_usage call site the quota counts. `included` is the monthly amount while packs are ON (with packs OFF the
// old anti-abuse ceilings in lib/ai/callCaps.ts and lib/skinScanQuota.ts apply unchanged). `usdPerPack` raises the per-tenant AI dollar
// ceiling by what the pack can really cost us (per-unit costs from the 2026-10 model audit, with headroom), so a paid pack is never
// stopped by that ceiling.
//
// OFF until the owner switches it on: NEXT_PUBLIC_ADDON_PACKS=1 in Vercel (read by the server for enforcement and by the app for the
// buttons; a redeploy is needed). Purchases also need billing on (BILLING_UI_ENABLED) and a saved card.

export type AddonPackKey = 'posts' | 'reels' | 'advisor' | 'skinscan'

export type AddonPack = {
  key: AddonPackKey
  callSite: string
  included: number
  units: number
  price: number
  usdPerPack: number
  /** Feminine/plural noun as she reads it on the button: "+10 רילסים". */
  unitHe: string
}

export const ADDON_PACKS: Record<AddonPackKey, AddonPack> = {
  posts:    { key: 'posts',    callSite: 'designs/generate', included: 9,  units: 10,  price: 29, usdPerPack: 4,   unitHe: 'פוסטים עם AI' },
  reels:    { key: 'reels',    callSite: 'marketing/reel',   included: 6,  units: 10,  price: 29, usdPerPack: 1.5, unitHe: 'רילסים עם AI' },
  advisor:  { key: 'advisor',  callSite: 'advisor',          included: 60, units: 100, price: 39, usdPerPack: 7,   unitHe: 'שאלות ליועצת' },
  skinscan: { key: 'skinscan', callSite: 'skin-scan',        included: 50, units: 100, price: 19, usdPerPack: 3,   unitHe: 'סריקות עור' },
}

export const ADDON_PACK_KEYS = Object.keys(ADDON_PACKS) as AddonPackKey[]

export function addonPacksEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_ADDON_PACKS: process.env.NEXT_PUBLIC_ADDON_PACKS }): boolean {
  return String(env.NEXT_PUBLIC_ADDON_PACKS || '').trim() === '1'
}

export function addonPackForCallSite(callSite: string): AddonPack | null {
  return ADDON_PACK_KEYS.map((k) => ADDON_PACKS[k]).find((p) => p.callSite === callSite) || null
}

/** The button: "+10 רילסים עם AI ב-29 ₪". */
export function addonButtonHe(p: AddonPack): string {
  return `+${p.units} ${p.unitHe} ב-${priceHe(p.price)}`
}
