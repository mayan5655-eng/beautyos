// lib/legalReceipts/policy.js
//
// Legal receipts: the rules, as pure functions.
//
// THE PRINCIPLE. We do NOT issue tax documents. Issuing one legally needs a
// product registered with the Tax Authority, so a document is created by a
// registered provider (Morning first) inside the cosmetician's OWN account, under
// her own business number and her own numbering. What the till writes is a
// PAYMENT RECORD. Until a provider document exists for it, the app calls it
// "אישור תשלום" (payment confirmation), never "קבלה", because a receipt is
// exactly the thing it is not.
//
// Optional per clinic: a clinic with no connected account works as it always did.

export const PROVIDER_MORNING = "morning";

export const PAYMENT_NOTICE_HE = "אישור תשלום";
export const PAYMENT_NOTICES_HE = "אישורי תשלום";

/** The two documents her registration allows for a payment received. */
const DOC_TYPES = {
  receipt: { key: "receipt", code: 400, labelHe: "קבלה" },
  tax_invoice_receipt: { key: "tax_invoice_receipt", code: 320, labelHe: "חשבונית מס קבלה" },
};

/**
 * What she issues, from her registration (settings.business_tax_status).
 * An exempt dealer (עוסק פטור) may not issue a tax invoice, so she issues a
 * receipt; an authorized dealer or a company issues a tax invoice-receipt.
 * The app's own default for an unset status is "exempt", so this matches it.
 */
export function docTypeFor(taxStatus) {
  const s = String(taxStatus || "exempt");
  return s === "licensed" || s === "company" ? DOC_TYPES.tax_invoice_receipt : DOC_TYPES.receipt;
}

/** The document type KEY stored on the receipt row -> its Hebrew name. */
export function docNameHe(key) {
  return (DOC_TYPES[key] || DOC_TYPES.receipt).labelHe;
}

/** A payment that needs a document: money actually changed hands. A visit covered by a package, or a zero, has none. */
export function needsLegalDoc(receipt, packageMethod = "חבילה") {
  const amount = Number(receipt?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (String(receipt?.payment_method || "") === packageMethod) return false;
  return true;
}

/**
 * What to call a payment record. "קבלה" (or "חשבונית מס קבלה") ONLY when a
 * provider document really exists for it; everything else is a payment confirmation.
 */
export function docLabelHe(receipt) {
  if (receipt && receipt.legal_status === "issued") return docNameHe(receipt.legal_doc_type);
  return PAYMENT_NOTICE_HE;
}

/** The short state line shown beside a record, or "" when there is nothing to say. */
export function legalStateHe(receipt) {
  const st = receipt?.legal_status;
  if (st === "issued") {
    const n = receipt.legal_doc_number ? ` מספר ${receipt.legal_doc_number}` : "";
    return `${docNameHe(receipt.legal_doc_type)}${n}`;
  }
  if (st === "pending") return "ממתין להנפקת מסמך";
  if (st === "failed") return "המסמך עוד לא הונפק. ננסה שוב";
  if (st === "unknown") return "לא בטוחות שהמסמך הונפק. כדאי לבדוק בחשבון";
  return "";
}

/** The credit side of a void, same idea. */
export function creditStateHe(v) {
  const st = v?.credit_status;
  if (st === "issued") return `מסמך זיכוי${v.credit_doc_number ? ` מספר ${v.credit_doc_number}` : ""}`;
  if (st === "pending") return "ממתין להנפקת מסמך זיכוי";
  if (st === "failed") return "מסמך הזיכוי עוד לא הונפק. ננסה שוב";
  if (st === "unknown") return "לא בטוחות שמסמך הזיכוי הונפק. כדאי לבדוק בחשבון";
  return "";
}

/**
 * How a provider call ended, from what we can tell.
 *  - 'auth'       the account's keys are wrong or revoked: nothing was created
 *  - 'definite'   the provider answered "no" (validation, 4xx, rate limit): nothing was created
 *  - 'ambiguous'  no answer we can trust (timeout, network drop, 5xx): the document MAY exist
 * Only 'ambiguous' is dangerous: retrying it blindly could issue a legal document twice.
 * @param {{ httpStatus?: number, networkError?: boolean }} r
 */
export function classifyFailure(r) {
  if (r.networkError) return "ambiguous";
  const s = Number(r.httpStatus);
  if (s === 401 || s === 403) return "auth";
  if (s === 408 || s >= 500) return "ambiguous";
  return "definite";
}

/** The status a row takes after a failed attempt. */
export function statusAfterFailure(kind) {
  return kind === "ambiguous" ? "unknown" : "failed";
}

export const MAX_AUTO_ATTEMPTS = 5;

/**
 * May the daily job try this again by itself? Only after a DEFINITE failure
 * (nothing was created), a few times, and never one we are unsure about.
 */
export function shouldAutoRetry({ status, attempts, ageMinutes }) {
  if (status !== "failed") return false;
  if ((Number(attempts) || 0) >= MAX_AUTO_ATTEMPTS) return false;
  return (Number(ageMinutes) || 0) >= 30;
}
