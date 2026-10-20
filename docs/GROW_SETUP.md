# Grow (Meshulam) card payments: setup and what is still needed

Status: **built, mock mode works end to end, not connected to Grow.** No real charge can happen until the platform credentials
below exist, `GROW_MODE=live` is set and a cosmetician opts in. Nothing here was run against Grow's sandbox or production.

## Modes and the switch

| Variable | Meaning |
|---|---|
| `GROW_UI_ENABLED` | `true` shows every Grow screen and enables the signed-in Grow routes. **Default off** (everything answers {success:false, hidden:true} and renders nothing). The callback routes Grow itself calls are never behind it: a real payment is always recorded. |
| `GROW_MODE` | `mock` (default): no network; the payment page is `/api/grow/mock-pay` on our own origin with "paid" / "failed" buttons, and it feeds the same callback logic as the real thing, including a sample receipt. `live`: the real API. Mock is **refused on the Vercel production deployment** (`VERCEL_ENV=production`). |
| `GROW_API_KEY`, `GROW_PAGE_CODE` | Live only. The platform `apiKey` (sent as `x-api-key`) and the card payment-page code. |
| `GROW_ENV`, `GROW_API_BASE` | Live only. `production` needs `GROW_API_BASE` (given by Grow, not in the public docs). The sandbox default is `https://sandbox.meshulam.co.il/api/light/server/1.0`. |
| `GROW_WEBHOOK_IPS`, `GROW_WEBHOOK_IP_CHECK` | Optional. Override Grow's published webhook IP list; the check can only be relaxed outside production. |

`.env.example` lists all of them with placeholders.

## How it works

1. Each cosmetician clears to **her own** Grow account. Money never passes through Kalmea. Card details never touch Kalmea: the client pays on Grow's page.
2. Settings > Connections > "סליקת אשראי (Grow)": **(a)** "I have a Grow account": she pastes her Grow business id (`userId`); **(b)** "I don't
   have Grow yet": she leaves name, phone, business name and business id, stored in `grow_signup_requests` (admin panel lists them, to forward to Grow).
   Connected: on/off, a disconnect button (her payments and receipts stay), and her last payments with the Grow receipt link.
3. Cashier, after a treatment, only when connected: "חיוב בכרטיס אשראי" creates a payment page on **her** userId and shows the link, a WhatsApp button
   (a `wa.me` link she presses send on), copy, and a QR code.
4. Grow calls `https://kalmea.app/api/grow/webhook` (one URL, see `app/api/grow/webhook/route.ts`). Grow signs nothing, so the order is: the caller's
   address must be on Grow's published list (before any database access), then the payment is found by its secret or process id, and the process id,
   the amount and the business id we sent must match. The payment flips to `paid` through one conditional update (idempotent), a Kalmea receipt
   ("אשראי", `legal_provider = 'grow'`) is created once, and `approveTransaction` is sent back. Logged with a `[grow]` prefix.
5. Grow's invoice notification stores the receipt link (and number, when it carries one) on the payment and on the receipt. It shows on the client card
   (payments tab), in the cashier history, and in Settings. Kalmea files **no** second legal receipt for a Grow payment (`issueForReceipt` skips it).
6. Grow payments are ordinary receipts (method "אשראי"), so the revenue reports count them with no extra code.

## Migrations (run by hand, in this order)

1. `supabase/migrations/add_grow_payments.sql` (tables `grow_accounts`, `grow_payments`)
2. `supabase/migrations/add_grow_onboarding.sql` (if not already run)
3. `supabase/migrations/add_grow_signup_requests.sql` (table `grow_signup_requests`, server-only)
4. `supabase/migrations/add_grow_trial_gate.sql` (trial-gate write block for the three tables)

## What to get from Grow when you sign

1. Platform onboarding approval (Platforms & Multi-Merchant Systems) and the platform **`apiKey`**.
2. The card payment-page **`pageCode`** (sandbox and live differ).
3. The **production API base URL**.
4. How a platform obtains each merchant's **`userId`** (embedded registration, or per-merchant onboarding). Today she pastes it.
5. Give Grow the webhook URL: **`https://kalmea.app/api/grow/webhook`**.
6. The exact **callback field list** and the **invoice webhook payload**: the document **number** field name is a guess (`TODO(grow-docs)` in
   `lib/grow/payload.ts` `findInvoiceNumber`).
7. Confirmation of the IP list (`lib/grow/growIps.ts`) and whether any signature exists besides it.
8. Confirmation that `createPaymentProcess` accepts the platform `apiKey` as the `x-api-key` header.
9. Whether a failed card attempt sends any callback (the mock marks the payment failed on its own page; a real one may send nothing).

## Testing

