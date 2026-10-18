# Grow (Meshulam) card payments: setup and what is still needed

Status: **built, mock mode works end to end, not connected to Grow.** No real charge can happen until the platform credentials
below exist, `GROW_MODE=live` is set and a cosmetician opts in. Nothing here was run against Grow's sandbox or production.

## Modes and the switch

| Variable | Meaning |
|---|---|
| `GROW_UI_ENABLED` | `true` shows every Grow screen and enables the signed-in Grow routes. **Default off** (everything answers 404 / renders nothing). The callback routes Grow itself calls are never behind it: a real payment is always recorded. |
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
