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

## Wallet payment: a new transaction (Grow review, 2026-10-27)

Grow: the identifiers in the wallet test were fine, but `approveTransaction` failed because it was sent with the TOKEN page code. Cause: Grow
sends a payment's callback to its own notifyUrl AND to the account webhook (`/api/grow/webhook`). The webhook approved with the card/token
credentials, and in the sandbox those are the token page. Fix (this branch): both routes now pick the credentials from the payment itself
(`approveCredsFor` in `lib/grow/wallet.ts`), and a refused approve is logged as `[grow] approveTransaction refused for transaction ...`.

1. Pull this branch. Make sure `GROW_WALLET_PAGE_CODE_TEST` (from `.env.local`) is set on Preview for this branch, add it the same way as the
   other variables if it is missing, then redeploy.
2. On a NEW smoke business against the preview (same login/onboarding and `grow_accounts` row as `grow-token-callback.mjs`), create a ₪10
   payment link as the owner: `POST /api/grow/charge` from the logged-in page (see `app/api/grow/charge/route.ts` for the body). Open the
   `/pay/<token>` link it returns at 430px, tick the terms, choose credit card in the Grow wallet, and pay with the sandbox card
   (4580458045804580, any future date, id 000000018). Record it as video. You can add this as a step in `grow-token-callback.mjs`.
3. Wait until the `grow_payments` row is `paid` (written by Grow's callback). Then check the preview's runtime logs (`npx vercel logs <url>`):
   there must be NO `approveTransaction refused` line for that transaction.
4. Refund it from the app (the cashier history refund), then run purge-smoke.
5. Give Maayan the new wallet transaction id (`grow_payments.transaction_id`) for Grow.
