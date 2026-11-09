# Go live with Grow: checklist

Kalmea is an exempt dealer (osek patur). Both Grow accounts bill without VAT: subscriptions get a **receipt (kabala)**, no VAT line, the price is final.
Switching to a licensed dealer later is one line: `KALMEA_TAX_STATUS` in `lib/kalmeaBusiness.ts`.

**Honest status (2026-11-02).** The cosmetician payment platform (account 2) passed Grow's sandbox review rounds with the real server callback:
save only, charge and save, a token charge with one identifier, and a wallet payment approved with the wallet page code (IDs below). It now
waits for Grow's approval and the production values. Kalmea's own subscription billing (account 1) has provider code (`lib/billing/growBilling.ts`),
read only from the `GROW_BILLING_*` variables; with any of them missing it answers "not configured", so `BILLING_MODE=live` charges nobody by
accident. It has not run against Grow yet, and Grow must still confirm that a Grow Light account may use the token APIs (docs/BILLING_SETUP.md).

The database side was checked on 2026-11-02 with read-only queries: every Grow, saved-card, cancellation, legal-receipt and reminder table,
column and index this checklist needs exists. Nothing in step 1 below is left for these features.

## What you receive from Grow, and where each value goes

### Account 1: Kalmea's own billing (Kalmea charges cosmeticians)

