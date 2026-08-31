# Migration status — read this before running anything here

**The folder name lies, and that is why this file exists.** "pending" was true
when the directory was created. Several of these have since been applied, one is
deliberately parked, and two are rollback artefacts that must never be run as
part of a normal pass. Nobody should have to open Supabase to find out which is
which.

Not renamed on purpose: six places in the code reference `migrations/pending/`
by path (`app/beautyos.jsx`, `app/onboarding/page.tsx`, `app/api/support/route.ts`,
`lib/tenantTemplate.ts`, and two in `scripts/backfill-green-api-token.mjs`), and
the files are in four different states — no single directory name can be honest
about all of them. The table below can.

| File | Status | Depended on by |
|---|---|---|
| `ai-usage.sql` | ✅ **APPLIED** (verified 2026-09-01) | `lib/ai/usage.ts`, `lib/ai/callCaps.ts`, `lib/skinScanQuota.ts` |
| `get-public-tenant-by-slug.sql` | ✅ **APPLIED** (verified 2026-09-01) | `app/[slug]/page.jsx` — every cosmetician's public landing page |
| `encrypt-green-api-token.sql` | ✅ **APPLIED** | `lib/greenApi/credentials.ts` |
| `drop-green-api-token-plaintext.sql` | ✅ **APPLIED** — `settings.green_api_token` no longer exists; only `green_api_token_encrypted` | as above |
| `tenant-resolution-fix.sql` | ⏸️ **PARKED — see below** | every RLS policy, indirectly |
| `tenant-resolution-rollback.sql` | 🔒 **ROLLBACK ARTEFACT — never run in a normal pass. DO NOT DELETE.** | holds the only capture of the live `get_user_tenant_id()` as of 2026-07-30 |
| `encrypt-green-api-token-rollback.sql` | 🔒 **ROLLBACK ARTEFACT — never run in a normal pass** | — |
| `appointment-cancel-audit.sql` | ❓ **UNKNOWN** | `app/beautyos.jsx` `softCancelAppointment` — already retries without the columns, so a cancel works either way |
| `support-messages.sql` | ❓ **UNKNOWN** | `app/api/support/route.ts` — already detects the missing table and says so |
| `auto-reminders-log-index.sql` | ❓ **UNKNOWN** | performance only; nothing breaks without it |
| `platform-admin-view.sql` | ❓ **UNKNOWN** | creates `platform_tenant_metrics`; **no code currently calls it** |
| `revoke-anon-grants.sql` | ❓ **UNKNOWN** | hardening; step 3 of the sequence in `get-public-tenant-by-slug.sql` |

Related, and **not** in this folder: `add_appointment_no_overlap.sql` (in
`migrations/`) is ✅ **APPLIED** (verified 2026-09-01). It is the exclusion
constraint that makes the public booking race safe — `app/api/book-appointment/route.js`
catches its `23P01` and returns a 409.

---

## Resolving the four unknowns

Each is one query in the Supabase SQL editor. Update the row above with the
answer and the date rather than leaving it for the next person to re-derive.

```sql
-- appointment-cancel-audit.sql  → expect two rows
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'appointments'
   and column_name in ('cancelled_at', 'cancelled_by');

-- support-messages.sql  → expect one non-null
select to_regclass('public.support_messages');

-- platform-admin-view.sql  → expect one row
select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'platform_tenant_metrics';

-- auto-reminders-log-index.sql  → expect the index named in the file
select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'auto_reminders_log';

-- revoke-anon-grants.sql  → expect ZERO rows once applied
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public';
```

---

## Why `tenant-resolution-fix.sql` is parked

It adds `order by created_at asc, id asc` to `public.get_user_tenant_id()`, whose
`LIMIT 1` currently has no ordering.

**Latent, not live.** As of 2026-07-30 no user held more than one
`tenant_members` row, so the ordered and unordered versions return the same row.

**Trigger: run it BEFORE anyone is ever added to a second tenant** — for example
before the owner adds herself to a customer's tenant to do support work. After
that point her own dashboard could non-deterministically resolve to the
customer's tenant, and every RLS policy plus `is_tenant_active()` keys on that
function.

Worth weighing: because there are zero duplicates today, running it **now** is
provably a no-op for every existing user and cannot change what any current
session resolves to. Running it **later**, once a second membership exists, is
the version that changes behaviour for somebody. Earliest is safest.

`tenant-resolution-rollback.sql` embeds the real production definition of
`get_user_tenant_id()` captured on 2026-07-30. That snapshot exists nowhere else
— do not delete that file.

---

## The standing rule

Schema changes here are applied by hand, and a migration can sit finished for
weeks. So: **code that depends on a new database object must degrade rather than
break.** Two paths already do it correctly and are the pattern to copy —
`softCancelAppointment` in `app/beautyos.jsx` retries without the audit columns,
and the settings insert in `app/onboarding/page.tsx` retries with the seed
stripped. An insert or select naming one column that does not exist fails the
whole statement, and on a signup path that means nobody can create an account.
