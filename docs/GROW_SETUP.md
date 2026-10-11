# Grow (Meshulam) card payments: setup and what is still needed

Status: **built, not connected.** No real charge can happen until the platform credentials below exist and a
cosmetician opts in. Nothing in this branch was run against Grow's sandbox or production.

## How it works

1. Each cosmetician clears to **her own** Grow account. Money never passes through Kalmea.
2. She opts in per business: Settings > Connections > "סליקת אשראי (Grow)": she pastes the business id (`userId`)
   Grow gave her and switches it on.
3. In the cashier, after a treatment, "חיוב בכרטיס אשראי" asks Grow (`createPaymentProcess`) for a payment page on
   **her** userId, with the platform `apiKey` and `pageCode`. It returns a link; the client pays on Grow's page.
4. Grow posts to `/api/grow/notify?t=<secret>` (server to server). We accept it only when the secret matches a
   payment row **and** the process id and the amount match what we created. The payment becomes `paid`, a Kalmea
   receipt ("אשראי") is created once, and `approveTransaction` is sent back to Grow.
5. Grow's invoice webhook posts to `/api/grow/invoice?t=<secret>`; the legal-document link is stored on the payment
   and on the receipt (`legal_provider = 'grow'`), so it is visible inside Kalmea.
6. Payments and receipts count in the normal revenue reports (payment method "אשראי").

## Environment variables (Vercel, Production and Preview)

| Variable | Meaning |
|---|---|
| `GROW_API_KEY` | The platform `apiKey` Grow issues to Kalmea. Sent as `x-api-key`. |
| `GROW_PAGE_CODE` | The platform's card payment-page code (test and live differ). |
| `GROW_ENV` | `production` for live; anything else is the sandbox. |
| `GROW_API_BASE` | **Required when `GROW_ENV=production`.** The live API base URL, given by Grow (not in the public docs). The sandbox default is `https://sandbox.meshulam.co.il/api/light/server/1.0`. |

While the first two are missing, the settings card says "not connected yet" and `/api/grow/charge` answers 409.

## What I need from Grow

1. Platform onboarding approval (Platforms & Multi-Merchant Systems), and the platform `apiKey`.
2. The `pageCode` for card payments (sandbox and live).
3. The **production API base URL**.
4. How a platform obtains each merchant's `userId`: the embedded registration form, or per-merchant onboarding. Today the
   cosmetician pastes her own `userId`.
5. The exact **callback field list** and the **invoice webhook payload** (the public docs show examples only, and no
   signature). The code reads the documented sample (`data.processId`, `transactionId`, `sum`, `statusCode` = 2 for paid,
   `customFields.cField1`) and takes the invoice link as the first https URL in the invoice payload.
6. Whether the callback includes a signature or IP list we can verify in addition to our per-payment secret.
7. Confirmation that `createPaymentProcess` accepts the platform `apiKey` as the `x-api-key` header (the docs show it for
   `CreatePaymentLink`; `createPaymentProcess` lists no auth header).

## Migration

`supabase/migrations/add_grow_payments.sql` (tables `grow_accounts`, `grow_payments`). Run it **before** this branch is
deployed: the nightly invariants check lists both tables.

## Testing

`test-grow.ts` covers configuration, request shape, the callback rules (forged, duplicate, mismatched amount, died
between "paid" and "receipt"), and the invoice link, with a fake repo and a fake fetch.
