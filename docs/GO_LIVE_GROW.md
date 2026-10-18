# Go live with Grow: checklist

Kalmea is an exempt dealer (osek patur). Both Grow accounts bill without VAT: subscriptions get a **receipt (kabala)**, no VAT line, the price is final.
Switching to a licensed dealer later is one line: `KALMEA_TAX_STATUS` in `lib/kalmeaBusiness.ts`.

**Honest status.** The cosmetician payment platform (account 2) is built for Grow, but its live calls are **unverified** (`TODO(grow-docs)` in `lib/grow/ops.ts`).
Kalmea's own subscription billing (account 1) has **no live provider code yet**: `lib/billing/live.ts` answers "not configured". So `BILLING_MODE=live` today
charges nobody, and the billing steps below need one coding session after Grow answers. Everything marked **(not wired)** is that.

## What you receive from Grow, and where each value goes

### Account 1: Kalmea's own billing (Kalmea charges cosmeticians) (not wired)

| You receive | Vercel env var |
|---|---|
| API key / credentials of the billing account | `BILLING_API_KEY` (name proposed; fixed when live.ts is written) |
| Page / terminal code for the hosted card page | `BILLING_PAGE_CODE` (proposed) |
| API base URL (production) | `BILLING_API_BASE` (proposed) |
| Sandbox credentials, for a test run | the same three, with the sandbox values, before switching |

Ask Grow: saved-token charge on a schedule for your own subscription; the **receipt** (kabala, not tax invoice) issued by Grow for each charge, its number and link in the response;
webhook field list; whether they sign webhooks.

### Account 2: the cosmetician payment platform (cosmeticians charge their clients)

| You receive | Vercel env var |
|---|---|
| Platform API key | `GROW_API_KEY` |
| Platform card payment-page code (live) | `GROW_PAGE_CODE` |
| Production API base URL (not in the public docs) | `GROW_API_BASE` |
| (you set) | `GROW_ENV` = `production` |
| (you set) | `GROW_MODE` = `live` |
| Only if Grow's IP list changes | `GROW_WEBHOOK_IPS` (optional) |

Already set and not from Grow: `CRON_SECRET` (the crons), `SUPABASE_SERVICE_ROLE_KEY`.

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
