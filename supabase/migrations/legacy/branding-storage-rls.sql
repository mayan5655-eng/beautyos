-- branding-storage-rls.sql
-- REVIEW ONLY — do NOT run yet. Do NOT deploy to Production. Do NOT merge to main.
--
-- Tenant-safe Storage RLS for the branding uploader (logo/hero) and the existing
-- community-post uploader. Both write to the PUBLIC bucket "community-images"
-- under a tenant-scoped FIRST folder:
--     community images : "<tenant_id>/<ts>.jpg"                     (uploadPostImage)
--     branding assets  : "<tenant_id>/branding/<asset>_<ts>.<ext>" (uploadBrandAsset)
--
-- PRIMARY SUSPECTED ROOT CAUSE of the failing branding upload
-- ----------------------------------------------------------------------------
-- uploadBrandAsset() calls storage.upload(path, file, { upsert:true }).
-- An upsert compiles to  INSERT ... ON CONFLICT DO UPDATE , so Postgres requires
-- BOTH an INSERT policy AND an UPDATE policy to be present on storage.objects —
-- even for a brand-new object that never actually conflicts.
-- The community uploader (uploadPostImage) does NOT pass upsert, so a plain
-- INSERT policy has been sufficient for it. That is why community images upload
-- fine but branding fails with a 403 / "new row violates row-level security
-- policy" — the UPDATE policy the upsert needs is missing.
--
-- Two independent ways to fix (pick one; this file is the policy route):
--   (A) Add the missing UPDATE policy (below). Keeps upsert semantics.
--   (B) Drop `upsert:true` in uploadBrandAsset — filenames are already unique
--       (`<key>_<Date.now()>.<ext>`), so upsert is never needed. One-line code
--       change, no new policy required. (Not done here — code untouched.)
--
-- get_user_tenant_id() = the caller's tenant uuid (same function used by table
-- RLS and column defaults, e.g. slot-offers.sql). Storage object "name" is the
-- object path; (storage.foldername(name))[1] is its FIRST folder segment.
-- RLS is already enabled on storage.objects by Supabase — no toggle needed.
--
-- READS: this bucket is intentionally PUBLIC and cross-tenant (the community
-- feed shows OTHER businesses' images; branding assets are served to public
-- customer pages via getPublicUrl). Public read is handled by the bucket's
-- public flag and needs no SELECT policy. The authenticated SELECT below is
-- deliberately NOT tenant-scoped — narrowing reads to one tenant would break the
-- community feed. Only WRITES (insert/update/delete) are tenant-scoped.
--
-- NOTE: reconcile with any existing policies on this bucket that may use
-- different names (whatever currently lets community uploads through). Multiple
-- permissive policies for the same action are OR'd together; duplicate NAMES
-- error. Review existing policies in Dashboard → Storage → Policies before running.

-- Writes: only into your OWN tenant's first folder ------------------------------

drop policy if exists "community-images tenant insert" on storage.objects;
create policy "community-images tenant insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = get_user_tenant_id()::text
  );

drop policy if exists "community-images tenant update" on storage.objects;
create policy "community-images tenant update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = get_user_tenant_id()::text
  )
  with check (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = get_user_tenant_id()::text
  );

drop policy if exists "community-images tenant delete" on storage.objects;
create policy "community-images tenant delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = get_user_tenant_id()::text
  );

-- Reads: authenticated in-app read stays cross-tenant (community feed). Public
-- customer pages read via the bucket's public flag and need no policy. --------

drop policy if exists "community-images authenticated read" on storage.objects;
create policy "community-images authenticated read"
  on storage.objects for select to authenticated
  using ( bucket_id = 'community-images' );

-- Post-apply verification (run as the CLINIC user, not service_role):
--   1) Upload logo in Settings → מיתוג; expect 200 + object at
--      "<your tenant_id>/branding/logo_<ts>.png".
--   2) Negative test: attempt an upload whose first folder is a DIFFERENT
--      tenant_id; expect 403 (tenant isolation holds).
--   3) Confirm getPublicUrl(...) opens the image (bucket must be PUBLIC).
