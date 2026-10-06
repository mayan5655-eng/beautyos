// lib/publicServices.js
//
// The services a visitor to HER public page is shown: her active ones, and nobody else's.
//
// Reads through the get_public_services RPC (supabase/migrations/pending/
// service-prices-tenant-isolation.sql). The RPC exists so the table itself can stop being
// readable by anonymous callers - until then anyone could list every business's menu AND every
// tenant id, which is what the public booking and skin-scan endpoints take as input.
//
// That migration is applied by hand, so this has to work on both sides of it:
//   * RPC present  -> use it;
//   * RPC missing  -> fall back to the table, scoped to this tenant, exactly as before. Loudly:
//                     a console warning, so "the migration has not run" is visible rather than
//                     assumed;
//   * any other error -> returned as an error. A failed read is not an empty menu (the page
//     degrades to loading it in the browser, never to "no treatments").

import { ACTIVE_OR_NULL } from './serviceActive.js';

// Once the function is known to be missing, stop asking for a while: every page view used to make one wasted,
// failing round trip before the fallback (found 2026-10-06: it showed in the logs on every request, and each
// database call from the function is expensive). Per server instance, so a freshly installed function is
// picked up within the window.
let rpcMissingUntil = 0;
const RPC_RECHECK_MS = 10 * 60 * 1000;

const isMissingFunction = (e) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(String(e.message || '')));

/** For tests: forget that the function was ever found missing. */
export function resetPublicServicesMemo() { rpcMissingUntil = 0; }

export async function fetchPublicServices(client, tenantId, { now = Date.now } = {}) {
  if (!client || !tenantId) return { data: null, error: new Error('no tenant') };
  if (now() >= rpcMissingUntil) {
    try {
      const viaRpc = await client.rpc('get_public_services', { p_tenant_id: tenantId });
      if (!viaRpc.error) return { data: Array.isArray(viaRpc.data) ? viaRpc.data : [], error: null };
      if (!isMissingFunction(viaRpc.error)) return { data: null, error: viaRpc.error };
      rpcMissingUntil = now() + RPC_RECHECK_MS;
      console.warn('[services] get_public_services is not installed yet - reading the table directly. Run service-prices-tenant-isolation.sql.');
    } catch (e) {
      return { data: null, error: e };
    }
  }
  const direct = await client.from('service_prices').select('*').eq('tenant_id', tenantId).or(ACTIVE_OR_NULL);
  return direct.error ? { data: null, error: direct.error } : { data: direct.data || [], error: null };
}
