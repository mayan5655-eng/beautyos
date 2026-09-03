# Migration status — read this before running anything here

> **This table is now a note, not the source of truth.** Run
> `npm run migrations:status` — it parses every migration for the objects it
> creates and checks them against the live schema, so the answer comes from
> the database rather than from whoever last edited a comment.
>
> Twice in one week a header here was wrong, both times claiming NOT APPLIED
> while the object was live in production. Neither was caught by reading.
> Where the script and a header disagree, the script is right.

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
| `ai-usage.sql` | ✅ **APPLIED** (verified 2026-09-01) — and its own `revoke all … from anon` landed: `ai_usage` is absent from the anon grant list as of 2026-09-02 | `lib/ai/usage.ts`, `lib/ai/callCaps.ts`, `lib/skinScanQuota.ts` |
| `get-public-tenant-by-slug.sql` | ✅ **APPLIED** (verified 2026-09-01) | `app/[slug]/page.jsx` — every cosmetician's public landing page |
| `encrypt-green-api-token.sql` | ✅ **APPLIED** | `lib/greenApi/credentials.ts` |
| `drop-green-api-token-plaintext.sql` | ✅ **APPLIED** — `settings.green_api_token` no longer exists; only `green_api_token_encrypted` | as above |
| `tenant-resolution-fix.sql` | ✅ **APPLIED** — found already live 2026-09-02: `pg_get_functiondef` shows `order by tm.created_at asc, tm.id asc`. Nobody recorded running it. | every RLS policy, indirectly |
| `tenant-resolution-rollback.sql` | 🔒 **ROLLBACK ARTEFACT — never run in a normal pass. DO NOT DELETE.** | holds the only capture of the live `get_user_tenant_id()` as of 2026-07-30 |
| `encrypt-green-api-token-rollback.sql` | 🔒 **ROLLBACK ARTEFACT — never run in a normal pass** | — |
| `appointment-cancel-audit.sql` | ❓ **UNKNOWN** | `app/beautyos.jsx` `softCancelAppointment` — already retries without the columns, so a cancel works either way |
| `support-messages.sql` | ❓ **UNKNOWN** | `app/api/support/route.ts` — already detects the missing table and says so |
| `auto-reminders-log-index.sql` | ❓ **UNKNOWN** | performance only; nothing breaks without it |
| `platform-admin-view.sql` | ❓ **UNKNOWN** | creates `platform_tenant_metrics`; **no code currently calls it** |
| `revoke-anon-grants.sql` | ✅ **APPLIED** (verified 2026-09-02) — `anon` now holds exactly two privileges in all of `public`, both SELECT: `service_prices` and `tenants`. That is the file’s own VERIFY (b) result. | hardening; step 3 of the sequence in `get-public-tenant-by-slug.sql` |

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

-- platform-admin-view.sql  → expect one row
select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'platform_tenant_metrics';

-- auto-reminders-log-index.sql  → expect the index named in the file
select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'auto_reminders_log';

-- support-messages.sql  → expect one non-null
select to_regclass('public.support_messages');
```

**Do not read `support_messages` off the anon grant list.** It is tempting,
because that query returns only `service_prices` and `tenants` and the table is
not among them. But `support-messages.sql` contains **no REVOKE of its own** —
only a comment warning that Supabase's default grants would apply to it. So its
absence from the anon list has two explanations that look identical: the table
does not exist, or it exists and predates `revoke-anon-grants.sql` (whose loop
is driven off `pg_class` and therefore strips every relation in `public`,
including ones no migration names). `ai-usage.sql` is different — it revokes
explicitly, so its absence does confirm its revoke. Only `to_regclass` settles
support_messages.

Either way the security posture is fine: had the table been created *after* the
revoke, the default grants would have re-granted anon and it would appear in
that list. It doesn't. What is unresolved is whether the table is there at all,
which is what `app/api/support/route.ts` cares about.

---

## Why `tenant-resolution-fix.sql` was parked, and why it no longer is

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

**Un-parked, then found already applied, both on 2026-09-02.** Membership was
re-checked first: the owner holds exactly one `tenant_members` row (`448e9e45`,
joined 2026-05-06), so the "latent, not live" premise still held. Reading the
live definition before running it showed the `order by` already there.

So this file described itself as parked while the change it describes was live
in production — the second stale status header found this week, after
`add_appointment_no_overlap.sql`. Both were caught by asking the database rather
than reading the file. **Read the live object before trusting a STATUS line**;
one query settles what a header can only claim.

The trigger was not a second membership. It was a day spent investigating why
the dashboard appeared to disagree with the database, which ended in a
mislabelled tenant id — `b09637c8` annotated "(yours)" in `STAGE_SUMMARY.md` and
copied into two scripts, two migrations and a doc comment. Different mechanism,
same consequence: something answered "which business is this?" with the wrong
tenant, and every tool in the loop held the service-role key and could not tell
tenants apart, so nothing contradicted it. One line of `order by` removes the
version of that question this function can still answer unstably. Waiting for
the trigger to arrive is a worse plan than removing the trap.

`tenant-resolution-rollback.sql` embeds the real production definition of
`get_user_tenant_id()` captured on 2026-07-30. That snapshot exists nowhere else
— do not delete that file.

---

## The anon revoke decays — re-run it after adding a table

`revoke-anon-grants.sql` is applied, but its **section 3 is still commented
out**, by the original decision recorded in the file. That section is the
`alter default privileges` block, and without it Supabase keeps granting anon
every privilege on each *newly created* table in `public`. So the 29 tables that
existed are fixed; the 30th will arrive with the hole open.

The migration is idempotent and driven off `pg_class`, so the fix is simply to
run the whole file again after any `create table` in `public`, then re-run
VERIFY (b) and expect the same two rows. Anything else in that output is a table
that came back granted.

---

## The standing rule

Schema changes here are applied by hand, and a migration can sit finished for
weeks. So: **code that depends on a new database object must degrade rather than
break.** Two paths already do it correctly and are the pattern to copy —
`softCancelAppointment` in `app/beautyos.jsx` retries without the audit columns,
and the settings insert in `app/onboarding/page.tsx` retries with the seed
stripped. An insert or select naming one column that does not exist fails the
whole statement, and on a signup path that means nobody can create an account.
