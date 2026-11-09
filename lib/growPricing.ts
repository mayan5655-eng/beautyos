// lib/growPricing.ts
//
// What card clearing through Grow costs HER, in one place. Grow confirmed (2026-11): every business that connects to Kalmea
// for card clearing is on Grow's own track. Shown wherever Kalmea offers her card payments (app/GrowCard.jsx,
// app/GiftVoucherMarketingCard.jsx, the help text in lib/helpSections.ts) so the cost is never a surprise after she
// connects. A price change is a change here and nowhere else.

export const GROW_PRICING = {
  /** ₪ a month on the annual track, paid upfront for the year. */
  monthlyAnnual: 59,
  /** ₪ paid upfront for the annual track (12 x monthlyAnnual). */
  annualUpfront: 708,
  /** ₪ a month on the month-to-month track. */
  monthly: 69,
  /** Percent of every transaction: credit cards, Bit and digital wallets alike. */
  feePercent: 0.75,
  /** Transactions and documents included every month. */
  includedTransactions: 100,
  includedDocuments: 100,
  /** ₪ for each transaction or document above the included amount. */
  overage: 0.5,
} as const;

type Pricing = { [K in keyof typeof GROW_PRICING]: number };

const ils = (n: number) => `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** The one short line: what she pays Grow, before VAT. */
export function growCostLineHe(p: Pricing = GROW_PRICING): string {
  return `הסליקה דרך Grow, במסלול שלהם: ${ils(p.monthlyAnnual)} לחודש + ${p.feePercent}% מכל עסקה, לפני מע״מ.`;
}

/** "מה זה כולל?": the whole track in plain lines. */
export function growCostDetailsHe(p: Pricing = GROW_PRICING): string[] {
  return [
    `${ils(p.monthlyAnnual)} לחודש בתשלום שנתי (${ils(p.annualUpfront)} מראש), או ${ils(p.monthly)} לחודש בתשלום חודשי.`,
    `${p.feePercent}% מכל עסקה, באותו שיעור באשראי, בביט ובארנקים דיגיטליים.`,
    `כולל ${p.includedTransactions} עסקאות ו-${p.includedDocuments} מסמכים בחודש. מעבר לזה ${ils(p.overage)} לכל אחד.`,
    'הכסף זמין בחשבון ה-Grow שלך מה-1 בחודש הבא, וחלק ממנו כבר במהלך החודש, לפי מסלול התשלומים של Grow.',
    'התשלום הוא ישירות ל-Grow. כל המחירים לפני מע״מ.',
  ];
}
