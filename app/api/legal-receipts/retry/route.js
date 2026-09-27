// app/api/legal-receipts/retry/route.js
// Daily: retry the documents a provider DEFINITELY refused (a few times, never sooner
// than 30 minutes after the last try), and the credit requests that never went out.
// Rows we are unsure about ('unknown') are never touched here: only she can decide,
// after looking in her Morning account. See lib/legalReceipts/service.retryDue.

import { isAuthorizedCron, cronUnauthorized } from "../../../../lib/cronAuth";
import { adminDb } from "../../../../lib/legalReceipts/routeAuth";
import { createMorning } from "../../../../lib/legalReceipts/morning.js";
import { retryDue } from "../../../../lib/legalReceipts/service.js";

export const maxDuration = 120;

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  try {
    const r = await retryDue({ db: adminDb(), adapter: createMorning() });
    console.log(`[legal-receipts] retry: ${JSON.stringify(r)}`);
    return Response.json({ success: !r.error, ...r });
  } catch (e) {
    console.error("[legal-receipts] retry threw:", e?.message || String(e));
    return Response.json({ success: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
