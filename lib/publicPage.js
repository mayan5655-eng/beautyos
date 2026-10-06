// lib/publicPage.js
//
// Everything a stranger's first view of her page needs, in ONE database call.
//
// Found 2026-10-06 (the function's own timings, [slug-timing] in the logs): each database call from the
// function costs ~0.3 s on a warm connection and ~0.85 s on a fresh one, and the page made them in two serial
// stages - tenant by slug, THEN settings and services in parallel - so a view took 1.5-2.1 s of server time
// before a byte was sent. get_public_page(slug) returns the tenant, her public settings and her active services
// together (supabase/migrations/pending/public-page-one-call.sql).
//
// That migration is applied by hand, so this works on both sides of it, exactly like lib/publicServices.js:
//   * installed         -> { kind: 'found', tenant, settings, services }  or  { kind: 'none' } (no such business)
//   * not installed yet -> { kind: 'unavailable' }: the caller uses the old three calls. Remembered for ten
//                          minutes per server instance, so a missing function costs one failed call per window,
//                          not one per view;
//   * any other error   -> thrown. A failed read is never "no such business".

let missingUntil = 0;
const RECHECK_MS = 10 * 60 * 1000;

/** For tests: forget that the function was ever found missing. */
export function resetPublicPageMemo() { missingUntil = 0; }

const isMissingFunction = (e) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(String(e.message || '')));

export async function fetchPublicPage(client, slug, { now = Date.now } = {}) {
  if (!client || !slug) return { kind: 'none' };
  if (now() < missingUntil) return { kind: 'unavailable' };
  const { data, error } = await client.rpc('get_public_page', { p_slug: slug });
  if (error) {
    if (isMissingFunction(error)) {
      missingUntil = now() + RECHECK_MS;
      console.warn('[page] get_public_page is not installed yet - using the three separate reads. Run public-page-one-call.sql.');
      return { kind: 'unavailable' };
    }
    throw new Error(`public page lookup failed: ${error.message || error.code || 'unknown'}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !row.tenant || !row.tenant.id) return { kind: 'none' }; // the call WORKED: no such business
  return {
    kind: 'found',
    tenant: { id: row.tenant.id, name: row.tenant.name ?? '' },
    settings: row.settings && typeof row.settings === 'object' ? row.settings : null,
    services: Array.isArray(row.services) ? row.services : [],
  };
}