| You receive | Vercel env var |
|---|---|
| Kalmea's own Grow business id | `GROW_BILLING_USER_ID` |
| API key of that account | `GROW_BILLING_API_KEY` |
| Its credit-card TOKEN page code | `GROW_BILLING_PAGE_CODE` |
| (you set) production or sandbox | `GROW_BILLING_ENV` = `production` (anything else = sandbox) |
| Only if Grow gives another address | `GROW_BILLING_API_BASE` (optional; defaults to Grow's documented bases) |

Ask Grow: saved-token charge on a schedule for your own subscription; the **receipt** (kabala, not tax invoice) issued by Grow for each charge, its number and link in the response;
webhook field list; whether they sign webhooks.

### Account 2: the cosmetician payment platform (cosmeticians charge their clients)

| You receive | Vercel env var |
|---|---|
| Platform API key | `GROW_API_KEY` |
| Platform card payment-page code (live) | `GROW_PAGE_CODE` |
| Only if Grow gives a different production address | `GROW_API_BASE` (optional; default `https://secure.meshulam.co.il/api/light/server/1.0` for the card page, the wallet and saved cards) |
| Saved-card (token) API key, production | `GROW_TOKEN_API_KEY` |
| Credit-card token page code, production | `GROW_TOKEN_PAGE_CODE` |
| Wallet page code (card, Bit, Apple Pay, Google Pay on one page) | `GROW_WALLET_PAGE_CODE` |
| Optional per-method page codes, if Grow issues them | `GROW_PAGE_CODE_BIT`, `GROW_PAGE_CODE_APPLE_PAY`, `GROW_PAGE_CODE_GOOGLE_PAY` |
| (you set) | `GROW_ENV` = `production` |
| (you set) | `GROW_MODE` = `live` |
| Only if Grow sends from an address missing from `lib/grow/growIps.ts` (a 403 in the logs) | `GROW_WEBHOOK_IPS` (optional, comma-separated, ADDED to the list) |

Already set and not from Grow: `CRON_SECRET` (the crons), `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` (saved-card tokens are stored encrypted with it).

Sandbox only (already in Vercel and `.env.local`, test values from Grow): `GROW_TOKEN_USER_ID_TEST`, `GROW_TOKEN_API_KEY_TEST`, `GROW_TOKEN_PAGE_CODE_TEST`. The token flows are described, and were checked against the sandbox, in `docs/GROW_SETUP.md` ("Saved cards"). Run `supabase/migrations/add_grow_tokens.sql` before turning the saved-card policy on.

## Live onboarding values (Grow sent them 2026-11): set these in Vercel, in this order

Vercel > the Kalmea project > Settings > Environment Variables > **Production**. Names only here; the values are in Grow's email
and go nowhere else (never in code, chat or the repository).

1. `GROW_API_KEY`: the platform API key.
2. `GROW_WALLET_PAGE_CODE`: the wallet page code (card, Bit, Apple Pay, Google Pay on one page).
3. `GROW_PAGE_CODE`: the **card (redirect) payment-page code**. This is NOT the wallet page code: booking deposits and other
   redirect payments need a page that answers with a URL, and the wallet page answers with an SDK authCode, so a wallet code here
   makes those payments fail. Ask Grow for the live card page code if it was not sent. The platform's card status
   (`lib/grow/config.ts`) counts as configured only when this is set.
4. `GROW_TOKEN_API_KEY`: the saved-card (token) API key.
5. `GROW_TOKEN_PAGE_CODE`: the credit-card token page code.
6. `GROW_ENV` = `production` (Grow's secure base `https://secure.meshulam.co.il`, and the wallet SDK in `PRODUCTION`).
7. `GROW_MODE` = `live`.
8. `GROW_REGISTER_ENV` = `live`.
9. `GROW_REGISTER_URL_LIVE`: the live GetLink address Grow gave (must start with `https://`).
10. `GROW_REGISTER_API_KEY_LIVE`: the live registration key.
11. `GROW_REGISTER_MARKETER`: Kalmea's live marketer code. Without it, live registration stays off (it never falls back to the test marketer).
12. `GROW_UI_ENABLED` = `true`, last, after the live test below passes.

Then **redeploy** (Deployments > the latest > Redeploy). Env changes reach the app only after a redeploy.

Not needed live: `GROW_REGISTER_PRICE_QUOTE` (test environment only). The plan codes are not secret and live in `lib/grow/plans.ts`:
the cosmetician picks one when she opens her Grow account (monthly `HHtyr57` by default), and it is sent to Grow as `price_quote`
with `is_direct_debit` 0. Terms: https://grow.business/fees/

Webhook to register with Grow (all updates, including merchant onboarding): `https://kalmea.app/api/grow/webhook`.

A cosmetician who already has a Grow account asks Grow's customer service (support@grow.business, WhatsApp 052-7773144), from
the email or phone on that account, to connect it to Kalmea. **Check:** such an update reaches the webhook without our tracking
code, so it shows as "לא שויך לעסק" in Admin > Grow onboarding and is not attached automatically. Until an attach action exists,
connect her with the "מזהה עסק" paste on her Grow card.

## Webhook URLs to give Grow

| For | URL |
|---|---|
| Account 2, all updates (payment, invoice, merchant onboarding) | `https://kalmea.app/api/grow/webhook` |
| Account 2, per payment (Kalmea sends them in each payment request, nothing to register) | `https://kalmea.app/api/grow/notify?t=...` and `https://kalmea.app/api/grow/invoice?t=...` |
| Account 1, billing | none yet (not wired). The card-saving return route is added with the provider code; this line is filled then. |

Grow signs nothing: the route accepts only Grow's published addresses, then matches the process id and amount to a payment Kalmea created.

## Flags, in this order (nothing is switched on by this change)

1. Run the migrations that are still pending (`docs/GROW_SETUP.md`, `docs/BILLING_SETUP.md`); their verify queries are at the bottom of each.
2. Set the Account 2 env vars above, redeploy.
3. `GROW_UI_ENABLED=true` (shows the Grow card in Settings, the cashier button, the cancellation policy). Redeploy.
4. Run the 5-minute live test below.
5. Only after Account 1 is wired, tested in its sandbox and you have checked the receipt wording with your accountant: `BILLING_MODE=live`, then `BILLING_UI_ENABLED=true`. Redeploy. The daily charge run (`/api/billing/charge-due`, 05:00 UTC) starts working on its own.
6. Deposits and the 30-minute hold need Vercel Pro for the 5-minute cron (`/api/grow/release-holds`).

## The 5-minute live test (real 1 shekel, then refund)

Use **your own** business and your own card. No client is involved.

1. Settings > connections > Grow: connect with your Grow business id. (1 min)
2. Cashier: create a payment of **₪1** for a test client that is you (your own phone). Press the card-charge button; open the link and pay with your card. (2 min)
3. Check: the payment shows as paid, a receipt appears on the client card with Grow's document link, and the revenue report counts ₪1. (1 min)
4. Refund it: in the Grow dashboard (or the refund button once Grow confirms the refund call), refund the ₪1; check that Kalmea voids the receipt. (1 min)
5. If anything is off, set `GROW_UI_ENABLED` back to `false` and redeploy; no data is deleted either way.
6. Account 1, once wired: add your card on the billing screen with a ₪1 test price (`plan_price = 1` for your own tenant in the admin list), confirm the receipt number and link, then refund and cancel.

## Grow's go-live checklist (answered 2026-10-21)

- Sandbox proof: `node --env-file=.env.local scripts/smoke/grow-go-live.mjs <outDir>` gives a regular payment with `approveTransaction` (Grow answers status 1),
  a saved card (save only: an authorization, which Grow does not approve, error 722), a charge-and-save token with `approveTransaction`, and a token charge;
  it records the client's side as video and refunds every charge. IDs sent to Grow: payment 559826, token save 559827, charge-and-save 559831, token charge 559828.
- Grow's review (2026-10-22): (1) `getPaymentProcessInfo` only in extreme cases: the app never called it (the token always came from the callback),
  but the sandbox proof scripts did, standing in for a callback that could not reach a laptop. Those scripts now refuse to run unless
  `ALLOW_PROCESS_INFO=1`. (2) A token charge sent `transactionUniqueIdentifier` AND `transactionGroupIdentifier`; it now sends the unique one only
  (the group id stays in our ledger). New proof, real callback, no `getPaymentProcessInfo`:
  `SMOKE_BASE=https://<preview> node --env-file=.env.local scripts/smoke/grow-token-callback.mjs <outDir>` (a public deployment with
  `GROW_MODE=live` and the sandbox token triple; it records the required card-save tick, refused-then-ticked, as video).
- Grow's review (2026-10-27): the wallet payment's `approveTransaction` was sent with the token page code. Grow posts a payment's callback to its
  notifyUrl AND the account webhook; the webhook approved with the card credentials (the token page in the sandbox). Both routes now take the
  credentials from the payment (`approveCredsFor`, `lib/grow/wallet.ts`), and a refused approve is logged with Grow's error id.
- Sandbox proof with the fixes (2026-11-02, branch preview, Grow's real callback, no `getPaymentProcessInfo`, payer 0542845655, the sandbox business of
  `GROW_TOKEN_USER_ID_TEST`): save only processId 811312; charge and save 564815; token charge 564814 (transactionUniqueIdentifier 2278003370 only);
  wallet payment 564816 (asmachta 133119841), refunded 564817. Preview logs had no `approveTransaction refused`. Videos sent to Grow.
- Apple Pay domain file: `/.well-known/apple-developer-merchantid-domain-association` was downloaded as a file; it is now served as
  `text/plain`, inline (`next.config.ts`), checked live on 2026-11-02.
- Merchant onboarding, second test (2026-11-02): fictitious business number 255300212, mobile 0542845655, filled up to ID verification.
  The "Maple System" approval Grow sent is their sandbox test business (its business code is the `GROW_TOKEN_USER_ID_TEST` value), not a real merchant.
- Site check (https://grow.business/Site_check, a PDF): every payment page now has a required terms tick linking `/terms#payments` (`lib/paymentTerms.ts`;
  `/api/grow/wallet` refuses without it); the terms cover delivery of the service, the 18+ purchase limit, privacy, liability and cancellation under the
  Consumer Protection Law; Kalmea's footer shows the contact number. The address is the city only (`KALMEA_ADDRESS`): Grow may ask for a street address.
- Merchant onboarding test link: `node --env-file=.env.local scripts/smoke/grow-register-test-link.mjs <fictitious 9-digit number> <her mobile>` (test key only).
- IP list re-checked against Grow's page on 2026-10-21: unchanged (30 rows, 29 distinct).
