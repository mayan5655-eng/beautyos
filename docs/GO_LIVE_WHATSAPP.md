# Going live on the official WhatsApp Business Platform (Meta Cloud API)

Meta app: **BeautyOS, 1464769648086912** (type Business, business portfolio "Maayan laser beauty", 108969401998987). WhatsApp is already added to it. The Facebook leads app (950953347958539) cannot take the WhatsApp use case, which Meta refuses next to its existing use cases, so it stays as it is.
Sending number: **a new, dedicated SIM** (bought for this; number to be filled in here). WhatsApp must never be installed on it: Meta only accepts a number that is not registered on any WhatsApp account, and once it is on the Cloud API it no longer opens in the app.
Support number: **050-7321978** stays Kalmea's support line in the WhatsApp app (`lib/support.ts`). It is NOT the sending number. On 2026-10-20 Meta refused it ("already registered on a WhatsApp account") and its account could not be deleted from the phone it is a second SIM on, so the roles were split.

The code is on branch `feat/wa-cloud`, and all of it is **off** until `WA_CLOUD_ENABLED=true`. While it is off, every message goes exactly as it does today: GreenAPI from the central number for utility messages when the admin "automatic sending" switch is on, the manual queue otherwise, and wa.me from her own phone for marketing, deposits and cancellation fees.

## What the code does

| Piece | Where |
|---|---|
| Mock / live adapter (`WA_CLOUD_MODE`) | `lib/waCloud/adapter.ts` |
| Hebrew utility templates | `lib/waCloud/templates.ts`, `docs/WA_TEMPLATES.md` |
| Routing inside the single send chokepoint | `lib/whatsapp.js` → `lib/waCloud/send.ts` |
| Quiet hours 21:00-08:00 Israel time (booking confirmations exempt) | `lib/waCloud/policy.ts` |
| Per-business daily cap (`WA_CLOUD_TENANT_DAILY_CAP`, default 150, counted from Israel midnight) | `lib/waCloud/send.ts` |
| Webhook with an X-Hub-Signature-256 check before any database access | `app/api/wa-cloud/webhook/route.ts` |
| "הסר" / "stop" opt-out from the Cloud number | same webhook (reuses `lib/marketingConsent.js`) |
| Cost log (accepted, delivered, billable per Meta, estimated $) | table `wa_cloud_messages`, admin panel `/dashboard/admin` |

When she runs live, every refusal lands in her **manual queue**, the same queue GreenAPI failures use. A refusal can come from quiet hours, the daily cap, an unreadable cost log, missing parameters or an error from Meta. A refused message is never dropped silently and is never re-sent through GreenAPI behind her back.

"Sent" means Meta accepted the message and returned an id. "Arrived" is recorded only when Meta's webhook reports `delivered` or `read`.

## Order of work

### 1. Database (her, in the Supabase SQL editor)
Run `supabase/migrations/add_wa_cloud.sql` (a copy is on the Desktop as `kalmea-sql-wa-cloud.txt`). It creates `wa_cloud_messages` and adds it to the trial gate. The verify queries are at the bottom of the file. **In live mode the route refuses to send while this table is missing.**

### 2. In Meta (business.facebook.com / developers.facebook.com, app BeautyOS 1464769648086912)
1. **Business verification** of the business portfolio that owns the app. Until it is verified, the number is limited to 250 business-initiated conversations a day and the display name is restricted.
2. App dashboard → **Add product → WhatsApp**. Create or link the **WhatsApp Business Account (WABA)** under the same business portfolio.
3. Add the **new SIM's number** with display name "Kalmea" (Meta reviews the name), and verify it by SMS. Put the SIM in any phone just to receive that SMS. Do not install WhatsApp on it.
   - The way in: app → WhatsApp → "Step 2. Production setup" → "Register your WhatsApp phone number" → **Add new number** → IL +972, the new number without its leading 0, SMS.
   - Never 050-7321978: it is the support line in the WhatsApp app, and Meta refuses a number that is registered on a WhatsApp account.
