// lib/legalReceipts/spec.js
//
// Turning one of our payment records into a Morning document, and a void into a
// credit document. Pure: no network, so every mapping is a test.
//
// FIELD NAMES AND CODES come from Morning's own client library. Checked against Morning's SANDBOX on 2026-11-03 (exempt dealer):
// card, cash and transfer receipts, a negative discount row, vatType 0, a payment dated before the document, and the cancelling
// document all accepted; Bit and PayBox appType read back from Morning's documents. Still open: a licensed dealer's documents (320/330).
// Re-run node --env-file=.env.local scripts/morning-sandbox-check.mjs before switching MORNING_ENV to production.

import { docTypeFor } from "./policy.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Morning's appType for a payment-app payment (type 10); Morning refuses type 10 without it. Read back from Morning's own sandbox
 * documents on 2026-11-03 (#80011-#80016, appType 1-6): 1 bit, 2 Pay, 3 PayBox, 4 Colu, 5 Google Pay, 6 Apple Pay. A method missing
 * here is filed as "other" (type 11), never as the wrong app.
 * @type {Record<string, number | null>}
 */
export const MORNING_APP_TYPES = { "ביט": 1, "פייבוקס": 3 };

/** Our payment method -> Morning payment fields. */
export function paymentFor(method, amount, date) {
  const base = { date, price: round2(amount), currency: "ILS" };
  switch (String(method || "")) {
    case "מזומן": return { ...base, type: 1 };
    case "אשראי": return { ...base, type: 3, dealType: 1, cardType: 0 }; // sandbox 2026-11-03: accepted with no card number or type
    case "ביט":
    case "פייבוקס": {
      const app = MORNING_APP_TYPES[String(method)];
      return app ? { ...base, type: 10, appType: app } : { ...base, type: 11 };
    }
    case "העברה": return { ...base, type: 4 };                            // bank transfer (sandbox: accepted, #80017)
    default: return { ...base, type: 11 };                                // other
  }
}

/** The payment lines of a record, whichever way it was stored (split or single). */
function paymentLines(receipt) {
  let raw = receipt.payments;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((p) => p && typeof p.method === "string").map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));
  }
  return [{ method: receipt.payment_method || "מזומן", amount: Number(receipt.amount) || 0 }];
}

/** The income rows: her items, then the discount as a negative row (UNVERIFIED: a `discount` object may be preferred). */
export function incomeRows(receipt, taxStatus) {
  let items = receipt.items;
  if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = null; } }
  const vat = docTypeFor(taxStatus).key === "tax_invoice_receipt" ? 1 : 0; // her prices include VAT
  const rows = [];
  for (const it of Array.isArray(items) ? items : []) {
    const price = round2(it.price), qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
    if (!(price > 0)) continue;
    rows.push({ description: String(it.name || receipt.service || "טיפול").slice(0, 120), quantity: qty, price, currency: "ILS", vatType: vat });
  }
  const discount = round2(receipt.discount);
  if (rows.length && discount > 0) rows.push({ description: "הנחה", quantity: 1, price: -discount, currency: "ILS", vatType: vat });

  // Rows must add up to what was paid. If they do not (an old record, an odd item), one honest line beats a wrong document.
  const sum = round2(rows.reduce((s, r) => s + r.price * r.quantity, 0));
  const amount = round2(receipt.amount);
  if (!rows.length || sum !== amount) {
    return [{ description: String(receipt.service || "טיפול").slice(0, 120), quantity: 1, price: amount, currency: "ILS", vatType: vat }];
  }
  return rows;
}

/** @returns {string} YYYY-MM-DD in Israel */
export function israelDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The document for one payment.
 * @param {{ receipt: object, taxStatus?: string, client?: {name?: string, email?: string, phone?: string}, date?: string, paymentDate?: string }} p
 * paymentDate: the day the money was received. The document itself is dated the day it is issued (Morning may refuse a past document
 * date), but a payment filed by the next day's retry keeps its real day in her books (2026-11-02 audit). UNVERIFIED against Morning:
 * scripts/morning-sandbox-check.mjs should confirm a payment line dated before the document is accepted.
 */
export function buildDocument({ receipt, taxStatus, client, date, paymentDate }) {
  const day = date || israelDate();
  const paidOn = paymentDate || day;
  const t = docTypeFor(taxStatus);
  /** @type {Record<string, any>} */
  const cl = { name: String(client?.name || receipt.client_name || "לקוחה").slice(0, 100), add: false };
  if (client?.email) cl.emails = [String(client.email)];
  if (client?.phone) cl.phone = String(client.phone);
  return {
    type: t.code,
    lang: "he",
    currency: "ILS",
    vatType: 0,           // Morning decides from her business type
    date: day,
    description: String(receipt.service || "").slice(0, 200) || undefined,
    // Our own reference, so a document can be found again if a call's outcome is unclear.
    remarks: `BOS:${receipt.id}`,
    signed: true,         // UNVERIFIED: digital signature flag
    attachment: false,    // she sends it herself, from the app (WhatsApp); Morning does not email
    client: cl,
    income: incomeRows(receipt, taxStatus),
    payment: paymentLines(receipt).filter((l) => l.amount > 0).map((l) => paymentFor(l.method, l.amount, paidOn)),
  };
}

/**
 * The document that cancels a document she issued, linked to the original (linkType "cancel") so both show as cancelled in her account.
 * Morning sandbox, 2026-11-03: an EXEMPT dealer may not issue a credit invoice (type 330 refused, error 2403 "not documented for this
 * business type"); her receipt (400) is cancelled by another 400 with negative rows and payment, linked to it (accepted, #80005).
 * A licensed dealer's tax invoice-receipt (320) is credited with a 330 as before. UNVERIFIED for licensed: the sandbox run was exempt.
 * @param {{ receipt: object, originalDocId: string, taxStatus?: string, client?: object, date?: string, reason?: string }} p
 */
export function buildCredit({ receipt, originalDocId, taxStatus, client, date, reason }) {
  const doc = buildDocument({ receipt, taxStatus, client, date });
  const exempt = docTypeFor(taxStatus).key !== "tax_invoice_receipt";
  return {
    ...doc,
    type: exempt ? doc.type : 330,
    description: ((exempt ? "ביטול" : "זיכוי") + (reason ? `: ${String(reason).slice(0, 150)}` : "")).slice(0, 200),
    remarks: `BOS:${receipt.id}:credit`,
    income: doc.income.map((r) => ({ ...r, price: -r.price })),
    payment: doc.payment.map((p) => ({ ...p, price: -p.price })),
    linkedDocumentIds: [String(originalDocId)],
    linkType: "cancel",
  };
}
