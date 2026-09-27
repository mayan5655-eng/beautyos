// lib/legalReceipts/spec.js
//
// Turning one of our payment records into a Morning document, and a void into a
// credit document. Pure: no network, so every mapping is a test.
//
// FIELD NAMES AND CODES come from Morning's own client library (document type
// codes, payment type codes, income/payment/document field names, linkType). They
// have NOT been exercised against a real Morning account yet: run
//     node --env-file=.env.local scripts/morning-sandbox-check.mjs
// against a SANDBOX account before this touches production. Three details are
// judgement calls the sandbox must confirm, each marked UNVERIFIED below.

import { docTypeFor } from "./policy.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Our payment method -> Morning payment fields. */
export function paymentFor(method, amount, date) {
  const base = { date, price: round2(amount), currency: "ILS" };
  switch (String(method || "")) {
    case "מזומן": return { ...base, type: 1 };
    case "אשראי": return { ...base, type: 3, dealType: 1, cardType: 0 }; // UNVERIFIED: card number/type may be required
    case "ביט":
    case "פייבוקס": return { ...base, type: 10 };                        // payment app
    case "העברה": return { ...base, type: 4 };                            // bank transfer
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
 * @param {{ receipt: object, taxStatus?: string, client?: {name?: string, email?: string, phone?: string}, date?: string }} p
 */
export function buildDocument({ receipt, taxStatus, client, date }) {
  const day = date || israelDate();
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
    payment: paymentLines(receipt).filter((l) => l.amount > 0).map((l) => paymentFor(l.method, l.amount, day)),
  };
}

/**
 * The credit document (מסמך זיכוי, type 330) that cancels a document she issued.
 * Linked to the original so both show as cancelled/credited in her account.
 * UNVERIFIED: negative amounts (per Morning's library notes) and whether a receipt
 * (type 400, exempt dealers) is credited the same way as a tax invoice-receipt.
 * @param {{ receipt: object, originalDocId: string, taxStatus?: string, client?: object, date?: string, reason?: string }} p
 */
export function buildCredit({ receipt, originalDocId, taxStatus, client, date, reason }) {
  const doc = buildDocument({ receipt, taxStatus, client, date });
  return {
    ...doc,
    type: 330,
    description: ("זיכוי" + (reason ? `: ${String(reason).slice(0, 150)}` : "")).slice(0, 200),
    remarks: `BOS:${receipt.id}:credit`,
    income: doc.income.map((r) => ({ ...r, price: -r.price })),
    payment: doc.payment.map((p) => ({ ...p, price: -p.price })),
    linkedDocumentIds: [String(originalDocId)],
    linkType: "cancel",
  };
}
