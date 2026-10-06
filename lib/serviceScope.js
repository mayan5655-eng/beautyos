// lib/serviceScope.js
//
// Her services are the service_prices rows whose tenant_id is hers - and nothing else.
//
// Found 2026-10-06 on a brand-new empty tenant: her cashier and calendar listed 21 services,
// her checklist said "services ✓ done", and her own public page said "treatments are being
// prepared". The 21 were other businesses' menus: service_prices is readable across tenants
// (the public booking page needs an anonymous read, and the policy that allows it also
// reached signed-in users), and the dashboard read the whole table with no tenant filter,
// trusting RLS to scope it. Every other table it reads was scoped correctly; this one was not.
//
// Defence in depth, both halves: the database policy is tightened by
// supabase/migrations/pending/service-prices-tenant-isolation.sql, and the app no longer
// believes a row is hers just because it arrived.

/** Only the rows that belong to `tenantId`. With no tenant id nothing can be hers, so nothing is. */
export function ownServices(rows, tenantId) {
  if (!tenantId || !Array.isArray(rows)) return [];
  return rows.filter((r) => r && r.tenant_id === tenantId);
}
