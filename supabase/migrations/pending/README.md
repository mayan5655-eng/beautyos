# Pending migrations — do not run without checking first

These scripts are finished and tested but **deliberately not applied**. Each one
waits on a specific trigger. Do not run them as part of a general "apply all
migrations" pass.

## `tenant-resolution-fix.sql` / `tenant-resolution-rollback.sql`

Adds `order by created_at asc, id asc` to `public.get_user_tenant_id()`, whose
`LIMIT 1` currently has no ordering.

**Latent only.** As of 2026-07-30 no user held more than one `tenant_members`
row, so the ordered and unordered versions return the same row.

**Trigger: run this BEFORE anyone is ever added to a second tenant** — for
example before the owner adds herself to a customer's tenant to do support work.
After that point her own dashboard could non-deterministically resolve to the
customer's tenant, and every RLS policy plus `is_tenant_active()` keys on that
function.

`tenant-resolution-rollback.sql` embeds the **real production definition of
`get_user_tenant_id()` captured on 2026-07-30**. That snapshot exists nowhere
else — do not delete this file.
