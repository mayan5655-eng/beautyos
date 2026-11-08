// lib/vatExemptCeiling.ts
//
// תקרת עוסק פטור: a gentle heads-up on "סיכום הכנסות" when an exempt dealer's income this year nears the yearly turnover
// ceiling, and again when it passes it. Israel-only, and the one thing an עוסקת פטורה most fears finding out late.
//
// ── THE CEILING: ONE CONSTANT, CHECK IT EVERY YEAR ─────────────────────────
// The ceiling is set by law and CHANGES (it is updated by the Tax Authority, usually from January). Nothing else in the
// repo or its docs held a value when this was written, so this is 120,000 ₪, the figure in use for 2025.
// לבדוק: confirm the current year's figure with an accountant or the Tax Authority (רשות המסים) every January, and change
// it HERE only. The screen prints the value it used, so a stale number is visible rather than silent.
export const VAT_EXEMPT_CEILING_NIS = 120_000; // לבדוק: verify every year
/** The year VAT_EXEMPT_CEILING_NIS was taken for. Bump it together with the value. */
export const VAT_EXEMPT_CEILING_CHECKED_FOR_YEAR = 2025;

/** "About 80%": the first, softer notice. */
export const VAT_EXEMPT_WARN_RATIO = 0.8;

export type CeilingWarning = {
  level: 'near' | 'over';
  /** Whole percent of the ceiling, for the sentence. */
  pct: number;
  ceiling: number;
  title: string;
  text: string;
};

const nis = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`;

/**
 * The warning for an exempt dealer, or null. Only for 'exempt', only from about 80% of the ceiling.
 * `yearToDate` is what she took this year so far (receipts, voids excluded), the same figure the screen sums.
 * It is an ESTIMATE from the payments recorded here, and the copy says so and sends her to her accountant.
 */
export function exemptCeilingWarning(
  { status, yearToDate, ceiling = VAT_EXEMPT_CEILING_NIS }: { status: unknown; yearToDate: unknown; ceiling?: number },
): CeilingWarning | null {
  if (status !== 'exempt') return null;
  const ytd = Number(yearToDate);
  if (!Number.isFinite(ytd) || ytd <= 0 || !(ceiling > 0)) return null;
  const ratio = ytd / ceiling;
  if (ratio < VAT_EXEMPT_WARN_RATIO) return null;
  const pct = Math.floor(ratio * 100);
  const tail = `החישוב לפי תקרה של ${nis(ceiling)}, ערך שמתעדכן מדי שנה.`;
  if (ratio >= 1) {
    return {
      level: 'over', pct, ceiling,
      title: 'נראה שעברת את תקרת עוסק פטור',
      text: `ההכנסות שנרשמו כאן השנה הן ${nis(ytd)}, מעל התקרה. זו הערכה בלבד, לפי התשלומים שבמערכת. כדאי לדבר עם רואה החשבון שלך בהקדם, כי ייתכן שצריך לעבור לעוסק מורשה. ${tail}`,
    };
  }
  return {
    level: 'near', pct, ceiling,
    title: 'את מתקרבת לתקרת עוסק פטור',
    text: `ההכנסות שנרשמו כאן השנה הן בערך ${pct}% מהתקרה. זו הערכה בלבד, לפי התשלומים שבמערכת. כדאי לבדוק עם רואה החשבון שלך מה זה אומר עבורך. ${tail}`,
  };
}
