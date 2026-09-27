// lib/legalReceipts/routeAuth.js
//
// The gate every legal-receipt route shares: a signed-in cosmetician, her tenant
// from HER session (never from the body), an active plan for anything that writes,
// and a rate limit. Returns { tenantId, db } or { response } to return as is.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../supabase/server";
import { requireActiveTenant } from "../planGuard";
import { checkIpLimit, checkTenantLimit } from "../rateLimit";

export const adminDb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** @param {Request} request @param {{ write?: boolean }} [opts] */
export async function requireOwner(request, { write = false } = {}) {
  const ipLimited = checkIpLimit(request, "legal-receipts");
  if (ipLimited) return { response: ipLimited };

  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { response: Response.json({ success: false, error: "לא מחוברת" }, { status: 401 }) };
  const { data: tenantId } = await session.rpc("get_user_tenant_id");
  if (!tenantId) return { response: Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 }) };
  if (write) {
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return { response: guard.response };
  }
  const tenantLimited = checkTenantLimit(tenantId, "legal-receipts");
  if (tenantLimited) return { response: tenantLimited };
  return { tenantId, db: adminDb() };
}
