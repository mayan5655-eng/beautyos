# Moving the database closer to Israel (plan, not done)

Written 2026-11-18. Nothing here has been run. Every step that touches production or costs money needs the owner's go-ahead first.

## Why

The Supabase project is in AWS ap-southeast-1 (Singapore). The Vercel functions were moved to `sin1` on 2026-11-16 to sit next to it
(the business page went from 2.0s to about 0.57s), but every request from Israel still goes to Singapore and back.
Israel to Frankfurt is roughly a third of that distance.

## Where to

- **Frankfurt (eu-central-1).** Supabase does not offer Israel (il-central-1); Frankfurt is the closest region it does offer.
  Source: https://supabase.com/docs/guides/platform/regions
- An existing project cannot change region. It takes a NEW project in Frankfurt plus a migration.
  Source: https://supabase.com/docs/guides/platform/project-transfer

## Size today (counted read-only on 2026-11-18)

7 businesses, 66 clients, 112 appointments, 94 payments, 5 results; 2 buckets (`client-images` private, `community-images` public).
This is small, so the copy itself takes minutes.

## Cost

A second project runs for the overlap (a few days to two weeks, until the old one is shut down): its compute is billed on top of
today's. It is a small amount, but it is money, so it needs her approval.

## Steps

1. **Freeze window.** Pick a quiet hour (night, not before a reminder run). Planned downtime: about 30 minutes.
2. **New project** in Frankfurt, same plan. Turn on the same extensions and Database Webhooks as the old one.
3. **Copy the database** with the Supabase CLI (roles, schema, data), then restore with `session_replication_role = replica`.
   Source: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
   - **To check before:** that the dump includes `auth.users` with the hashed passwords, so owners keep their logins.
   - Vault / pgsodium: not used by this repo's migrations (checked); if anything was added by hand in the dashboard, copy the root key first.
4. **Copy storage**: both buckets, every file, with the script from the same docs page (service keys of both projects).
5. **Rewrite stored URLs.** Public photo and logo URLs are saved in the database with the OLD project address
   (`treatment_results.before_url/after_url`, branding logos and covers in `settings.branding`, gift voucher art, designs).
   One SQL `replace(old_host, new_host)` over those columns, written and checked against a dump first.
6. **Auth settings** by hand in the new project: site URL, redirect URLs, email templates, SMTP, any OAuth provider.
7. **Vercel env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and any other key
   that names the project. Good moment to move to the new publishable / secret keys: the legacy anon / service_role keys are
   deprecated by the end of 2026 (https://supabase.com/docs/guides/api/api-keys).
8. **Functions region**: `vercel.json` `regions` from `sin1` to `fra1` (the rule "functions next to the database" still holds).
9. **Deploy, then check**: login, the booking page, a booking on the demo, a reminder dry run, photos load, the cron heartbeat.
10. **Keep the old project paused, not deleted**, for two weeks: the way back is to put the old env vars back.

## What does NOT change

kalmea.app, the booking links clients already have, Grow and Facebook callbacks (they point at kalmea.app), Morning.

## Risks

- A login or a booking made during the freeze is lost: hence the quiet hour and a short "maintenance" window.
- A stored URL that step 5 misses shows a broken image. Search every text/jsonb column for the old host before going live.
