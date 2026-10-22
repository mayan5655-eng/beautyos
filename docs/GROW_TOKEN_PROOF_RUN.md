# Grow token proof: run it on the branch preview (local session)

Run locally, in Maayan's `beautyos` clone (it needs `.env.local` and the Vercel CLI). Answer her in Hebrew. Load the `kalmea` skill first.

Grow asked for:
1. A video of the required card-save / future-charges tick before the card is saved.
2. New sandbox calls with no `getPaymentProcessInfo`: the token comes from Grow's server callback.
3. A new token charge sending only `transactionUniqueIdentifier`.

This branch has the fixes. The new proof script is `scripts/smoke/grow-token-callback.mjs`. It has never been run, so expect to fix selectors or timing on the first run. Never set `ALLOW_PROCESS_INFO`.

1. `npm install`.
2. Vercel CLI (`npx vercel`, logged in, linked). On **Preview** for this branch only, never Production, set:
   - `GROW_UI_ENABLED=true`
   - `GROW_MODE=live`
   - `GROW_TOKEN_USER_ID_TEST`, `GROW_TOKEN_API_KEY_TEST`, `GROW_TOKEN_PAGE_CODE_TEST`: from `.env.local`, never printed.
   - `GROW_ENV` must NOT be set for Preview.
   Ask before changing an existing value.
3. Redeploy the branch preview and get its URL. Deployment Protection must let Grow reach `/api/grow/*`; ask Maayan to turn it off temporarily and to restore it at the end.
4. `.env.local` must have `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the preview's database. Then run:
   `SMOKE_BASE=<preview url> node --env-file=.env.local scripts/smoke/grow-token-callback.mjs ~/Desktop/grow-proof`
   Fix and commit as needed. Never touch tenant 448e9e45-2251-4572-b665-886c5bc7a4c8; no real cards, money or client messages.
5. Confirm all of:
   - the token was stored by the webhook;
   - the token-charge ledger row is `succeeded`;
   - charge-and-save is paid and has a token;
   - the video shows booking refused without the tick, then ticked, then Grow's card page.
6. Clean up: `node --env-file=.env.local scripts/smoke/admin-tools.mjs purge-smoke`, then restore Deployment Protection.
7. Give Maayan:
   - the ids from `ids.json`;
   - the video path;
   - the sandbox userId (Grow asked which business we tested with);
   - a short Hebrew reply to Grow.

Do not merge to main unless she asks.
