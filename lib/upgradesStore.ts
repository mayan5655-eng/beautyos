// lib/upgradesStore.ts
//
// Client-safe. The "שדרוגים ✨" store: what Kalmea sells HER (not treatment add-ons for her clients), the words on every card, and the one
// event that opens the store. Pure functions only, so the copy and the rules are tested without a browser (test-upgrades-store.ts).
//
// What can be on the store, each behind its own existing switch (nothing here adds a new one):
//   packs     the AI add-on packs (lib/pricing.ts ADDON_PACKS), NEXT_PUBLIC_ADDON_PACKS + billing on (BILLING_UI_ENABLED, server side)
//   annual    switch to yearly payment, NEXT_PUBLIC_ANNUAL_PLAN (and its migration, `ready`)
//   referral  "חברה מביאה חברה", NEXT_PUBLIC_REFERRALS
// A higher plan is NOT a card: Kalmea sells one plan (lib/pricing.ts PLAN_PRICES, 349 launch / 499 regular is the same plan at two prices,
// and the basic/pro/premium map in app/beautyos.jsx gates nothing). If tiers ever exist, they get a card here.
//
// The data comes from /api/billing/upgrades (the server's real counts from ai_usage and billing_addons). The browser never decides what
// is included or bought; it only shows it.
import { ADDON_PACKS, addonButtonHe, addonPacksEnabled, annualPlanEnabled, priceHe, ANNUAL_MONTHS_PAID, type AddonPackKey } from './pricing.ts';
import { referralsEnabled } from './referral.ts';
import { KALMEA_TAX_STATUS, type KalmeaTaxStatus } from './kalmeaBusiness.ts';
import { OPEN_ADDONS_EVENT } from './addonOffer.ts';

export const UPGRADES_EVENT = 'kalmea:open-upgrades';
/** Sent after a purchase or a plan change, so every meter and generator re-reads its allowance at once. */
export const UPGRADES_CHANGED_EVENT = 'kalmea:upgrades-changed';
/** At or above this share of the month's amount, the quiet chip becomes the stronger nudge. */
export const NUDGE_AT = 0.8;

/** Any of the store's switches is on in this build. All off: no entry, no fetch, the app looks exactly as before. */
export function upgradesFlagsOn(env?: Record<string, string | undefined>): boolean {
  return env
    ? addonPacksEnabled(env) || annualPlanEnabled(env) || referralsEnabled(env)
    : addonPacksEnabled() || annualPlanEnabled() || referralsEnabled();
}

export type PackUsage = { key: AddonPackKey; used: number | null; cap: number | null; purchased: number; units: number; price: number };
export type UpgradesData = {
  success: true;
  billing: boolean;
  configured: boolean;
  mode?: string;
  demo?: boolean;
  card: { last4: string } | null;
  subStatus: string | null;
  nextChargeAt: string | null;
  packs: PackUsage[];
  annual: { ready: boolean; monthly: number; yearly: number; billingPeriod: 'monthly' | 'annual'; pendingPeriod: string | null } | null;
  referrals: boolean;
};

export type UsageLevel = 'unknown' | 'quiet' | 'near' | 'full';

export function usageLevel(used: number | null | undefined, cap: number | null | undefined): UsageLevel {
  if (used == null || cap == null || !Number.isFinite(Number(used)) || !Number.isFinite(Number(cap))) return 'unknown';
  if (Number(cap) <= 0 || Number(used) >= Number(cap)) return 'full';
  return Number(used) / Number(cap) >= NUDGE_AT ? 'near' : 'quiet';
}

/** 0..100, for the bar. */
export function usagePct(used: number | null | undefined, cap: number | null | undefined): number {
  if (used == null || cap == null || !(Number(cap) > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(used) / Number(cap)) * 100)));
}

/** "השתמשת ב-7 מתוך 10 החודש". */
export function usageLineHe(used: number | null | undefined, cap: number | null | undefined): string {
  if (used == null || cap == null) return 'בודקת כמה השתמשת החודש…';
  return `השתמשת ב-${used} מתוך ${cap} החודש`;
}

const NOUN: Record<AddonPackKey, { plain: string; def: string; title: string; what: string }> = {
  posts:    { plain: 'פוסטים',       def: 'הפוסטים',       title: 'פוסטים עם AI',   what: 'פוסטים מעוצבים עם טקסט ותמונה, מוכנים לשיתוף' },
  reels:    { plain: 'רילסים',       def: 'הרילסים',       title: 'רילסים עם AI',   what: 'תסריטי רילס עם הוראות צילום וכיתוביות' },
  advisor:  { plain: 'שאלות ליועצת', def: 'השאלות ליועצת', title: 'יועצת עסקית AI', what: 'שאלות ליועצת שמכירה את הנתונים של העסק שלך' },
  skinscan: { plain: 'סריקות עור',   def: 'סריקות העור',   title: 'סורק העור AI',   what: 'סריקות עור ללקוחות, עם דוח אישי לכל אחת' },
};

export const packTitleHe = (k: AddonPackKey) => NOUN[k].title;
export const packWhatHe = (k: AddonPackKey) => `עוד ${ADDON_PACKS[k].units} ${NOUN[k].what}, לחודש הזה`;

/**
 * The small button on each screen. Quiet below 80% ("רוצה עוד רילסים? לחצי כאן ✨"), the stronger nudge from 80% and at the cap.
 * It starts with a Hebrew word on purpose (see addonButtonHe): a label that starts with a digit can land at the wrong end in RTL.
 */