`test-grow.ts` (live logic, fake repo and fetch), `test-grow-webhook.ts` (address list, onboarding), `test-grow-mock.ts` (mode and flag, the whole mock
flow connect -> charge -> callback -> payment -> report, forged and repeated callbacks, no second legal receipt, gate and migrations).
To walk it by hand on a preview: set `GROW_UI_ENABLED=true` (and leave `GROW_MODE` unset), run the four migrations, connect with any id such as `TESTUSER1`,
charge from the cashier and press "דמה תשלום מוצלח" on the page that opens.

## Cancellation policy, fees and deposits (feat/grow-payments)

Settings > connections > Grow card, visible only while she is connected: a cancellation policy in three modes (`off`, `saved_card`, `deposit`), a free-cancellation window
(default 24 hours), a late-cancel fee and a no-show fee (a fixed amount or a percent of the service price), a deposit with what happens on a timely cancel (refund or
client credit), and an editable Hebrew policy text with a default template. It is stored in its own table, so the dashboard's whole-settings save cannot overwrite it.

- **Public booking page**: with a policy on, the page shows the text with a required tick (the server refuses without it). The consent is frozen per appointment (text, mode,
  amounts, time). `saved_card` opens Grow's hosted page to save a card (a token, no charge); `deposit` opens the hosted page to pay the deposit. Card numbers are never
  stored. With the policy off, or without Grow connected, the booking is exactly as before; it never uses the plan guard, so blocked businesses keep taking bookings.
- **Detection**: when she cancels or marks a no-show in the app, or the client cancels through her link inside the window, a PENDING fee item is created from what the client
  agreed to. It becomes a one-tap question on the home screen, the appointment and the client card ("לגבות ₪100 מדנה על ביטול מאוחר?" with yes / waive). **Nothing is
  charged without her tap.** Yes charges the saved token on HER Grow account and stores the payment, the receipt and Grow's document like any Grow payment.
- **Deposit**: attended, the cashier deducts it once (anything above the visit becomes client credit); late cancel or no-show, she keeps it; timely cancel, it is refunded through
  Grow (its receipt is voided) or kept as client credit, per her setting. When SHE cancels, the deposit returns whatever the window says.
- **Migration** (run after the earlier Grow ones): `supabase/migrations/add_grow_cancellation.sql`.
- **Tests**: `test-grow-cancel.ts` (all of the above), `scripts/smoke/grow-cancel.mjs` (browser: part A verified, part B needs the migration).

### Questions for Grow about card tokens under a platform (the live calls are unverified, marked `TODO(grow-docs)` in `lib/grow/ops.ts`)

1. Can a platform key save a card WITHOUT charging, for a merchant's `userId`? Which call and flag (J5 authorisation, a zero-sum page, a "save card" switch)?
2. How is the token returned: a webhook (which payload and fields), or a redirect parameter? Is it tied to the merchant or to the platform?
3. Can the platform charge a saved token on the merchant's behalf later (`createTransactionWithToken`?): fields, idempotency, and is the answer synchronous?
4. Does the charge produce the merchant's receipt automatically, and does the response carry the document number and link?
5. Refunds: endpoint, partial refunds, who may call it (platform or merchant), and what the merchant's receipt looks like afterwards.
6. How long does a token live, what happens when the card expires, and what is the 3-D Secure rule for off-session charges in Israel?
7. Is the client's consent to future charges something Grow needs (text, timestamp) in the token request?

## Saved cards (Grow tokens): built and tested against Grow's sandbox

Source: developers.grow.business, "Work with Token". The calls below were run against the **sandbox** with the test credentials Grow issued
(`scripts/smoke/grow-token-sandbox.mjs`); production values still come from Grow.

**Environment variables** (never in the repository; `.env.local` and Vercel only)

| Variable | Meaning |
|---|---|
| `GROW_TOKEN_USER_ID_TEST`, `GROW_TOKEN_API_KEY_TEST`, `GROW_TOKEN_PAGE_CODE_TEST` | The sandbox test triple. In the sandbox every cosmetician is charged on this one test business. |
| `GROW_TOKEN_API_KEY`, `GROW_TOKEN_PAGE_CODE` + `GROW_API_BASE` + `GROW_ENV=production` | Production: the platform key and the credit-card token page code Grow issues, with each cosmetician's own `userId`. |
| `TOKEN_ENCRYPTION_KEY` | Already exists (Facebook tokens). Saved-card tokens are stored AES-256-GCM encrypted with it. |

**Authentication.** `apiKey` is a **body field** of every call (a header is refused with error 701). It was a header before; fixed in `createCharge` and `approveTransaction` too.

**The three modes** (`lib/grow/tokenFlow.ts`, `lib/grow/ops.ts`)

