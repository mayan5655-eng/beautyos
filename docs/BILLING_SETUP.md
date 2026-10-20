# Kalmea billing (cosmeticians paying Kalmea): setup and what is still needed

Status: **built in mock mode, no real provider.** Nothing can charge a real card until a provider is wired into `lib/billing/live.ts`,
`BILLING_MODE=live` is set and the screens are switched on.

## Switches (environment variables)

| Variable | Meaning |
|---|---|
| `BILLING_UI_ENABLED` | `true` shows the billing screen and enables the signed-in billing routes and the cron. **Default off**: everything answers {success:false, hidden:true} or does nothing. |
| `BILLING_MODE` | `mock` (default): no network; a test card page on our own origin (`/api/billing/mock-card`) with "valid card", "card refused when charged" and "card page failed" buttons, and sample invoices. `live`: placeholder, "not configured" until a provider is wired. Mock is **refused on the Vercel production deployment**. |
| `CRON_SECRET` | Already used by the other crons. The daily run `/api/billing/charge-due` (05:00 UTC) needs it. |

## How it builds on the trial (nothing replaced)

The gate stays `tenants.plan_status` (`trial | active | expired | paused`, `lib/planState.ts`, `trial-state.sql`). Billing only moves a business between these:

- successful charge: `active` (unblocks at once); a `paused` business is never touched
- grace period over, or a cancelled period ended: `expired` (the existing read-only gate; nothing is ever deleted)

Life cycle, per business (`billing_subscriptions.status`):

1. **trialing**: card saved during the trial. Nothing is charged. The cron run inside the last 24 hours before the trial ends charges her, so she is never blocked between the end of the trial and the next run.
2. **active**: paid; `next_charge_at` is when the next month is due (calendar month, clamped).
3. **past_due**: a charge failed. Retries on days 1, 3 and 5 after the first failure; she keeps working; the in-app banner says so. After **7 days** the gate closes. A successful card unblocks immediately.
4. **canceled**: no more charges; she keeps what she paid for (`ends_at`), then the gate closes. Adding a card again resumes it.

The price is stored per subscription (`price`), from `tenants.plan_price` when set (349 launch) otherwise 499. The owner can change it per business in the admin list.
Kalmea is an **exempt dealer (osek patur)**: each charge gets a **receipt (kabala) with no VAT line** and the price is final, nothing is added. The document type is decided in one place, `KALMEA_TAX_STATUS` in `lib/kalmeaBusiness.ts` (`exempt` today; `licensed` gives a tax invoice-receipt with VAT contained in the same price). The invoicing adapter receives `docType` and `vatAmount`.

Billing is reachable while blocked: no billing route uses the plan guard, and the billing tables are **not** in the trial gate (a test pins both).

## Owner

Admin panel > "מנויים וחיובים": every subscription (status, price, next charge, card, failed attempts), "mark paid manually" (records a manual payment, extends one month, unblocks) and "set price".
The WhatsApp renewal button in the trial banner is unchanged and stays as the fallback.

## Migration (run by hand)

`supabase/migrations/add_kalmea_billing.sql` (tables `billing_subscriptions`, `billing_payments`). Until it runs, the screen says "not enabled yet" and the cron does nothing.

## Going live: what the provider must give (Grow, or a card provider plus an invoicing service)

Implement the two interfaces in `lib/billing/adapter.ts` inside `lib/billing/live.ts`:

1. **Hosted card page** (`createCardSession`): an address to send her to, where she types the card at the provider. On success the provider must call back (webhook) or redirect to a route that ends in `saveCard()` (`lib/billing/service.ts`) with: a **token reference**, the **last four digits** and the **brand**.
2. **Charge a token** (`charge`): charge the saved token for an amount in ILS, honour an **idempotency key**, answer success with a provider payment id, or a refusal (declined, not retryable vs retryable).
3. **Document per charge** (`issueInvoice`): a **receipt (kabala, no VAT)** for each successful charge while Kalmea is exempt (`docType` says which), returning its **number** and **link**; or the provider issues it itself and reports both.
4. Keys as environment variables (never in the database), the **webhook URL** to register, the IP list or signature method of the webhook, and sandbox credentials for a test run.
5. Business questions for the accountant: which entity bills (sole proprietor or company), VAT registration, whether prices include VAT, allocation numbers for business invoices.

Grow specifically: ask whether the platform account can charge a **saved token on a schedule** for Kalmea's own subscription (separate from the per-cosmetician payment pages in the Grow integration), and whether invoices are issued by Grow for Kalmea's own sales.

