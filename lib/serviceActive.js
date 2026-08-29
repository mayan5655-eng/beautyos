// lib/serviceActive.js
//
// One definition of "this service is on the menu".
//
// service_prices.active is nullable and predates being used as a flag, so rows
// created before it existed hold NULL rather than true. The app has always
// treated NULL as active (`s.active !== false`), and any server query written
// as `.eq('active', true)` silently disagrees with that — it drops those rows.
// The failure is invisible: the feature works, the list is just quietly short.
//
// So both halves live here, and every reader uses one of them.

/** Client-side predicate. NULL / undefined count as active. */
export const isServiceActive = (s) => s?.active !== false;

/**
 * PostgREST filter matching the same rule, for `.or(...)`.
 * Use as: supabase.from('service_prices').eq('tenant_id', t).or(ACTIVE_OR_NULL)
 */
export const ACTIVE_OR_NULL = 'active.is.null,active.eq.true';
