// lib/demoTenants.ts
//
// The one place the two demo tenants' ids ever live. Every outbound guard
// (lib/whatsapp.js, lib/ai/usage.ts, lib/ai/openaiImages.ts,
// lib/legalReceipts/service.js, lib/facebook/client.ts), every cron fan-out
// that must skip them, and the UI's "is this a demo session" check all import
// from here - so there is exactly one list to update if a third demo tenant
// is ever added, and nowhere else can silently drift out of sync with it.
//
// Fixed, hardcoded UUIDs rather than a DB lookup: these two ids are provision
// artefacts (scripts/provision-demo-tenants.ts creates the `tenants` rows
// with these exact ids), not data the app discovers at runtime. A guard that
// had to query the database to know whether IT ITSELF is allowed to query
// the database would be circular, and a guard is exactly the kind of check
// that must still work when something else is broken.

export type DemoField = 'cosmetics' | 'nails';

export const DEMO_TENANT_IDS: Record<DemoField, string> = {
  cosmetics: '00000000-0000-0000-0000-000000000001',
  nails: '00000000-0000-0000-0000-000000000002',
};

export const DEMO_TENANT_ID_SET = new Set<string>(Object.values(DEMO_TENANT_IDS));

export function isDemoTenantId(tenantId: string | null | undefined): boolean {
  return !!tenantId && DEMO_TENANT_ID_SET.has(tenantId);
}

export function demoFieldForTenantId(tenantId: string | null | undefined): DemoField | null {
  if (!tenantId) return null;
  for (const [field, id] of Object.entries(DEMO_TENANT_IDS) as [DemoField, string][]) {
    if (id === tenantId) return field;
  }
  return null;
}

/** The fixed demo auth users scripts/provision-demo-tenants.ts creates once. */
export const DEMO_AUTH_EMAILS: Record<DemoField, string> = {
  cosmetics: 'demo-cosmetics@bloomos.internal',
  nails: 'demo-nails@bloomos.internal',
};