## Testing

`test-billing.ts` walks the whole life cycle with an in-memory database and a fake clock. `scripts/smoke/billing.mjs` is the browser run on a smoke tenant: part A (no migration) is
verified; **part B (the full charge / retry / block / unblock / cancel / admin flow) needs the migration and has not been run in a browser yet.**

## Grow (feat/kalmea-billing, mock until Grow confirms)

Kalmea charges cosmeticians through Kalmea's **own, separate** Grow account (Grow Light, Maayan's osek patur: receipts, no VAT line). Built in
`lib/billing/growBilling.ts` on the same token calls already checked against Grow's sandbox for the client flow (`lib/grow/ops.ts`).
**Keep `BILLING_MODE=mock` until Grow confirms that a Grow Light account may use the token APIs.**

| Variable (billing account ONLY) | Meaning |
|---|---|
| `GROW_BILLING_USER_ID` | Kalmea's own Grow business id |
| `GROW_BILLING_API_KEY` | the API key of that account (a body field, like every Grow call) |
| `GROW_BILLING_PAGE_CODE` | the credit-card TOKEN page code of that account |
| `GROW_BILLING_ENV` | `production`, otherwise sandbox |
| `GROW_BILLING_API_BASE` | optional; defaults to `https://sandbox.meshulam.co.il/...` or `https://secure.meshulam.co.il/api/light/server/1.0` |

None of the platform variables (`GROW_API_KEY`, `GROW_PAGE_CODE`, `GROW_TOKEN_*`) is read by billing, and the platform code never reads `GROW_BILLING_*` (a test pins both).

**Flow.** Settings > "המנוי שלי בקלמיה": a required tick (`lib/billing/consent.ts`, with her price) -> the server stores the exact words, version and time
(`billing_card_consents`) -> Grow's hosted card page, save only (no charge) -> Grow posts the token to `/api/billing/grow-notify?s=<signed session>`
(Grow's addresses only, the session names one business, `cField2` must match) -> `saveCard()` and `approveTransaction` with the BILLING keys.
At the end of the free month the daily run (`/api/billing/charge-due`) charges the token monthly.

**Ledger and duplicates (the client token rules).** Each charge draws a numeric `transactionUniqueIdentifier` (100,000,000 to 4,294,967,000) on the
server, saved in `billing_payments` as `pending` BEFORE Grow is called, unique across all rows (a collision redraws before calling), never reused, not
even after a refusal (a retry draws a new one). Grow's 1010 ("already seen") or a lost reply -> look up THAT identifier: paid counts once; failed or
never seen closes the row and lets the next attempt run; unsettled stays `unknown` and the month is NOT charged again until it is settled. On top,
one success per subscription and month stays enforced by the database.

**Failed charge.** Unchanged: retries on days 1, 3 and 5, the in-app banner "החיוב החודשי נכשל" with "עדכון כרטיס", and after 7 days the existing trial
gate (read stays open, writes blocked). A successful card unblocks at once. Billing routes never use the plan guard.

**Receipts.** Grow issues the receipt for each charge on Kalmea's account. When the token-charge answer carries the document link (and number), it is
stored with the payment at once and shown in her billing history; otherwise the row says "הקבלה בדרך".

**Migration (run by hand, after add_kalmea_billing.sql):** `supabase/migrations/add_kalmea_billing_grow.sql`. Desktop copy: `kalmea-sql-kalmea-billing-grow.txt`.

**What Grow must confirm before `BILLING_MODE=live`:**
1. A Grow Light account may save a card (chargeType 3, saveCardToken 1) and charge it later with `createTransactionWithToken`, with Kalmea's own key.
2. Which key a Light account uses for API calls (`GROW_BILLING_API_KEY`) and the token page code for that account.
3. Whether the token-charge answer includes the receipt (`invoiceUrl`, `invoiceNumber`), or which webhook delivers it for token charges.
4. That the first token transaction posts to the `notifyUrl` we send and needs `approveTransaction` (as in the client sandbox run), and the IP list.
5. That the receipt is a kabala with no VAT line (osek patur), and the wording/business details on it.

**Tests:** `test-billing-grow.ts` (credentials separation, adapters, ledger-first identifiers, refusal / collision / 1010 / lost reply, consent, the
callback route, migration) and `test-billing.ts` (the whole life cycle, unchanged rules).
