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
