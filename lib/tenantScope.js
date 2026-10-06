// lib/tenantScope.js
//
// A row is hers only if its tenant_id is hers - whatever the database policy happens to allow.
//
// Same lesson as lib/serviceScope.js (service_prices was readable across tenants and the dashboard trusted RLS to scope it), applied
// to the route handlers that read ONE row by id or by "the active one": app/api/designs/[id] and app/api/marketing/campaigns. Defence in
// depth, both halves: the policy is the first wall, and the handler no longer believes a row is hers just because it arrived.

/** The row, but only when it belongs to `tenantId`. No tenant id, or someone else's row, is null - indistinguishable from "not there". */
export function ownRow(row, tenantId) {
  return row && tenantId && row.tenant_id === tenantId ? row : null;
}

/** The signed-in user's tenant id, or null (no session, no tenant, or the lookup failed). */
export async function callerTenantId(supabase) {
  try {
    const { data } = await supabase.rpc('get_user_tenant_id');
    return typeof data === 'string' && data ? data : null;
  } catch {
    return null;
  }
}