export function pageChipHe(k: AddonPackKey, level: UsageLevel): string {
  const n = NOUN[k];
  if (level === 'full') return `נגמרו ${n.def} של החודש. ${addonButtonHe(ADDON_PACKS[k])}`;
  if (level === 'near') return `כמעט נגמרו ${n.def} של החודש. ${addonButtonHe(ADDON_PACKS[k])}`;
  return `רוצה עוד ${n.plain}? לחצי כאן ✨`;
}

/** The price line Kalmea's own prices carry. Kalmea is an exempt dealer today: the price is final, nothing is added on top. */
export function priceNoteHe(status: KalmeaTaxStatus = KALMEA_TAX_STATUS): string {
  return status === 'licensed' ? 'כולל מע״מ' : 'מחיר סופי, בלי תוספות';
}

/** The confirm sheet: "39 ₪ יחויבו בכרטיס שמסתיים ב-4242". The digits of the card are isolated in the JSX. */
export function confirmChargeHe(price: number, last4: string): string {
  return `${priceHe(price)} יחויבו בכרטיס שמסתיים ב-${last4}`;
}

export function successHe(k: AddonPackKey, cap: number | null | undefined): string {
  return cap != null ? `החבילה נוספה 🌸 עכשיו יש לך ${cap} ${NOUN[k].plain} החודש` : 'החבילה נוספה 🌸 אפשר להמשיך ליצור';
}

/** What switching to yearly saves her: the months she does not pay. */
export function annualSavingHe(monthly: number): string {
  const free = 12 - ANNUAL_MONTHS_PAID;
  return `חוסכת ${priceHe(Math.round(Number(monthly) * free * 100) / 100)} בשנה`;
}

export type StoreCard =
  | { kind: 'pack'; key: AddonPackKey; usage: PackUsage }
  | { kind: 'annual'; monthly: number; yearly: number; pending: boolean }
  | { kind: 'referral' };

/**
 * The cards on the store, in order: packs (most-used first, so the one running out leads), then yearly, then the referral.
 * Only what she can really buy right now (owner rule 2026-11-09: nothing inactive is shown, no "coming soon"): packs only with packs
 * and billing on and a deployment that can charge; yearly only with its flag, its migration run, a chargeable deployment and her paying
 * monthly; the referral only with its flag and its tables in place. An empty list hides every entry point and every chip.
 */
export function storeCards(d: UpgradesData | null | undefined, env?: Record<string, string | undefined>): StoreCard[] {
  if (!d || !d.success) return [];
  const out: StoreCard[] = [];
  const packsOn = env ? addonPacksEnabled(env) : addonPacksEnabled();
  // Owner rule 2026-11-09: nothing that is not active yet is shown. A pack needs billing on AND a deployment that can really charge.
  if (packsOn && d.billing && d.configured && Array.isArray(d.packs)) {
    const ranked = [...d.packs].filter((p) => ADDON_PACKS[p.key]).sort((a, b) => usagePct(b.used, b.cap) - usagePct(a.used, a.cap));
    for (const p of ranked) out.push({ kind: 'pack', key: p.key, usage: p });
  }
  const annualOn = env ? annualPlanEnabled(env) : annualPlanEnabled();
  if (annualOn && d.billing && d.configured && d.annual && d.annual.ready && d.annual.billingPeriod !== 'annual') {
    out.push({ kind: 'annual', monthly: d.annual.monthly, yearly: d.annual.yearly, pending: d.annual.pendingPeriod === 'annual' });
  }
  const refOn = env ? referralsEnabled(env) : referralsEnabled();
  if (refOn && d.referrals) out.push({ kind: 'referral' });
  return out;
}

/** The pack she can buy for one screen, or null (packs off, billing off, or the server did not offer it). */
export function packFor(d: UpgradesData | null | undefined, k: AddonPackKey, env?: Record<string, string | undefined>): PackUsage | null {
  const c = storeCards(d, env).find((x) => x.kind === 'pack' && x.key === k);
  return c && c.kind === 'pack' ? c.usage : null;
}

/** The home card appears only when something is close to running out: the app is soft, it never sells on a quiet day. */
export function homeNudgePack(d: UpgradesData | null | undefined, env?: Record<string, string | undefined>): PackUsage | null {
  for (const c of storeCards(d, env)) if (c.kind === 'pack' && (usageLevel(c.usage.used, c.usage.cap) === 'near' || usageLevel(c.usage.used, c.usage.cap) === 'full')) return c.usage;
  return null;
}

/** A fresh id for one confirm sheet: a double tap sends the same id twice, and the server answers the second from the first. */
export function newRequestId(): string {
  try { return globalThis.crypto.randomUUID(); } catch { return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}

/** Opens the store; with a pack, straight at that pack's confirm sheet. Falls back to the billing add-ons when the store is not mounted. */
export function openUpgrades(pack?: AddonPackKey, target: { dispatchEvent?: (e: Event) => boolean; __kalmeaUpgradesMounted?: boolean } | undefined = typeof window !== 'undefined' ? (window as unknown as { dispatchEvent: (e: Event) => boolean; __kalmeaUpgradesMounted?: boolean }) : undefined): void {
  if (!target?.dispatchEvent) return;
  if (!target.__kalmeaUpgradesMounted) { target.dispatchEvent(new CustomEvent(OPEN_ADDONS_EVENT)); return; }
  target.dispatchEvent(new CustomEvent(UPGRADES_EVENT, { detail: pack ? { pack } : {} }));
}
