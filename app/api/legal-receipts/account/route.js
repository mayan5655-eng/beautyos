// app/api/legal-receipts/account/route.js
// Her connection to a registered receipt provider (Morning).
//   GET     -> { connected, provider, environment, businessName, needsReconnect }  (never the keys)
//   POST    { keyId, secret } -> verifies the keys with Morning, then stores them ENCRYPTED
//   DELETE  -> disconnects (her documents stay in her Morning account, untouched)
//
// Optional per clinic: until she connects, the app works exactly as before.

import { requireOwner } from "../../../../lib/legalReceipts/routeAuth";
import { createMorning, morningConfig } from "../../../../lib/legalReceipts/morning.js";
import { getAccount, publicStatus, connectAccount, disconnectAccount } from "../../../../lib/legalReceipts/service.js";

export async function GET(request) {
  const g = await requireOwner(request);
  if (g.response) return g.response;
  const { account, migrationMissing } = await getAccount(g.db, g.tenantId);
  return Response.json({ success: true, migrationMissing: !!migrationMissing, ...publicStatus(account, morningConfig()) });
}

export async function POST(request) {
  const g = await requireOwner(request, { write: true });
  if (g.response) return g.response;
  let body = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }
  const r = await connectAccount({ db: g.db, tenantId: g.tenantId, keyId: body.keyId, secret: body.secret, adapter: createMorning() });
  if (!r.ok) return Response.json({ success: false, error: r.error, migrationMissing: !!r.migrationMissing }, { status: r.migrationMissing ? 503 : 400 });
  return Response.json({ success: true, businessName: r.businessName, environment: r.environment });
}

export async function DELETE(request) {
  const g = await requireOwner(request, { write: true });
  if (g.response) return g.response;
  const r = await disconnectAccount({ db: g.db, tenantId: g.tenantId });
  return Response.json({ success: r.ok }, { status: r.ok ? 200 : 500 });
}
