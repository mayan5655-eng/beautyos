// lib/clientImages.js
// Storage helpers for client media. Client photos (faces, skin close-ups) are
// the most sensitive data in the system, so they live in a PRIVATE bucket and
// are served through short-lived signed URLs. Community post images are meant
// to be seen by other businesses in the public community feed, so they live in
// a separate PUBLIC bucket and keep working via getPublicUrl.

// Private: sensitive client images. Bucket must be set to PRIVATE in Supabase,
// with a per-tenant folder policy (see the SQL in the fix notes).
export const PRIVATE_BUCKET = "client-images";

// Public: community post images (intentionally shared across tenants).
export const PUBLIC_BUCKET = "community-images";

// Build a tenant-scoped object path for a client's private image. The tenant_id
// is the FIRST path segment so a storage RLS policy can restrict each tenant to
// her own folder: (storage.foldername(name))[1] = get_user_tenant_id()::text.
export function clientImagePath(tenantId, clientId, filename) {
  return `${tenantId}/clients/${clientId}/${filename}`;
}

// Normalize a stored value to a bare storage object path, so it can be signed.
// Accepts three shapes:
//   • a bare path (new format): "<tenant>/clients/<client>/x.jpg"  -> returned as-is
//   • a legacy public URL:  ".../object/public/client-images/<path>" -> "<path>"
//   • a signed URL:         ".../object/sign/client-images/<path>?token=..." -> "<path>"
// Returns null for empty input. Legacy objects (whose path does not start with
// the tenant_id) will only sign successfully after the one-time migration.
export function toStoragePath(stored) {
  if (!stored) return null;
  if (!/^https?:\/\//i.test(stored)) return stored; // already a bare path
  const m = stored.match(/\/client-images\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : stored;
}
