// app/api/legal-receipts/issue/route.js
// Ask her provider to issue the legal document for one payment.
// POST { receiptId, confirmUnknown? } -> { success, status, receipt?, number?, url?, error? }
//
// Called by the till right AFTER the payment is recorded. It never blocks the
// sale: a failure leaves the payment intact with a state she can see, and is
// retried (see lib/legalReceipts/service.js for exactly when, and when never).
// confirmUnknown is her statement that she checked her Morning account and the
// document does not exist, which is the only way an unsure row is retried.

import { requireOwner } from "../../../../lib/legalReceipts/routeAuth";
import { createMorning } from "../../../../lib/legalReceipts/morning.js";
import { issueForReceipt } from "../../../../lib/legalReceipts/service.js";

const UUID_OR_INT = /^[0-9a-zA-Z-]{1,64}$/;

export async function POST(request) {
  const g = await requireOwner(request, { write: true });
  if (g.response) return g.response;
  let body = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }
  const receiptId = String(body.receiptId ?? "");
  if (!UUID_OR_INT.test(receiptId)) return Response.json({ success: false, error: "מזהה לא תקין" }, { status: 400 });

  const r = await issueForReceipt({
    db: g.db, tenantId: g.tenantId, receiptId, adapter: createMorning(), confirmUnknown: body.confirmUnknown === true,
  });
  // success = a document now exists. Every other state is reported, not thrown: the payment
  // itself is already safe in the till, and the caller shows the state.
  return Response.json({ success: r.status === "issued", ...r, receipt: r.receipt ? safeReceipt(r.receipt) : undefined });
}

/** Only what the till needs back; no provider internals. */
function safeReceipt(r) {
  return {
    id: r.id, legal_status: r.legal_status, legal_doc_number: r.legal_doc_number, legal_doc_type: r.legal_doc_type,
    legal_doc_url: r.legal_doc_url, legal_issued_at: r.legal_issued_at, legal_error: r.legal_error, legal_attempts: r.legal_attempts,
    legal_provider: r.legal_provider, legal_doc_id: r.legal_doc_id,
  };
}
