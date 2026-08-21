# Pre-beta stages A–E — what was done

**Branch:** `main`, from `ea48f38` → `3f871c0`. Six commits, all pushed.
`tsc` and a full `next build` were clean before every push.

| | Stage | Commit | Pushed |
| --- | --- | --- | --- |
| A | Sentry error monitoring | `132976f` | ✅ |
| B | Rate limiting | `510cebc` | ✅ |
| C | DB overlap guarantee | `3e54196` | ✅ — **but the constraint is not applied to the database** |
| D | Hide the three stubs | `7071739` | ✅ |
| E | Raise the small text | `07b7775` | ✅ |
| — | Minutes-migration bugs found during E | `3f871c0` | ✅ |

**One thing you asked for that did not happen:** the Stage C constraint is written and pushed but **not applied**, because there is no way to run DDL against the database from this machine. Everything else is done. Details in Q1.

---

## Stage A — error monitoring

| | |
| --- | --- |
| **Changed** | **New:** `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `lib/sentryScrub.ts`, `app/ErrorScreen.tsx`, `app/error.tsx`, `app/global-error.tsx`. **Modified:** `instrumentation.ts` (rewritten — Sentry init + `onRequestError`), `instrumentation.node.ts` (dev-only gate), `next.config.ts` (`withSentryConfig`, source maps), `.gitignore` (un-ignored both instrumentation files), `app/beautyos.jsx` (`Sentry.setTag("tenant_id", …)`), `package.json` / lockfile (`@sentry/nextjs@10.70.0`). `REVIEW.md` committed here with its corrections log. |
| **Decided myself** | **Gated the noise guard to non-production, in two independent places.** `instrumentation.node.ts` silences an `unhandledRejection` *without letting any listener see it*. Deployed as-was it would have hidden exactly the crash class Sentry was added to catch — un-ignoring the file without this would have been a net loss. • **`sendDefaultPii: false` and request bodies dropped unconditionally.** On this product a body is a client's name, her mobile number, a skin report, or a tenant's Green API token. Console breadcrumbs dropped too — `handleSaveSettings` logs whole settings payloads. • **No Session Replay** — it would film a clinic CRM for people who never agreed to it. • **Six-character error code, not 32** — she reads six characters over WhatsApp; a copy button carries the full id, path and timestamp. • **No code shown when neither a Sentry id nor a `digest` exists** — an invented code that matches no report is worse than none. • **Everything no-ops without a DSN; the build skips source-map upload without an auth token.** A missing observability credential must never fail a build or a boot. • **Dropped `disableLogger`** — deprecated and a no-op under Turbopack, which Next 16 uses; it only added a warning to every build. |
| **Skipped / open** | Sentry account work is yours — see Q2; nothing reports until the DSN exists. • **No `tunnelRoute`** (would dodge ad blockers, but adds a public route in front of `proxy.ts` middleware). • **Never verified against a live Sentry project** — no DSN to verify with. The wiring builds and no-ops correctly; the first real event is unproven. |

## Stage B — rate limiting

| | |
| --- | --- |
| **Changed** | **New:** `lib/rateLimit.ts`. **Modified:** `app/api/book-appointment/route.js`, `app/api/skin-scan/send/route.js`, `app/api/skin-scan/lead/route.js` — per-IP check before the body is read, per-tenant check once `tenantId` is known. |
| **Decided myself** | **Limits set against what a real client does.** Booking 8/IP + 12/tenant per 10 min — a solo cosmetician has 8–10 bookable slots in a day, so 12 public bookings in ten minutes is not a busy afternoon, and 8 leaves room to lose the slot race repeatedly and still succeed. `skin-scan/send` 3 + 10, tightest, because every accepted call spends two WhatsApp messages of her paid quota. `skin-scan/lead` 10 + 40, loosest, because it fires automatically on navigation and must never be the limit a real visitor trips. • **Per-IP checked before parsing JSON**, so a flood costs nothing. • **Kept the `{ success:false, error }` envelope** — both public pages render `result.error` verbatim, so a bare 429 would have shown the generic "אירעה שגיאה. נסי שוב." and she'd retry forever. • **Fixed window, not a sliding log.** • **Map bounded at 20k keys with a lazy sweep** so a caller rotating IPs can't exhaust instance memory. • **No bucket when `tenantId` is missing** — all three routes already 400, and a shared "no tenant" bucket would let one caller exhaust it for everyone. |
| **Verified** | Against a running server: the per-IP limit fires at the right count, returns the Hebrew body and `Retry-After: 458`, and a second IP is unaffected. The per-tenant cap, tenant isolation and policy isolation were exercised directly rather than over HTTP, so **no test data was written to any tenant**. |
| **Skipped / open** | **In-memory by design**, per your "cheap and dependency-light". On Vercel each instance keeps its own counters, so the real ceiling is `limit × warm instances` — a genuine weakening under a distributed flood, written into the file rather than hidden. Upgrade path: a `rate_limits` table + atomic increment RPC, same keys, replacing only the counter. • **`/api/confirm` not touched** — you scoped this to the three `tenantId` endpoints. REVIEW.md still lists it as the most serious of the four and the only *read* leak, with a fix built in `3a8683d` and unpushed. Still open. |

## Stage C — database overlap guarantee

| | |
| --- | --- |
| **Changed** | **New:** `check-appointment-overlaps.js` (read-only census), `supabase/migrations/add_appointment_no_overlap.sql`. **Modified:** `app/api/book-appointment/route.js`, `lib/booking.ts`, `app/beautyos.jsx` — all now treat `23P01` as they already treated `23505`. |
| **Decided myself** | **Ran the check first, across every tenant** — a single-tenant answer can't decide a table-wide constraint. The script defaults to the `b09637c8…` filter and prints it; the census is behind an explicit `--all-tenants` flag, is SELECT-only, and prints counts and tenant ids only, never client data. • **`CASE … 'empty'::int4range` instead of a bare range constructor.** A range constructor treats a NULL bound as *infinite*, not unknown — `int4range(null, 90)` is `(,90]`, which overlaps everything, so one row with a null `start_minute` or `duration` would have blocked every insert in its tenant. • **`coalesce(confirmation_status,'') <> 'cancelled'`** — a bare `<>` is NULL for a NULL status, silently leaving those rows outside the constraint. • **Kept `uniq_appt_slot_active`** — it still covers null/zero-duration rows, which the exclusion constraint exempts. • **Not deferrable** — nothing swaps two appointments in one transaction. • **Shipped the `23P01` handling with the SQL**, harmless before it's applied, so the constraint can go onto the running deployment with no code change behind it. • `appointments.hour` untouched. |
| **Skipped / open** | **NOT APPLIED, and the SQL has never been executed.** See Q1. • No local Postgres or Docker either, so it is unvalidated by a parser as well as unapplied. Its verification queries `a`–`d` are in the file and should be run with it. |

## Stage D — hide the three stubs

| | |
| --- | --- |
| **Changed** | **New:** `lib/featureFlags.ts`. **Modified:** `app/beautyos.jsx` — `NAV_ITEMS` and `MORE_NAV` filtered, plus a backstop effect that leaves a hidden tab for `dashboard`. |
| **Decided myself** | **Hidden, not deleted** — only the two nav lists are filtered. Every stub's state, loader, render block and table is untouched, so a flag brings the tab back with its data intact. • **`campaigns` and `insights` cannot be hidden even by an explicit flag** — `NEVER_HIDDEN` refuses. Campaign management is what separates this from Fresha; making that structural rather than a comment is why the earlier wrong call in the review can't quietly come back. • **Flag lives in `settings.automations.feature_flags`**, an existing jsonb column already used as a per-tenant config bag (`lead_templates` is there). **That needs no migration — which is the point, since there's no way to apply DDL right now, so this works on deploy instead of waiting on a schema change.** A dedicated `settings.feature_flags` column is also read and overrides it key by key, so the flags can move later with no second code change. • **Stub tabs hidden unless a flag says `true`; anything *not* in `STUB_TABS` is always visible** — the opposite default from `PLAN_FEATURES`, deliberately: that map gates paid access where the safe default is to withhold, this one gates polish where the safe default is to show, and a new feature must never vanish because someone forgot to register it. |
| **Verified** | Flag logic exercised directly: default-hidden, per-tenant opt-in works, the column overrides the automations bag, malformed flags fall back to hidden, and an explicit attempt to hide `campaigns`/`insights` is refused. |
| **Skipped / open** | **No settings UI for the flags** — not asked for, out of scope. The tenant-filtered SQL to flip one is in `lib/featureFlags.ts`. |

## Stage E — small text

| | |
| --- | --- |
| **Changed** | `app/beautyos.jsx` — 62 text nodes raised. See Q3 for the screen-by-screen breakdown. |
| **Decided myself** | **The bar was 11px, and the exemptions are by reason, not by taste.** Body copy, list metadata rows, warnings, empty states and every button or link went to 12–13px; section subtitles to 12.5. **Badges normalised to a single 10.5px tier** rather than the 8/8.5/9/10 they were scattered across — they are one or two high-contrast words in a filled chip and must not compete with the row they annotate. **The calendar week grid was left alone** because its size is set by the grid, not by preference: an appointment block is as tall as its duration, so a 30-minute block cannot carry 13px without overflowing. |
| **Skipped / open** | **Nothing was visually verified** — this was done by reading the code and reasoning about layout, not by looking at it, which is exactly the failure mode REVIEW.md D-F3 calls out. The calendar week grid in particular is worth a glance on a real phone. • Sub-11px text on the screens *not* in daily use (campaigns 39, whatsapp 17, tax 12, insights 9, and ~145 in modals) was left untouched. |

## Extra — minutes-migration bugs found during Stage E

| | |
| --- | --- |
| **Changed** | `app/beautyos.jsx` — `handleVoiceBook`, `waConfirmLink` and its call site, the stale voice notice, and two display sites folded into the Stage E commit. |
| **What was wrong** | Sweeping for hand-built time strings turned up three sites that still assumed whole hours, in a migration believed complete. **(1) Voice booking stored the wrong time** — it parsed `Number(time.split(":")[0])` and wrote that as `hour`, so "בשתיים וחצי" booked 14:00. The speech API was already returning `HH:MM`; only this write path threw the minutes away. **(2) The confirmation message sent the wrong time to clients** — `waConfirmLink` interpolated `appt.hour` raw, so the WhatsApp reminder read "בשעה 14": the bare integer, wrong for every half-hour appointment and badly formatted even for whole ones. Affects the single send and the bulk "שליחה מרוכזת". **(3)** Two display leftovers, fixed in the Stage E commit: the dashboard rendered a stray `:00` under every `fmtApptTime`, and the Today sidebar built its time from `a.hour` so 14:30 read as 14:00. |
| **Checked and NOT a bug** | The claim page — `formatHour()` already prefers `slotTime`, formatted by the API from `slot_start_minute`. |
| **Worth knowing** | **Of these, the confirmation message is the one that reached real clients.** |

---

## 1. Stage C — did any tenant have existing overlaps?

**No. Zero tenants, zero overlapping pairs.** Read-only census, `--all-tenants`, 22 rows:

| tenant_id | rows | overlapping pairs |
| --- | --- | --- |
| `448e9e45-2251-4572-b665-886c5bc7a4c8` | 19 | **0** |
| `b09637c8-a5c8-4b80-bda8-ff603f7ada60` (yours) | 2 | **0** |
| `439120af-987b-4471-8b9d-afc89bc6c480` | 1 | **0** |
| **total** | **22** | **0** |

Also clean: 0 rows with a NULL `confirmation_status`, 0 with an unusable start, 0 with a NULL or zero duration, 1 cancelled row (correctly exempt). Nothing had to be cleaned up, and **no appointment data was read out, moved or deleted** — SELECTs only.

**Did I apply it? No.** Your rule was "if zero, write and apply it yourself." Zero it was, so the green light is real — but there is no DDL path from this machine. I checked all four: no Supabase CLI installed, no connection string or password in `.env.local`, no management access token, and the project exposes no SQL-execution RPC (only the tenant/branding helpers). So the migration is written, reviewed and pushed, but **unrun**.

To apply: Supabase dashboard → SQL Editor → paste `supabase/migrations/add_appointment_no_overlap.sql`, run it, then run verification queries `a`–`d` at the bottom of that file. `b` proves it bites (second insert must fail `23P01`), `c` proves back-to-back is still allowed, `d` proves a cancelled appointment still frees its slot. Re-run `node --env-file=.env.local check-appointment-overlaps.js --all-tenants` first if time has passed — it's read-only.

Or put a connection string in `.env.local` as `SUPABASE_DB_URL` and say so, and I'll apply and verify it directly.

## 2. Stage A — exactly what to add in Vercel

Five keys. Project → Settings → Environment Variables (the bulk "paste .env" box takes the block that's on your clipboard).

| Key | Environments | Sensitive? | Where it comes from |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Production, Preview, Development | No — a DSN is public by design and ships in the client bundle | Sentry → your project → Settings → Client Keys (DSN) |
| `SENTRY_ORG` | Production, Preview, Development | No | Your Sentry org slug (the one in the dashboard URL) |
| `SENTRY_PROJECT` | Production, Preview, Development | No | Your Sentry project slug |
| `SENTRY_AUTH_TOKEN` | **Production and Preview only** | **Yes — mark Sensitive** | Sentry → Settings → Auth Tokens → org token with `project:releases` + `project:write`. Build-time only; never needed at runtime |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Production, Preview, Development | No | Optional, `0.1`. Errors are always sent in full regardless |

- **Nothing reports until `NEXT_PUBLIC_SENTRY_DSN` is set.** Every init no-ops without it, deliberately — the app builds and boots normally meanwhile.
- **Without `SENTRY_AUTH_TOKEN` the build still succeeds**, it just skips the source-map upload, so stack traces stay minified. That is the difference between a usable report and a list of one-letter names.
- **Environment is separated automatically** from `VERCEL_ENV`, so preview noise won't land in production issues.
- Source maps are **deleted after upload**, so the codebase is never served from the public build.
- Add the same DSN to local `.env.local` if you want to test before deploying.

## 3. Stage E — which screens did I touch?

**62 nodes across six surfaces.** Scope was the five screens she works from all day plus the shell wrapped around every one of them.

| Surface | Raised | What went up |
| --- | --- | --- |
| **Dashboard** (היום) | 14 | Empty-day copy and empty state → 13. Service line under the client name → 12.5. Paused-automations warning, loading and error text, the "why this suggestion" line, the no-phone warning, the show/hide-message toggle → 12. All three action buttons (approve / primary / dismiss) → 13. |
| **Calendar** (יומן) | 4 | "לוח שבועי" subtitle → 12.5, desktop legend → 12, weekday name → 11.5, client name inside an appointment block → 11.5. |
| **Clients** (לקוחות) | 6 | Subtitle → 12.5. The phone / appointment-count / last-service row → 12.5. WhatsApp action → 12. Three badges → 10.5. |
| **Leads** (לידים) | 8 | Subtitle → 12.5, helper text → 12, status filter buttons → 12.5, the phone / source / interest row → 12.5, WhatsApp action and convert button → 12. Two badges → 10.5. |
| **Cashier** (קופה) | 10 | Subtitle, month-revenue label, payment-method label, service/price row → 12.5. Transaction count, payment-request link, open-cashier button, month filters, receipt meta row → 12. Paid badge → 10.5. |
| **App shell** (on every screen) | 20 | Today/Reminders sidebar: empty state → 12.5, time·service line → 12, service → 12, collect-payment / bulk-send / send-reminder buttons → 11–11.5, the confirmed/cancelled counter strip → 11.5, lead-reminder name → 12, cold-client row → 12. Header birthday name and global search result line → 12. Voice-receipt sheet: three form labels and two status notices → 12. |

### What I deliberately left small

| Left at | What | Why |
| --- | --- | --- |
| **10.5px** | Every badge and pill — status chips, "רדומה · 90י", lifetime total, "ממתין", "אישרה"/"ביטלה", "✓ שולם", the reminder timestamp | One or two high-contrast words in a filled chip. They annotate a row and must not compete with it. I *did* normalise them: they were spread across 8 / 8.5 / 9 / 10px and are now one tier. |
| **9px** | Notification count badges in the header and nav | One or two numerals in a filled chip. Numerals stay legible where Hebrew text does not, and raising them moves the header geometry. |
| **7.5–9px** | The **entire calendar week grid** — hour ruler, day-cell month/year, "סגור", "ביטול", the service line inside an appointment block, the ✓/✕ status glyphs, and the 15–17px icon buttons | This is the "dense table metadata" case, and the size is set by the layout rather than by taste: a block is as tall as its duration, so a 30-minute appointment cannot carry 13px text without overflowing, and the glyphs sit inside fixed 15–17px buttons. The two things in the grid actually worth reading — the weekday name and the client's name — went to 11.5, which is as far as the grid allows. |

**Caveat worth stating:** none of this was verified by looking at it. It was done by reading the code and reasoning about the layout — the exact failure mode REVIEW.md D-F3 flags. The calendar grid deserves a glance on a real phone before beta.

---

## Standing rules

- **tsc + full build clean before every push** — yes, all six times.
- **Every DB query tenant-filtered with the filter printed** — the one script that touches the database defaults to `tenant_id = b09637c8-a5c8-4b80-bda8-ff603f7ada60` and prints it. The table-wide census needed to answer Q1 is behind an explicit `--all-tenants` flag, announces that it is unfiltered and why, is SELECT-only, and reads out no client data.
- **`appointments.hour` not dropped** — untouched; still written by every path, still synced by the trigger.
- **Hard stops** — neither hit. No appointment data was deleted or rewritten. Nothing was done in your Vercel account; Stage A ends at instructions and a clipboard paste.
- **The one thing not done** was applying the Stage C constraint — not a hard stop, a missing credential. See Q1.
