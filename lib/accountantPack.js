// lib/accountantPack.js
//
// "Send it to the accountant": the period on her income-summary screen as one
// Excel file - a summary sheet, every payment, every expense. Once a month (or
// every two, for a licensed dealer) she otherwise copies these by hand from the
// app into whatever the accountant asked for. Pure; the screen
// (app/beautyos.jsx, tax tab) turns the rows into a workbook with xlsx.
//
// It is a working file, not a filing: the numbers are the same estimates the
// screen shows, and the summary says so in its last line.

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

/** "YYYY-MM-DD" in Israel time for a receipt's created_at. */
function israelDay(ts, parse) {
  const d = parse ? parse(ts) : new Date(ts);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Profit before income tax for the period: income without VAT minus expenses without VAT.
 * An exempt dealer charges no VAT and reclaims none, so both sides are taken whole.
 */
export function periodProfit({ net, expensesTotal, inputVat, status }) {
  const exempt = status === "exempt";
  return net - (exempt ? expensesTotal : expensesTotal - inputVat);
}

export function accountantSheets({ businessName, statusLabel, rangeLabel, status, totals, expensesTotal, inputVat, receipts, expenses, parse = undefined }) {
  const exempt = status === "exempt";
  const profit = periodProfit({ net: totals.net, expensesTotal, inputVat, status });
  const summary = [
    ["עסק", businessName || ""],
    ["סטטוס", statusLabel],
    ["תקופה", rangeLabel],
    [],
    [exempt ? "מחזור (ללא מע\"מ)" : "מחזור ברוטו (כולל מע\"מ)", r2(totals.gross)],
    ...(exempt ? [] : [["מחזור נטו (לפני מע\"מ)", r2(totals.net)], ["מס עסקאות", r2(totals.vatDue)]]),
    ["מספר עסקאות", totals.count],
    [exempt ? "הוצאות" : "הוצאות (כולל מע\"מ)", r2(expensesTotal)],
    ...(exempt ? [] : [["מס תשומות", r2(inputVat)], ["מע\"מ סופי (חיובי = לתשלום)", r2(totals.vatDue - inputVat)]]),
    ["רווח לפני מס הכנסה (הערכה)", r2(profit)],
    [],
    ["הקובץ הוא ריכוז עבודה מתוך Kalmea, לא דוח רשמי. המסמכים החוקיים הם הקבלות והחשבוניות שהופקו בתוכנת החשבוניות."],
  ];
  const receiptRows = [["תאריך", "לקוחה", "טיפול / פריטים", "אמצעי תשלום", "סכום", "טיפ"]];
  for (const r of [...(receipts || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    receiptRows.push([israelDay(r.created_at, parse), r.client_name || "", r.service || "", r.payment_method || r.method || "", r2(r.amount), r2(r.tip)]);
  }
  const expenseRows = [["תאריך", "קטגוריה", "תיאור", exempt ? "סכום" : "סכום (כולל מע\"מ)"]];
  for (const e of [...(expenses || [])].sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)))) {
    expenseRows.push([e.expense_date || "", e.category || "", e.description || "", r2(e.amount)]);
  }
  return { summary, receipts: receiptRows, expenses: expenseRows, profit };
}
