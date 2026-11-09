// lib/grow/plans.ts
//
// Grow's clearing plans a cosmetician can pick when she opens a Grow account from Kalmea, in ONE place. The code is what Grow's
// lead registration (GetLink, lib/grow/registration.ts) takes as `price_quote`; the terms are what the plan picker
// (app/GrowRegistration.jsx) and the cost line (lib/growPricing.ts, app/GrowCostNote.jsx) show. A price change is a change here.
//
// These codes are NOT secret (Grow issued them for Kalmea's live onboarding, 2026-11). Every price is before VAT.
// Grow's full terms: GROW_FEES_URL.
//
// The server never trusts the string a browser sends: growPlanByCode() answers only for a code in this list, exactly.
// Pure: safe to import from the client and from tests.

export type GrowPlanCode = 'HHtyr57' | 'GHT57YT' | 'GHT57gy';

export type GrowPlan = {
  code: GrowPlanCode;
  /** Percent of every transaction. */
  feePercent: number;
  /** ₪ a month, before VAT. */
  monthly: number;
  billing: 'monthly' | 'annual' | 'annual-upfront';
  /** The card's title in the picker. */
  titleHe: string;
  /** One plain line under the title. */
  lineHe: string;
};

export const GROW_FEES_URL = 'https://grow.business/fees/';

export const GROW_PLANS: readonly GrowPlan[] = [
  { code: 'HHtyr57', feePercent: 0.75, monthly: 69, billing: 'monthly', titleHe: 'חודשי', lineHe: 'משלמים כל חודש, בלי התחייבות לשנה.' },
  { code: 'GHT57YT', feePercent: 0.75, monthly: 59, billing: 'annual', titleHe: 'שנתי', lineHe: 'המסלול השנתי של Grow: דמי חודש נמוכים יותר.' },
  { code: 'GHT57gy', feePercent: 1, monthly: 29, billing: 'annual-upfront', titleHe: 'שנתי בתשלום מראש', lineHe: 'משלמים מראש לשנה: דמי החודש הכי נמוכים, ועמלה קצת גבוהה יותר.' },
] as const;

/** The plan the picker starts on: monthly. */
export const DEFAULT_GROW_PLAN: GrowPlanCode = 'HHtyr57';

/** The plan for exactly this code, or null. Never trims, lowercases or guesses: anything not in GROW_PLANS is refused. */
export function growPlanByCode(v: unknown): GrowPlan | null {
  if (typeof v !== 'string') return null;
  return GROW_PLANS.find((p) => p.code === v) || null;
}

export const ils = (n: number) => `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** "₪69 לחודש + 0.75% מכל עסקה" */
export function growPlanPriceHe(p: GrowPlan): string {
  return `${ils(p.monthly)} לחודש + ${p.feePercent}% מכל עסקה`;
}
