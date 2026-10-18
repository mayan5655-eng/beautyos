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
The charged amount is assumed to **include VAT** (decide with the accountant; the invoicing adapter receives the gross amount).

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
3. **Invoice per charge** (`issueInvoice`): a tax invoice-receipt for each successful charge (VAT included), returning its **number** and **link**; or the provider issues it itself and reports both.
4. Keys as environment variables (never in the database), the **webhook URL** to register, the IP list or signature method of the webhook, and sandbox credentials for a test run.
5. Business questions for the accountant: which entity bills (sole proprietor or company), VAT registration, whether prices include VAT, allocation numbers for business invoices.

Grow specifically: ask whether the platform account can charge a **saved token on a schedule** for Kalmea's own subscription (separate from the per-cosmetician payment pages in the Grow integration), and whether invoices are issued by Grow for Kalmea's own sales.

## Testing

`test-billing.ts` walks the whole life cycle with an in-memory database and a fake clock. `scripts/smoke/billing.mjs` is the browser run on a smoke tenant: part A (no migration) is
verified; **part B (the full charge / retry / block / unblock / cancel / admin flow) needs the migration and has not been run in a browser yet.**
