# Pre-beta stages A–E — what was actually done

**Run date:** 2026-08-19 → 2026-08-21
**Branch:** `main`, starting from `ea48f38`

> **Read this first.** Stages **D and E were not started.** Work stopped after
> Stage C. Three of the five stages are complete; the table below records the
> other two as not done rather than describing work that does not exist.

| | Stage | Status |
| --- | --- | --- |
| A | Error monitoring | ✅ done, pushed |
| B | Rate limiting | ✅ done, pushed |
| C | DB overlap guarantee | ⚠️ written and pushed, **constraint not applied to the database** |
| D | Hide the three stubs | ❌ **not started** |
| E | Small text | ❌ **not started** |

---

## Stage A — error monitoring

| | |
| --- | --- |
| **Changed** | **New:** `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `lib/sentryScrub.ts`, `app/ErrorScreen.tsx`, `app/error.tsx`, `app/global-error.tsx`. **Modified:** `instrumentation.ts` (rewritten — Sentry init + `onRequestError`), `instrumentation.node.ts` (dev-only gate), `next.config.ts` (`withSentryConfig`, source maps), `.gitignore` (un-ignored both instrumentation files), `app/beautyos.jsx` (`Sentry.setTag("tenant_id", …)` after settings load), `package.json` / `package-lock.json` (`@sentry/nextjs@10.70.0`). `REVIEW.md` committed here too, corrections log included. |
| **Decided myself** | **Gated the noise guard to non-production, in two independent places.** `instrumentation.node.ts` silences an `unhandledRejection` *without letting any listener see it*. Deployed as-is it would have hidden exactly the crash class Sentry was added to catch. Un-ignoring the file without this would have been a net loss. • **`sendDefaultPii: false` + request bodies dropped unconditionally.** On this product a body is a client's name, her mobile number, a skin report, or a tenant's Green API token. Console breadcrumbs dropped too — `handleSaveSettings` logs whole settings payloads. • **No Session Replay.** It would film a clinic CRM: names, phones, treatment history, prices, for people who never agreed to it. • **Six-character error code, not 32.** A cosmetician mid-treatment reads six characters over WhatsApp; a copy button carries the full id, path and timestamp. • **No code shown when neither a Sentry id nor a `digest` exists** — an invented code that matches no report is worse than none. • **Everything no-ops without a DSN, and the build skips source-map upload without an auth token.** A missing observability credential must never fail a build or a boot. • **Dropped `disableLogger`** — deprecated, and a no-op under Turbopack, which Next 16 uses; it only produced a warning on every build. • **`tracesSampleRate` 0.1**, env-overridable — errors are the point, traces shouldn't eat the free quota. |
| **Commit** | `132976f` — **pushed** |
| **Skipped / open** | **Sentry account work is yours** — project, DSN, org auth token. Nothing reports until those exist (see Q2). • **No `tunnelRoute`.** It would dodge ad blockers but adds a route that has to be public, and `proxy.ts` middleware sits in front. Left as a follow-up. • **Not verified against a live Sentry project** — no DSN to verify with. The wiring builds and no-ops correctly; the first real event is unproven. • `.env.local` not touched. |

## Stage B — rate limiting

| | |
| --- | --- |
| **Changed** | **New:** `lib/rateLimit.ts`. **Modified:** `app/api/book-appointment/route.js`, `app/api/skin-scan/send/route.js`, `app/api/skin-scan/lead/route.js` — each gets a per-IP check before the body is read and a per-tenant check once `tenantId` is known. |
| **Decided myself** | **Limits set against what a real client does, not round numbers.** Booking 8/IP + 12/tenant per 10 min (a solo cosmetician has 8–10 bookable slots in a day, so 12 public bookings in ten minutes is not a busy afternoon; 8 leaves room to lose the slot race repeatedly and still succeed). `skin-scan/send` 3 + 10 — tightest, because every accepted call spends two WhatsApp messages of her paid quota. `skin-scan/lead` 10 + 40 — loosest, because it fires automatically on navigation and must never be the limit a real visitor trips. • **Per-IP checked before parsing JSON**, so a flood costs nothing. • **Kept the existing `{ success:false, error }` envelope** — both public pages render `result.error` verbatim, so a bare 429 would have shown the generic "אירעה שגיאה. נסי שוב." and she'd retry forever. • **Fixed window, not a sliding log** — one integer per key; the 2× boundary burst is irrelevant at these numbers. • **Bounded the map at 20k keys with a lazy sweep** so a caller rotating IPs can't exhaust instance memory. • **No tenant bucket when `tenantId` is missing** — all three routes already 400, and a shared "no tenant" bucket would let one caller exhaust it for everyone. |
| **Commit** | `510cebc` — **pushed** |
| **Skipped / open** | **In-memory by design, per your "cheap and dependency-light".** On Vercel each instance keeps its own counters, so the real ceiling is `limit × warm instances`. That is a genuine weakening under a distributed flood; it's written into the file, not hidden. Upgrade path (a `rate_limits` table + atomic increment RPC, same keys) would replace only the counter, not the policy table. • **`/api/confirm` not touched** — you scoped this to the three `tenantId` endpoints. REVIEW.md F3 still lists it as the most serious of the four and the only *read* leak, with a fix built in `3a8683d` and unpushed. Still open. |

## Stage C — database overlap guarantee

| | |
| --- | --- |
| **Changed** | **New:** `check-appointment-overlaps.js` (read-only census), `supabase/migrations/add_appointment_no_overlap.sql`. **Modified:** `app/api/book-appointment/route.js`, `lib/booking.ts`, `app/beautyos.jsx` — all three now treat `23P01` the way they already treated `23505`. |
| **Decided myself** | **Ran the check before writing the migration, across every tenant.** A single-tenant answer can't decide a table-wide constraint. The script defaults to the `b09637c8…` filter and prints it; the census is behind an explicit `--all-tenants` flag, is SELECT-only, and prints counts and tenant ids only — never another tenant's client data. • **`CASE … 'empty'::int4range` instead of a bare range constructor.** A range constructor treats a NULL bound as *infinite*, not unknown — `int4range(null, 90)` is `(,90]`, which overlaps everything. One row with a null `start_minute` or `duration` would have blocked every insert in its tenant. • **`coalesce(confirmation_status,'') <> 'cancelled'`, not a bare `<>`** — a bare `<>` is NULL for a NULL status, silently leaving those rows outside the constraint. • **Kept `uniq_appt_slot_active`** — it still covers null/zero-duration rows, which the exclusion constraint exempts. • **Not deferrable** — nothing swaps two appointments in one transaction, and immediate checking gives the clearer error. • **Shipped the `23P01` handling with the SQL** so the constraint can be applied to the running deployment with no code change behind it; harmless before it's applied, since `23P01` never occurs. • `appointments.hour` untouched. |
| **Commit** | `3e54196` — **pushed** |
| **Skipped / open** | **The constraint is NOT applied, and the SQL has never been executed.** No DDL channel on this machine — checked all four: no Supabase CLI, no connection string or DB password in `.env.local`, no management access token, and the project exposes no SQL-execution RPC (only the tenant/branding helpers). See Q1 for how to apply it. • **No local Postgres or Docker**, so the SQL is unvalidated by a parser as well as unapplied. Its verification queries (`a`–`d`, including back-to-back-is-not-overlap and cancelled-frees-its-slot) are in the file and should be run with it. |

## Stage D — hide the three stubs

| | |
| --- | --- |
| **Changed** | **Nothing. Not started.** |
| **Decided myself** | — |
| **Commit** | none |
| **Skipped / open** | Entirely open. Groundwork from reading the code, so it isn't lost: the nav lives in `app/beautyos.jsx` at three sites — `NAV_ITEMS` (~line 3794), `MORE_NAV` (~3792, which already contains all three of `community`, `packages`, `protocols`), and the render at ~4428 / ~6665. `SPARSE_TABS` (~3776) also names `community`. A per-tenant flag can ride on the existing `settings` row: `loadAll` does `select("*")` so a new column flows through automatically, and `handleSaveSettings` builds its payload by spreading `editSettings`, so it round-trips without extra work. Default-hidden with an opt-in flag degrades safely if the column doesn't exist yet. `campaigns` and `insights` stay visible, per your instruction and REVIEW.md's own correction. |

## Stage E — small text

| | |
| --- | --- |
| **Changed** | **Nothing. Not started.** |
| **Decided myself** | — |
| **Commit** | none |
| **Skipped / open** | Entirely open. REVIEW.md D-F1 counts 249 text nodes below 11px, 33 at 8px and 102 at 9px, unaudited by me. The only sub-11px judgement actually made this run was inside Stage A's new error screen, which was written at 13px and up from the start (body 15px, code 26px, buttons 15–16px) — no existing screen was touched. |

---

## 1. Stage C — did any tenant have existing overlaps?

**No. Zero tenants, zero overlapping pairs.** Read-only census, `--all-tenants`, 22 rows scanned:

| tenant_id | rows | overlapping pairs |
| --- | --- | --- |
| `448e9e45-2251-4572-b665-886c5bc7a4c8` | 19 | **0** |
| `b09637c8-a5c8-4b80-bda8-ff603f7ada60` (yours) | 2 | **0** |
| `439120af-987b-4471-8b9d-afc89bc6c480` | 1 | **0** |
| **total** | **22** | **0** |

Also clean: 0 rows with a NULL `confirmation_status`, 0 with an unusable start, 0 with a NULL or zero duration. 1 cancelled row (correctly exempt). Nothing had to be cleaned up, and **no appointment data was read out, moved or deleted** — the script issues SELECTs only.

**Did I apply it? No — and this is the one place I could not do what you asked.** Your rule was "if zero, write and apply it yourself." Zero it was, so the green light is real, but there is no DDL path from this machine: no Supabase CLI installed, no `SUPABASE_DB_URL` / password in `.env.local`, no management access token, and no SQL-execution RPC exposed by the project. So the migration is written, reviewed and pushed, but **unrun**.

To apply it — Supabase dashboard → SQL Editor → paste `supabase/migrations/add_appointment_no_overlap.sql` and run. Then run verification queries `a`–`d` at the bottom of that file: `b` proves it bites (second insert must fail `23P01`), `c` proves back-to-back is still allowed, `d` proves a cancelled appointment still frees its slot. Re-run `node --env-file=.env.local check-appointment-overlaps.js --all-tenants` first if time has passed — it's read-only.

Alternatively, put a connection string in `.env.local` as `SUPABASE_DB_URL` and say so, and I'll apply and verify it directly.

## 2. Stage A — exactly what to add in Vercel

Five keys. Project → Settings → Environment Variables (the bulk "paste .env" box takes this block as-is — it's on your clipboard).

| Key | Environments | Sensitive? | Where it comes from |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Production, Preview, Development | No — a DSN is public by design and ships in the client bundle | Sentry → your project → Settings → Client Keys (DSN) |
| `SENTRY_ORG` | Production, Preview, Development | No | Your Sentry org slug (the one in the dashboard URL) |
| `SENTRY_PROJECT` | Production, Preview, Development | No | Your Sentry project slug |
| `SENTRY_AUTH_TOKEN` | **Production and Preview only** | **Yes — mark Sensitive** | Sentry → Settings → Auth Tokens → org auth token with `project:releases` + `project:write`. Build-time only; it uploads source maps and is never needed at runtime |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Production, Preview, Development | No | Optional. `0.1` unless you want more; errors are always sent in full regardless |

Notes:
- **Nothing reports until `NEXT_PUBLIC_SENTRY_DSN` is set.** Every init is a no-op without it, deliberately — the app builds and boots normally in the meantime.
- **Without `SENTRY_AUTH_TOKEN` the build still succeeds**, it just skips the source-map upload — so stack traces stay minified and mostly unreadable. It is the difference between a usable report and a list of one-letter names.
- **Environment is separated automatically** from `VERCEL_ENV`, so preview noise won't land in your production issues.
- Source maps are **deleted after upload**, so the codebase is never served from the public build.
- Add the same DSN to your local `.env.local` if you want to test before deploying.

## 3. Stage E — which screens did I touch?

**None. Stage E was not started, so no small text was raised and no per-screen judgement was made.** The 249 sub-11px nodes REVIEW.md counts are all still there, unaudited by me — I can't tell you which are correct-as-small and which aren't, because I never looked.

The only type decision made this run was in Stage A's new error screen (`app/ErrorScreen.tsx`), which was written legible from the start rather than raised: body 15px, heading 24px, error code 26px monospace, buttons 15–16px, the "קוד התקלה" label 13px. Nothing on it is below 13px.

---

## Standing rules — how they were kept

- **tsc and full build clean before every push** — yes, all three times. Stage C's check was interrupted mid-run and was re-run clean before the commit landed.
- **Every DB query tenant-filtered with the filter printed** — the one script that touches the database (`check-appointment-overlaps.js`) defaults to `tenant_id = b09637c8-a5c8-4b80-bda8-ff603f7ada60` and prints it. The table-wide census needed to answer Stage C's gating question is behind an explicit `--all-tenants` flag, prints that it is unfiltered and why, is SELECT-only, and reads out no client data.
- **`appointments.hour` not dropped** — untouched throughout; still written, still synced by the trigger.
- **Hard stops** — neither was hit. No appointment data was deleted or rewritten (Stage C's census found nothing to argue about, and the rate-limit tests were run against a 400 path and in-memory so nothing was written to any tenant). Nothing was done in your Vercel account; Stage A ends with instructions and a clipboard paste.
- **The one thing I could not do** was apply the Stage C constraint — not a hard stop, a missing credential. Detailed in Q1.
