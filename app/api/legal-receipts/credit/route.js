// app/api/legal-receipts/credit/route.js
// A void of a payment that HAS a provider document becomes a credit document
// (מסמך זיכוי) in her account. POST { voidId, confirmUnknown? }.
//
// The void row itself is written by the till, as before. This turns it into the
// legally correct act. A void of a payment with no provider document (anything
// from before she connected) has nothing legal to credit and stays internal.

import { requireOwner } from "../../../../lib/legalReceipts/routeAuth";
import { createMorning } from "../../../../lib/legalReceipts/morning.js";
import { creditForVoid } from "../../../../lib/legalReceipts/service.js";

const ID_RE = /^[0-9a-zA-Z-]{1,64}$/;

export async function POST(request) {
  const g = await requireOwner(request, { write: true });
  if (g.response) return g.response;
  let body = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }
  const voidId = String(body.voidId ?? "");
  if (!ID_RE.test(voidId)) return Response.json({ success: false, error: "מזהה לא תקין" }, { status: 400 });

  const r = await creditForVoid({
    db: g.db, tenantId: g.tenantId, voidId, adapter: createMorning(), confirmUnknown: body.confirmUnknown === true,
  });
  const v = r.void;
  return Response.json({
    success: r.status === "issued" || r.status === "none",
    status: r.status, skipped: r.skipped, error: r.error, number: r.number, url: r.url,
    void: v ? { id: v.id, receipt_id: v.receipt_id, credit_status: v.credit_status, credit_doc_number: v.credit_doc_number, credit_doc_url: v.credit_doc_url, credit_error: v.credit_error } : undefined,
  });
}