1. *Save only*: `createPaymentProcess` with `chargeType=3`, `sum=1`, `saveCardToken=1`. The client types the card on Grow's hosted credit-card page; nothing is charged (the sandbox shows a held ₪1 authorisation, status 11).
2. *Charge and save*: the same call with `chargeType=1`, the real `sum`, `saveCardToken=1`.
3. *Charge a saved token*: `createTransactionWithToken` with `cardToken`, `sum`, `paymentType=2`, `transactionUniqueIdentifier` (required) and `transactionGroupIdentifier` (lookup only).

**Rules that are enforced in code**

- Credit card only: the token page code is Grow's credit-card page, no Bit / Apple Pay / Google Pay.
- Consent: a separate required tick on the booking page, `CARD_CONSENT_TEXT_HE` in `lib/grow/tokenFlow.ts`. The server refuses a booking without `acceptedCardSave`. The exact words, the time, the client and the booking are stored in `grow_card_consents`.
- `transactionUniqueIdentifier`: a whole number between 100,000,000 and 4,294,967,000 (Grow refuses anything above 32 bits, error 1013), drawn on the server, **saved in `grow_token_charges` before the call**, unique across all rows, never reused, not even after a refusal.
- Error **1010** (identifier already seen) is not retried. The transaction is looked up with `getTokenTransactionsByExternalIdentifiers`, sending only the unique identifier (both together is an error), and the real result is recorded. If the lookup cannot settle it, the row is `unknown` and the fee item stays "charging" so nobody can charge twice by tapping again.
- A token is bound to `tenant_id` + `client_id`. Before every charge the server checks, from the database, that the token belongs to the same business and the same client as the appointment. A token or client id from the browser is never accepted (`/api/grow/fees/decide` takes only the fee id and the decision).
- The first transaction of a token sends a server-to-server callback to `https://kalmea.app/api/grow/webhook` and needs `approveTransaction`; it is handled in `onCardTokenNotification` (`lib/grow/cancelFees.ts`). Later token charges send no callback and need no approve: their result is the API response.
- New tables (`grow_card_consents`, `grow_token_charges`) are in the trial gate with tenant-scoped RLS; the token and Grow's process token are never granted to the browser.

**Migration (run by hand, after `add_grow_cancellation.sql`):** `supabase/migrations/add_grow_tokens.sql`.

**What the sandbox run proved** (`node --env-file=.env.local scripts/smoke/grow-token-sandbox.mjs`): save only returns a token, charge-and-save returns a paid transaction and a token,
a token charge succeeds once, the same identifier again answers 1010, the lookup by that one identifier finds the paid transaction, and an identifier never used is "not found".

**Not wired:** the deposit payment page (a regular payment page, `createCharge`) does not save a card yet; charge-and-save exists in `ops.createTokenSession` and is tested, but deposit mode still takes the deposit and nothing else.

## The rest of clearing (feat/grow-cashier, mock mode)

Built in mock mode, ready to switch to the real API. Source for every call: developers.grow.business (grow-il.readme.io redirects there), read 2026-10-20.

**1. Cashier charge, any method Grow allows.** Grow chooses the payment method by the **page code**, not by a field. Each method is one optional variable:

| Variable | Method |
|---|---|
| `GROW_PAGE_CODE` | credit card, or Grow's generic "card or Bit" page (required) |
| `GROW_PAGE_CODE_BIT` | Bit (up to ₪5,000, one payment: refused before asking) |
| `GROW_PAGE_CODE_APPLE_PAY` | Apple Pay |
| `GROW_PAGE_CODE_GOOGLE_PAY` | Google Pay (Chrome on Android only) |

Only methods with a page code appear in the cashier (chips above the charge button). `approveTransaction` is sent with the page code of the method the client actually paid with (`transactionTypeId` 1 card, 6 Bit, 13 Apple Pay, 14 Google Pay). **Bit, Apple Pay and Google Pay have no sandbox at Grow: they are real money.** The receipt is Grow's (`invoiceNotifyUrl`), shown in the cashier history, the client card and the Grow card, as before. The production API base now defaults to Grow's documented `https://secure.meshulam.co.il/api/light/server/1.0` (`GROW_API_BASE` still overrides it).

