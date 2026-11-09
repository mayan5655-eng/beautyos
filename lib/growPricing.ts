// lib/growPricing.ts
//
// What card clearing through Grow costs HER, in one place. Shown wherever Kalmea offers her card payments (app/GrowCard.jsx,
// app/GiftVoucherMarketingCard.jsx, the help text in lib/helpSections.ts) so the cost is never a surprise after she connects.
//
// The plans themselves (code, monthly fee, percent) live in lib/grow/plans.ts only: the plan picker at registration and this
// cost line read the same list, so what she picks is what she was told. A price change is a change there and nowhere else.

import { GROW_PLANS, GROW_FEES_URL, growPlanPriceHe, ils, type GrowPlan } from './grow/plans.ts';

export { GROW_FEES_URL };

/** What every plan shares (Grow, 2026-11). */
export const GROW_PRICING = {
  /** Transactions and documents included every month. */
  includedTransactions: 100,
  includedDocuments: 100,
  /** ₪ for each transaction or document above the included amount. */
  overage: 0.5,
} as const;

type Pricing = { [K in keyof typeof GROW_PRICING]: number };

const BILLING_HE: Record<GrowPlan['billing'], string> = { monthly: 'חודשי', annual: 'שנתי', 'annual-upfront': 'שנתי מראש' };

/** The one short line: the three plans, before VAT. */
export function growCostLineHe(plans: readonly GrowPlan[] = GROW_PLANS): string {
  const parts = plans.map((p) => `${ils(p.monthly)} לחודש + ${p.feePercent}% (${BILLING_HE[p.billing]})`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} או ${parts[parts.length - 1]}` : parts.join('');
  return `הסליקה דרך Grow, שלושה מסלולים לבחירה: ${list}. לפני מע״מ.`;
}

/** "מה זה כולל?": every plan in a plain line, then what they share. */
export function growCostDetailsHe(p: Pricing = GROW_PRICING, plans: readonly GrowPlan[] = GROW_PLANS): string[] {
  return [
    ...plans.map((x) => `${x.titleHe}: ${growPlanPriceHe(x)}. ${x.lineHe}`),
    'העמלה באותו שיעור באשראי, בביט ובארנקים דיגיטליים.',
    `כולל ${p.includedTransactions} עסקאות ו-${p.includedDocuments} מסמכים בחודש. מעבר לזה ${ils(p.overage)} לכל אחד.`,
    'הכסף זמין בחשבון ה-Grow שלך מה-1 בחודש הבא, וחלק ממנו כבר במהלך החודש, לפי מסלול התשלומים של Grow.',
    'התשלום הוא ישירות ל-Grow. כל המחירים לפני מע״מ.',
  ];
}
