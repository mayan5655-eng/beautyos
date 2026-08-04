-- branding-storage-insert.sql
-- Minimal tenant-scoped INSERT policy for the PUBLIC "community-images" bucket.
-- Lets an authenticated user upload ONLY into their own tenant's first folder:
--   "<tenant_id>/..."  (e.g. "<tenant_id>/branding/logo_<ts>.png")
-- so one clinic can never write into another clinic's path.
-- Run this AFTER creating the community-images bucket (Public ON).

create policy "community-images tenant insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = get_user_tenant_id()::text
  );