**2. Payment requests** (cashier screen, "בקשת תשלום בקישור"): a Grow link for a **deposit** or the **full amount** for one of her clients (name and phone read from her client list on the server). She sends it from her own WhatsApp (wa.me with a ready message); the list turns "שולמה" when Grow's callback arrives. A paid deposit request is a receipt (income now) plus the same amount as client credit, which the cashier deducts at the visit, so nothing is counted twice. Route: `app/api/grow/payment-request`; rules: `lib/grow/paymentRequest.ts`. Grow's payment link is valid for 10 minutes after it is created (Grow's docs); a late client gets a new link.

**3. Opening a Grow account from Kalmea** (Grow card > "אין לי עדיין Grow" > "פתיחת חשבון ב-Grow"): she types her ID / business number and her mobile; the server calls Grow's **GetLink** (`lib/grow/registration.ts`: POST JSON, `x-api-key` header, a User-Agent, body `marketer`, `business_number`, `phone`, `price_quote`, `is_direct_debit` 1 test / 0 live, `website`, `is_send_sms` 1). Grow texts her the form and answers `{ url, encrypted_lead }`; we store `encrypted_lead` as the pending row's `tracking_code`, because Grow's registration webhook sends the same value as `data.tracking_code`. Matched only by it: **approved** stores her `user_id` in `grow_accounts`, her `api_key` encrypted in `grow_account_secrets` (add_grow_register.sql) and switches clearing **on for her business only**; **rejected** shows Grow's reason; `bank_account` is never stored. Grow's error ids are shown in plain Hebrew (17 open lead, 145 not approved, 149 already at Grow -> "יש לי חשבון Grow", 13 phone, 120 ID, 115/117/121/142/143 our settings, 165 general). A wrong mobile: the card's "הנייד לא נכון?" calls GetLink again with the same business number. The form opens from the SMS or a new tab; inside the card (iframe, Grow posts `{action:"success"|"close", source:"growRegister"}`) only when `GROW_REGISTER_FRAME_ORIGIN` names that one Grow origin. Mock mode still works through `/api/grow/mock-register`.

**Migration (run by hand, after the earlier Grow ones):** `supabase/migrations/add_grow_cashier.sql` (registration status columns; the two onboarding tables into the trial gate; still server-only). Desktop copy: `kalmea-sql-grow-cashier.txt`.

**To switch from mock to real:** `GROW_MODE=live`, `GROW_API_KEY`, `GROW_PAGE_CODE` (the regular-payment page code Grow sends), optionally the three method page codes, `GROW_ENV=production`, and `GROW_UI_ENABLED=true`. For registration: `GROW_REGISTER_API_KEY_TEST` (test, default URL https://devregisterapi.meshulam.co.il/GetLink), or `GROW_REGISTER_ENV=live` + `GROW_REGISTER_API_KEY_LIVE` + `GROW_REGISTER_URL_LIVE`; optional `GROW_REGISTER_MARKETER`, `GROW_REGISTER_PRICE_QUOTE`, `GROW_REGISTER_FRAME_ORIGIN`.

**Tests:** `test-grow-cashier.ts` (methods, page codes, approve page code, Bit limit, requests, credit, registration mock/live/status, route guards, migration), `test-grow-webhook.ts` (approved / rejected / waiting registration updates).
## Wallet checkout (card, Bit, Apple Pay, Google Pay on one page)

Grow's regular-payment page code is a **wallet** code: `createPaymentProcess` answers with an `authCode` (valid 4 minutes) instead of a URL, and the form is drawn by Grow's script (`cdn.meshulam.co.il/sdk/gs.min.js`) inside a page of ours. So the payment link is a Kalmea page, **`/pay/<token>`** (`app/pay/[token]`), built the same way for the cashier and for a payment request:

1. Cashier / payment request: `createCharge({ wallet: true })` writes the `grow_payments` row and returns `<app>/pay/<notify_token>`. Grow is not asked yet. For a payment request she sends that link from her own WhatsApp (wa.me).
2. The client opens the link; only then does `/api/grow/wallet` call `createPaymentProcess` (wallet page code, her userId, `notifyUrl` and `invoiceNotifyUrl` with the per-payment token, apiKey as a body field) and the wallet opens. The link lives 24 hours and stops working once paid.
3. Grow's callback (`/api/grow/notify?t=`) and invoice callback (`/api/grow/invoice?t=`, an array) are recorded as for any payment, then `approveTransaction` is sent with the wallet page code. The page thanks the client only after OUR record says paid.
4. Refund: Settings > Grow card > "החזר" on a paid payment (`/api/grow/refund`, her tenant only, never a deposit) uses the transaction id and token stored from the callback.

Environment: sandbox `GROW_WALLET_PAGE_CODE_TEST` (with the same `GROW_TOKEN_USER_ID_TEST` / `GROW_TOKEN_API_KEY_TEST`); production `GROW_WALLET_PAGE_CODE` with `GROW_API_KEY`. SQL: `supabase/migrations/add_grow_wallet.sql` (a `refunded` status and a server-only `transaction_token` column). The Content-Security-Policy of `/pay/*` alone names Grow's hosts (`lib/securityHeaders.ts`); every other page is unchanged.

**Bit, Apple Pay and Google Pay have no sandbox at Grow**: a test with them is real money. Only cards were tested (sandbox card 4580458045804580). To repeat the sandbox test (card payment, a payment-request link, a refund; no database is touched): `node --env-file=.env.local scripts/smoke/grow-wallet.mjs <outDir>`.

**Registration (GetLink):** built to Grow's lead-registration spec (2026-10-20). The test form is password protected (Grow gives the user and password). The live GetLink address and live key come from Grow separately.
