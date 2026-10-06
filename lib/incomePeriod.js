// lib/incomePeriod.js
//
// The income summary's period logic, as pure functions (the screen in app/beautyos.jsx calls these; test-income-period.ts tests them).
//
// TWO CONCERNS THAT WERE ONE. Her tax registration (settings.business_tax_status) decides how she REPORTS VAT:
//   exempt (עוסק פטור)  - no VAT at all, one annual figure
//   licensed / company  - VAT, by bi-monthly period
// It must NOT decide what she may LOOK AT. Month by month, her own income is for every tenant: gross, transaction count, by the
// month, with the year buttons. (The screen used to hide the whole period control for an exempt dealer, so most solo
// cosmeticians - exempt - could not see a month at all.)
//
// THE NET FIGURE. For a dealer who charges VAT, receipts include it, so net = gross / (1 + VAT). An exempt dealer charges no VAT, so
// what she took IS her turnover: net = gross, and no VAT is carved out of it. Dividing an exempt dealer's takings by 1.18 would
// understate her income by about 15%.

/** The period actually shown. Everyone may choose "monthly"; otherwise the default period of her registration. */
export function effectiveMode(status, mode) {
  if (mode === "monthly") return "monthly";
  return status === "exempt" ? "annual" : "bimonthly";
}

/** A predicate on a Date (local time) for the chosen period within the chosen year (the year is filtered by the caller). */
export function periodFilter({ mode, idx }) {
  if (mode === "monthly") return (d) => d.getMonth() === idx;
  if (mode === "bimonthly") return (d) => Math.floor(d.getMonth() / 2) === idx;
  return () => true; // annual
}

export function periodLabel({ mode, idx, year, monthNames }) {
  if (mode === "monthly") return `${monthNames[idx]} ${year}`;
  if (mode === "bimonthly") return `${monthNames[idx * 2]}–${monthNames[idx * 2 + 1]} ${year}`;
  return `שנת ${year}`;
}

/** Gross, net and VAT for a list of amounts taken in the period. */
export function incomeTotals(amounts, status, vatRate) {
  const gross = amounts.reduce((s, a) => s + (Number(a) || 0), 0);
  const exempt = status === "exempt";
  return {
    gross,
    net: exempt ? gross : gross / (1 + vatRate),
    vatDue: exempt ? 0 : (gross * vatRate) / (1 + vatRate),
    count: amounts.length,
  };
}