4. **Register** the number (Cloud API, with a two-step-verification PIN). Note the **Phone Number ID**. It is not the phone number.
5. Business settings → **System users** → create an admin system user, assign it the app and the WABA (full control), and generate a **permanent token** with `whatsapp_business_messaging` and `whatsapp_business_management`.
6. WhatsApp Manager → **Payment method**: add a card for the WABA. **This costs money and needs her approval.** Utility templates are charged per delivered message at Meta's rate for +972 (the admin estimate uses `WA_CLOUD_UTILITY_COST_USD`). A utility template sent inside an open 24-hour customer-service window is free.
7. **Templates**: submit the five templates from `docs/WA_TEMPLATES.md` as category **Utility**, language **Hebrew**, with the exact names and bodies. Wait for "Approved". If Meta re-classifies one as Marketing, fix the wording. Do not accept it as Marketing.
8. App → WhatsApp → **Configuration → Webhook**:
   - Callback URL: `https://kalmea.app/api/wa-cloud/webhook`
   - Verify token: the value of `WA_CLOUD_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
   - Meta signs every POST with `X-Hub-Signature-256` using the **App Secret**, which the route checks.
   - Make sure the app is subscribed to the WABA. The dashboard does this when the number is added. If not, call `POST /{WABA_ID}/subscribed_apps` with the system-user token.
9. App mode **Live**. Sending from Kalmea's own WABA needs only standard access to `whatsapp_business_messaging`. Advanced access and App Review are needed only to manage other businesses' WABAs, which this design does not do.

### 3. Vercel environment (Production)
```
WA_CLOUD_PHONE_NUMBER_ID=<from step 4>
WA_CLOUD_ACCESS_TOKEN=<from step 5>
WA_CLOUD_APP_SECRET=<App Secret of BeautyOS 1464769648086912: App settings -> Basic -> App secret>   (required; NOT FACEBOOK_APP_SECRET, which belongs to the other app)
WA_CLOUD_VERIFY_TOKEN=<long random string, also typed in step 8>
WA_CLOUD_API_VERSION=v21.0
WA_CLOUD_TENANT_DAILY_CAP=150
WA_CLOUD_UTILITY_COST_USD=<current Meta rate for Israel, utility>
WA_CLOUD_ENABLED=true
WA_CLOUD_MODE=mock
```
Redeploy, then open `https://kalmea.app/api/wa-cloud/webhook` in Meta's webhook "Verify and save". It must succeed.

### 4. Shadow run (mock), a few days
With `WA_CLOUD_ENABLED=true` and `WA_CLOUD_MODE=mock`, nothing is sent through Meta. Every reminder, booking confirmation and document link is still sent by GreenAPI as today, and the admin panel's **"וואטסאפ רשמי (Cloud API)"** section shows what the Cloud route *would* have done: per business, how many would have been accepted, refused (quiet hours, cap, missing parameters) and the estimated cost. Check that the numbers look like a normal day.

### 5. Live
Set `WA_CLOUD_MODE=live` and redeploy. Automatic sending still also needs the admin switch **"שליחה אוטומטית"** (platform_settings) to be on, as it does today. First test with a test tenant and a phone you own, never with real clients. Book an appointment and check:
- the booking confirmation arrives from the new sending number;
- `whatsapp_messages` shows `sent`, then `delivery_status = delivered`;
- the admin cost log shows it as live, arrived and billable;
- replying "הסר" gets the acknowledgement, and the client card shows the opt-out.

### Rollback
Set `WA_CLOUD_ENABLED=false` and redeploy. Every send immediately goes back to the current GreenAPI / manual path. Nothing is deleted.

## What is needed from Meta (summary)
1. Business verification of the portfolio.
2. A WABA linked to app BeautyOS 1464769648086912, with the new sending number (not 050-7321978) added, verified, registered and its display name approved.
3. A System User permanent token (`whatsapp_business_messaging`, `whatsapp_business_management`) and the Phone Number ID.
4. A payment method on the WABA (her approval: this is paid).
5. The five utility templates approved under the exact names in `docs/WA_TEMPLATES.md`.
6. The webhook verified at `/api/wa-cloud/webhook` and subscribed to `messages`.

## Not in this change (deliberately)
- Deposit-link and cancellation-fee messages keep going from her own WhatsApp through wa.me. Their templates are approved in advance, so moving them to the central number later only needs parameters at those call sites.
- No bot on the Cloud number. An inbound message other than an opt-out is acknowledged to Meta and ignored. The client's conversation stays with her cosmetician.
- Marketing never goes through the Cloud route. There are no marketing templates.
