# Meta App Review package: Kalmea (App ID 950953347958539)

Prepared 2026-10-11 from a read-only reading of the code on branch `fix/marketing-audit`, plus HTTP checks of
the public pages. **Nothing here was run against Meta**: every statement about what a permission does in
Meta's systems is from the way the code calls the Graph API, and is marked UNVERIFIED where it depends on
Meta's current rules. Re-check each permission's page in the App Dashboard (App Review > Permissions and
Features) before submitting; Meta changes these requirements without notice.

> **Updated 2026-10-12 (branch fix/app-review):** the icon, the deletion and deauthorize callbacks and the ads_read token
> are fixed in code; see section 7 for the exact fields to fill in and the final screencast script. Sections 1-6 are the
> original read-only audit and describe the state BEFORE those fixes.

## 0. The honest summary

| | |
|---|---|
| Permissions the product genuinely uses today | `public_profile`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `leads_retrieval` |
| Built but not wired to a requestable permission | `ads_read` (campaign insights dashboard), `instagram_basic` (the page's Instagram id is stored, nothing uses it) |
| Not built | `pages_manage_posts`, `pages_manage_ads`, `ads_management`, `business_management`, `pages_messaging`, every other Instagram permission |
| Blocking today | `FACEBOOK_APP_SECRET` is wrong or unset in Vercel (memory note `facebook-leads-blocker`): every webhook POST fails its signature check, so the review screencast cannot show a lead arriving. The 1024 px app icon in the repo is 512 px. No Data Deletion callback (an instructions URL exists). |

**"The most advanced permissions possible" is the wrong target.** App Review checks each requested
permission against a screencast that shows the feature working end to end; a permission that is requested
but not demonstrable is rejected, and a rejected submission slows the approvals that were sound. The
package below asks for the permissions the lead-ads pipeline needs (Advanced Access, because the people
connecting Pages are cosmeticians with no role on the app) and tells you what has to be built, and
demonstrated, before the others are worth asking for (section 1, "Not built").

Advanced Access in practice: with Standard Access a permission only works for people who have a role on the
app (admin, developer, tester). A cosmetician connecting her own Page needs Advanced Access, which needs
App Review and Business Verification (section 5).

---

## 1. Permission inventory

Status: IMPLEMENTED = the feature exists and uses the permission; PARTIAL = code exists but the permission
is not requested, or the call is not wired so it would work; NOT BUILT = no code.

### Requested today (`FACEBOOK_SCOPES`, `app/api/facebook/oauth/start/route.ts:32`)

| Permission | Kalmea feature | Where | Status |
|---|---|---|---|
| `public_profile` | Identifies the Facebook user in the OAuth dialog; no profile data is stored. Default permission. | `app/api/facebook/oauth/start/route.ts:33` | IMPLEMENTED |
| `pages_show_list` | After login, lists the Pages the user manages so every one can be connected to her business (`GET /me/accounts`). | `lib/facebook/client.ts:120` (`getUserPages`), `app/api/facebook/oauth/callback/route.ts:122` | IMPLEMENTED |
| `pages_manage_metadata` | Subscribes each connected Page to the app's `leadgen` webhook (`POST /{page-id}/subscribed_apps`, `subscribed_fields=leadgen`). Without it Meta never sends a lead. | `lib/facebook/client.ts:138` (`subscribePageToWebhook`), callback `route.ts:171` | IMPLEMENTED |
| `pages_read_engagement` | Granted with the Page access token: the token the app stores and uses for the lead fetch is a Page token read through this permission. No feature reads Page posts or engagement numbers. | `lib/facebook/client.ts:120-135` (`/me/accounts` returns the Page tokens) | PARTIAL: requested as a dependency of the lead pipeline, not a feature in its own right. Reviewers will ask what it is for; section 2 says exactly that. |
| `leads_retrieval` | Receives a `leadgen` webhook event, fetches the lead's form fields (`GET /{leadgen-id}`), scores and saves the lead into her pipeline. | `app/api/facebook/webhook/route.ts`, `lib/facebook/client.ts:179` (`getLeadDetails`) | IMPLEMENTED |

### Built, not requested

| Permission | Kalmea feature | Where | Status |
|---|---|---|---|
| `ads_read` | "Campaigns on Facebook and Instagram": spend, leads and cost per lead for her ad campaigns (`GET /me/adaccounts`, `/{act}/campaigns`, `/{act}/insights?level=campaign`). | `app/api/marketing/campaigns/route.js`, `lib/facebook/insights.js`, UI `app/beautyos.jsx` (content tab > "קמפיינים בפייסבוק") | PARTIAL, and probably not working as built (UNVERIFIED): `ads_read` is not in `FACEBOOK_SCOPES`, and the route calls `/me/adaccounts` with the stored **Page** token. Ad accounts are listed with a **user** token that carries `ads_read`. To ship it: add `ads_read` to the scopes, keep the long-lived user token (encrypted, like the Page token) next to the Page token, use it in `campaigns/route.js`. Then it can be reviewed. |
| `instagram_basic` | The Page's connected Instagram business account id is read (`instagram_business_account{id}`) and stored in `facebook_pages.instagram_business_id`. Nothing uses it yet. | `lib/facebook/client.ts:123`, callback `route.ts:150` | PARTIAL: the field is requested in a call, the permission is not, and no feature depends on it. Do not submit until a feature uses it (for example Instagram insights); until then it is not demonstrable. |

### Not built (what each would need)

| Permission | What exists today | What would have to be built to ask for it |
|---|---|---|
| `pages_manage_posts` | "Share to Facebook" copies the caption and opens facebook.com (`app/design/DesignEditor.jsx:47`). It does not post. | A "Publish to my Page" action that calls `POST /{page-id}/photos` or `/feed` with the exported design; a confirm step; error states. |
| `pages_manage_ads` | Nothing. | Meta's Lead Ads retrieval documentation lists it alongside `leads_retrieval` for Page lead access. Check the current page in the App Dashboard: if the Lead Ads use case still lists it, add it to the first submission. UNVERIFIED. |
| `ads_management` | Nothing; Kalmea only reads campaign numbers. | Campaign creation or editing from inside Kalmea, with its own UI and a screencast of it. |
| `business_management` | Nothing. | Only needed to read ad accounts through a Business portfolio. Not needed for Page-level lead ads. |
| `pages_messaging`, `pages_manage_engagement` | Nothing. Customer messages go through WhatsApp (Green API, `wa.me` links). | Messenger inbox / comment replies in the app. |
| `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`, `instagram_manage_messages` | Nothing. The Instagram business id is stored (above). | Instagram publishing, insights or inbox features; each needs the feature first. |

---

## 2. "How will your app use this permission" (paste into App Review)

Write these once per permission in the App Dashboard. Each says what the user sees, what is stored, and what
is not done. They describe only what the code does today.

### public_profile
Kalmea is a client-management and booking application for independent beauty professionals (cosmeticians
and nail technicians). A business owner signs in to Kalmea, then chooses "Connect Facebook" to link the
Facebook Page her business uses for Lead Ads. `public_profile` is the default identity permission returned
by the Facebook Login dialog that starts this connection. Kalmea does not store or display any profile
information from it; the connection is recorded against her own Kalmea account.

### pages_show_list
After the business owner logs in with Facebook, Kalmea calls `GET /me/accounts` to list the Pages she
manages and connects each one to her Kalmea business account, so that leads from that Page's Lead Ads can
be delivered to her. We display the connected Page's name in the app ("Connected: <Page name>") and store the
Page id, name and category. We do not list or store Pages for any other purpose.

### pages_manage_metadata
For each Page the business owner connects, Kalmea subscribes the Page to our app's `leadgen` webhook
(`POST /{page-id}/subscribed_apps` with `subscribed_fields=leadgen`). This is the only thing we use the
permission for: without the subscription Meta does not notify us when someone submits the owner's Lead Ad
form, and the owner would not receive her leads in Kalmea. We do not modify any other Page settings, and we
do not subscribe any other field.

### pages_read_engagement
Kalmea uses the Page access token returned for each Page the owner connects to fetch the data of a lead
that the Page received (see `leads_retrieval`). `pages_read_engagement` is the permission under which that
Page access token is issued to our app. Kalmea does not read the Page's posts, comments, reactions or
follower data.

### leads_retrieval
When a person submits a Lead Ad form on a Page that the business owner has connected, Meta sends our webhook
a `leadgen` event with the lead id. Kalmea uses `leads_retrieval` to read that lead's form fields
(`GET /{leadgen-id}`: name, phone, email and any answers the owner's form asks for), then saves them as a
new lead in the owner's pipeline so that she can contact the person. A short automated summary may be
generated to help the owner prioritise (lead quality and a suggested follow-up); it is shown only to the
owner. Lead data is stored per business, visible only to that business, and is never shared with another
business or used for advertising. A person who submitted a form can ask for deletion (see the privacy
policy, "Data Deletion").

### ads_read (submit only after the fix in section 1)
Kalmea shows the business owner how her Facebook and Instagram ads perform: a read-only list of her
campaigns with spend, leads and cost per lead for a date range she selects (7 or 30 days, this month, and
so on), and the number of leads each campaign produced in her Kalmea pipeline. We call
`GET /me/adaccounts`, `GET /{ad-account}/campaigns` and `GET /{ad-account}/insights?level=campaign` with
her token. We never create or change campaigns, budgets or audiences, and data is shown only to the
business that owns the ad account.

### instagram_basic (do not submit yet)
There is no Kalmea feature that uses Instagram data today. When one exists (for example read-only Instagram
insights next to the ad numbers), write its use here.

---

## 3. Screencast scripts (kalmea.app)

Record at 1280x720 or larger, narrated or captioned in English, with the browser address bar visible. The
interface is in Hebrew (right to left): the quoted labels below are exact; English glosses are in brackets.
Use the reviewer account described in section 4, on a phone-width or desktop window. **Show the Facebook
Login dialog in full, including the permission list**: reviewers need to see the dialog ask for exactly the
permissions requested.

### A. Connect a Page (pages_show_list, pages_manage_metadata, public_profile, pages_read_engagement)

1. Open `https://kalmea.app/login`, sign in with the reviewer account.
2. In the bottom navigation tap "תוכן" [Content].
3. At the top, switch to the "קמפיינים בפייסבוק" [Facebook campaigns] segment.
4. Tap the blue "התחברי לפייסבוק" [Connect Facebook] button. The Facebook Login dialog opens
   (`/api/facebook/oauth/start` redirects to `facebook.com/v21.0/dialog/oauth`).
5. Pause on the dialog so the requested permissions are readable. Continue as the Facebook test user, choose
   the test Page, confirm.
6. You land back on the dashboard with a toast "הדף חובר בהצלחה" [Page connected successfully].
7. Open "תוכן" > "קמפיינים בפייסבוק" again: the header shows "מחובר ✓ · <Page name>" [Connected]. State
   aloud: "Kalmea has listed the user's Pages (`pages_show_list`) and subscribed the chosen Page to the
   lead webhook (`pages_manage_metadata`)."
8. Optional proof of the subscription: in the Meta App Dashboard > Webhooks > Page, show the Page listed as
   subscribed to `leadgen`.

### B. A lead arrives (leads_retrieval, pages_read_engagement)

1. In a second tab open Meta's Lead Ads Testing Tool
   (`https://developers.facebook.com/tools/lead-ads-testing`), choose the connected test Page and its test
   form, and press "Create lead" (this sends a real `leadgen` webhook to
   `https://kalmea.app/api/facebook/webhook`).
2. Back in Kalmea tap "לקוחות" [Clients] in the bottom navigation, then the "פניות" [Leads] segment.
3. The new lead appears at the top of the list with the name, phone and email from the form, and a
   suggested follow-up. Open it to show the form answers.
4. Tap "אירועי פייסבוק" [Facebook events] (`/dashboard/leads/webhook-events`) to show the event the webhook
   recorded for this lead, marked processed.
5. State aloud: "The lead's details were fetched with `leads_retrieval` using the Page token, and saved to
   this business's pipeline only."

### C. Campaign numbers (ads_read), only after the section 1 fix

1. "תוכן" > "קמפיינים בפייסבוק".
2. Tap "טעני קמפיינים" [Load campaigns]. Show the campaign rows (spend, leads, cost per lead) and the totals.
3. Change the range ("7 ימים" / "30 ימים") to show the data reloads.
4. State aloud that the data is read-only and belongs to the connected ad account.

### D. Disconnect and deletion (shown in every submission)

1. Open `https://kalmea.app/privacy#data-deletion` and scroll to "Data Deletion" (English section).
2. State the two routes: the owner emails from her registration address; a person who submitted a lead form
   asks the business, or Kalmea, and the record is removed within 30 days.

---

## 4. Instructions for reviewers (Meta's "Notes for the reviewer" field)

Do **not** put a password in this repository or in this file: it goes in the App Dashboard's reviewer notes
field when you submit, and is rotated after review.

Write in the field, filling the bracketed values yourself:

> Kalmea is a web app for beauty professionals (https://kalmea.app). The interface is in Hebrew, right to
> left. To review:
>
> 1. Sign in at https://kalmea.app/login with the reviewer account: email `[reviewer email]`, password
>    provided in this field separately. (The two public demo accounts at /demo cannot connect Facebook by
>    design; use this account.)
> 2. Facebook side: use the Facebook test user in App Roles > Test Users. It is the admin of the test Page
>    "[test Page name]", which has a Lead Ad form named "[form name]".
> 3. Connect the Page: bottom navigation "תוכן" (Content) > "קמפיינים בפייסבוק" > the blue button
>    "התחברי לפייסבוק" (Connect Facebook). Log in as the test user and grant the permissions.
> 4. Create a test lead with the Lead Ads Testing Tool for that Page and form
>    (https://developers.facebook.com/tools/lead-ads-testing).
> 5. See the lead: bottom navigation "לקוחות" (Clients) > "פניות" (Leads). The webhook inspector is the
>    "אירועי פייסבוק" (Facebook events) button on the same screen.
> 6. Privacy policy: https://kalmea.app/privacy. Terms: https://kalmea.app/terms. Data deletion:
>    https://kalmea.app/privacy#data-deletion.

What has to exist before you submit (checklist, in order):

- [ ] A Kalmea tenant created through the normal sign-up (https://kalmea.app/signup), onboarding finished,
      **not** a demo tenant (demo tenants refuse Facebook connection in `oauth/callback/route.ts`).
- [ ] A Meta test user (App Dashboard > App Roles > Test Users) who administers a test Page; the Page has a
      Lead Ad form (a form can be created without running an ad; the Testing Tool only needs the form).
- [ ] The test Page connected to the reviewer tenant once yourself, so the screencast shows a working state.
- [ ] A fresh `FACEBOOK_APP_SECRET` in Vercel, then verify with `GET /api/facebook/oauth/start?dryrun=1` and
      one Testing Tool lead (memory: `facebook-leads-blocker`).

---

## 5. Prerequisites checklist

| Item | State (checked 2026-10-11) | Action |
|---|---|---|
| Business Verification | UNVERIFIED (not visible from the repo) | Required for Advanced Access. In Business Settings > Security Center, verify the business (legal name, registration document, address, phone or domain). Start now: it takes days. |
| Data Use Checkup | UNVERIFIED | Complete in the App Dashboard before submitting; Meta will ask for it. |
| Privacy Policy URL | `https://kalmea.app/privacy` returns 200 (checked), Hebrew and English, names Facebook lead data and Meta | Enter in App Settings > Basic. |
| Terms of Service URL | `https://kalmea.app/terms` returns 200 (checked) | Enter in App Settings > Basic. |
| Data deletion | No callback endpoint. An instructions section exists at `https://kalmea.app/privacy#data-deletion` (returns 200; the anchor is in `app/privacy/page.tsx:162`). `/data-deletion` and `/delete-data` return 404. | Use "Data Deletion Instructions URL" = `https://kalmea.app/privacy#data-deletion`. A callback (`POST` with `signed_request`) is the stronger option; it is not built. |
| App icon (1024 x 1024) | `public/icons/icon-1024.png` is 512 x 512 (mis-named). `Downloads/icon-1024.png` exists; not inspected here. | Upload a real 1024 x 1024 PNG in App Settings > Basic. |
| App category, contact email | UNVERIFIED | Set; the contact email must be a monitored address (the privacy page uses one). |
| Webhook callback URL | `https://kalmea.app/api/facebook/webhook`; GET with a wrong verify token answers 403, so `FACEBOOK_WEBHOOK_VERIFY_TOKEN` is set in production (checked). | Product > Webhooks > Page: callback URL above, verify token = the Vercel value, subscribe the `leadgen` field. |
| Webhook signature | `FACEBOOK_APP_SECRET` wrong or unset (memory). Every POST is rejected 401 until fixed. | Fix, redeploy, test with the Lead Ads Testing Tool. |
| App Mode | UNVERIFIED | Switch to Live before the review ends; permissions with Advanced Access do not apply to a Development-mode app. |
| Valid OAuth redirect URI | `https://kalmea.app/api/facebook/oauth/callback` | Facebook Login > Settings > Valid OAuth Redirect URIs. |
| Platform | Web, site URL `https://kalmea.app` | App Settings > Basic > Add platform. |
| Deauthorize callback | None | Optional; add if you want disconnect events. |
| Live API call before submitting | Meta only lets you request some permissions after the app has made successful calls with them in the last 30 days (UNVERIFIED for each permission). | Do the section 3 A and B flows once with a test user so the calls are recorded. |

---

## 6. Recommended submission order

1. **Business Verification and Data Use Checkup first**, and fix the three blockers (app secret, 1024 px
   icon, Live mode). Nothing is approved without them, and the screencast cannot be made without a working
   webhook.
2. **Submission 1: the lead-ads core** (`pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`,
   `leads_retrieval`, plus `public_profile` which is default), as one use case "Receive Lead Ads leads in my
   CRM". One coherent story, every permission shown in screencasts A and B, built and working today. This
   has the highest approval chance, and it is the only one that unblocks real customers.
3. **Submission 2: `ads_read`**, after the code change in section 1 (scope + user token) and screencast C.
   Keep it separate so a problem in it cannot hold up submission 1.
4. **Later, one at a time, each with its feature built first**: `pages_manage_posts` (publish a design to the
   Page), then the Instagram permissions (insights, then publishing). `ads_management`, `pages_messaging` and
   `business_management` are not worth asking for until the product has a feature that needs them.
5. After approval: set the app Live, run one real connection with a non-role user, and watch
   `/dashboard/leads/webhook-events` for failures (the badge counts failed events from the last 7 days).

---

## 7. Update 2026-10-12: what was fixed on branch `fix/app-review`, and the exact dashboard fields

What changed in the code (all verified by build and tests; **not** run against Meta):

| Blocker in section 0 | Now |
|---|---|
| 512 px icon named 1024 | `public/icons/icon-1024.png` and `brand/icon-1024.png` are a real 1024 x 1024 PNG (a 2x upscale of the 512 px artwork on the brand background; if you have the original artwork at a higher resolution, replace it before submitting). |
| No Data Deletion callback | `POST https://kalmea.app/api/facebook/data-deletion` verifies `signed_request` with `FACEBOOK_APP_SECRET`, removes the Page connections and tokens stored for that Facebook user, and answers `{ url, confirmation_code }`. The status page is `https://kalmea.app/data-deletion/status?code=...`. |
| No Deauthorize callback | `POST https://kalmea.app/api/facebook/deauthorize` verifies `signed_request`, switches that user's connections off and wipes their tokens. |
| `ads_read` not requested / wrong token | `ads_read` is added to the OAuth scopes (set `FACEBOOK_REQUEST_ADS_READ=false` in Vercel to stop asking until it is approved). The callback keeps the long-lived **user** token (encrypted) and the campaigns dashboard and daily ad-spend pull use it. |
| `FACEBOOK_APP_SECRET` wrong | Still a manual step (below). |

**SQL to run, once:** `supabase/migrations/add_facebook_user_token.sql` (adds `fb_user_id`,
`user_access_token_encrypted`, `granted_scopes` to `facebook_pages`; adds `data-deletion` to the reserved
addresses). Until it is run the new code behaves exactly as before and the two callbacks answer correctly but find
nothing to remove. **Everyone must reconnect Facebook once after the SQL** (an existing connection has no user id
or user token); do the reviewer account yourself.

### 7.1 Paste THIS into THAT (Meta App Dashboard)

**App Settings > Basic**

| Field | Paste / set |
|---|---|
| Display name | `Kalmea` |
| App icon (1024 x 1024) | upload `public/icons/icon-1024.png` from the repo |
| App domains | `kalmea.app` |
| Contact email | `maayanfacebook1992@gmail.com` (the address the privacy policy lists; it must be a monitored inbox) |
| Privacy Policy URL | `https://kalmea.app/privacy` |
| Terms of Service URL | `https://kalmea.app/terms` |
| User data deletion | choose **Data deletion request URL**, paste `https://kalmea.app/api/facebook/data-deletion` |
| Category | `Business and pages` |
| Add platform > Website > Site URL | `https://kalmea.app` |

**Products > Facebook Login > Settings**

| Field | Paste / set |
|---|---|
| Client OAuth login / Web OAuth login | Yes / Yes |
| Enforce HTTPS | Yes |
| Use Strict Mode for redirect URIs | Yes |
| Valid OAuth Redirect URIs | `https://kalmea.app/api/facebook/oauth/callback` |
| Deauthorize callback URL | `https://kalmea.app/api/facebook/deauthorize` |
| Data deletion request URL | `https://kalmea.app/api/facebook/data-deletion` |

**Products > Webhooks > Page**

| Field | Paste / set |
|---|---|
| Callback URL | `https://kalmea.app/api/facebook/webhook` |
| Verify token | the value of `FACEBOOK_WEBHOOK_VERIFY_TOKEN` in Vercel (Production) |
| Subscribe to field | `leadgen` |

**Vercel (Production) environment**

| Variable | Value |
|---|---|
| `FACEBOOK_APP_SECRET` | App Settings > Basic > App secret > Show. Redeploy, then open `https://kalmea.app/api/facebook/oauth/start?dryrun=1` while logged in: `app_secret_valid` must be `true`. This is what unblocks every webhook. |
| `FACEBOOK_REQUEST_ADS_READ` | leave unset to ask for `ads_read`; `false` to stop asking |

**App Review > Permissions and Features > (each) Request advanced access > "How will your app use this permission"**

Paste the text for that permission from section 2 above, unchanged. Submission 1: `pages_show_list`,
`pages_manage_metadata`, `pages_read_engagement`, `leads_retrieval` (and `public_profile`, default). Submission 2:
`ads_read`.

**App Review > Notes for the reviewer** (submission 1 and 2): the blockquote in section 4, with the bracketed
values filled in. Password goes here and nowhere else.

**App Review > Data handling questions** (Data Use Checkup), answers that match the code:

| Question | Answer |
|---|---|
| Which data do you receive from Facebook? | Page id, name, category and Page access token; lead form answers (name, phone, email, custom answers); for `ads_read`: campaign names, spend, impressions, clicks, lead counts. |
| Do you share it with third parties? | No. Lead data is visible only to the business that owns the Page. The lead is scored by an AI service (Anthropic) to suggest a follow-up; it is not used for advertising. |
| Where is it stored? | Supabase (PostgreSQL, EU/US region as configured), per business, row-level security. Tokens are encrypted at rest (AES-256-GCM). |
| How can a person delete it? | Data deletion callback `https://kalmea.app/api/facebook/data-deletion`, or by e-mail, as in `https://kalmea.app/privacy#data-deletion`. |
| Is it used for ads / sold? | No. |

### 7.2 Final screencast script (one recording, about 5 minutes)

Record 1280x720 or larger, English captions or voice-over, address bar visible, the Facebook Login dialog shown
in full. Use the reviewer tenant (section 4). Open the screen first, then read the line in quotes.

1. **0:00 - What it is.** Show `https://kalmea.app`. "Kalmea is a CRM and booking app for independent beauty
   professionals. A business owner connects her Facebook Page so that her Lead Ads leads arrive in her
   pipeline."
2. **0:20 - Sign in.** `https://kalmea.app/login`, sign in as the reviewer. "This is the business owner's
   account."
3. **0:40 - Connect.** Bottom navigation "תוכן" (Content) > "קמפיינים בפייסבוק" > press "התחברי לפייסבוק"
   (Connect Facebook). "She presses Connect Facebook."
4. **1:00 - The dialog.** Pause on the Facebook Login dialog for five seconds; scroll it so every permission is
   readable. "The app asks for: public profile, the list of Pages she manages, Page metadata so we can subscribe
   the Page to lead notifications, Page engagement for the Page token, lead retrieval, and read access to her ads."
5. **1:40 - Grant.** Continue as the test user, choose the test Page, confirm. Back in Kalmea: toast "הדף חובר
   בהצלחה" (Page connected). "Kalmea listed her Pages and subscribed the chosen Page to the leadgen webhook."
6. **2:10 - Prove the subscription.** Meta App Dashboard > Webhooks > Page: the Page listed, `leadgen`
   subscribed.
7. **2:30 - A lead arrives.** Lead Ads Testing Tool: choose the Page and form, "Create lead". Switch to Kalmea
   "לקוחות" > "פניות": the new lead appears with name, phone, email. Open it. "Kalmea fetched the lead's fields
   with leads_retrieval and saved them for this business only."
8. **3:20 - The event log.** "אירועי פייסבוק" (Facebook events): the event, processed.
9. **3:40 - Ads (submission 2 only).** "תוכן" > "קמפיינים בפייסבוק" > "טעני קמפיינים": campaign rows with spend, leads
   and cost per lead. "Read-only. Kalmea never creates or edits campaigns."
10. **4:10 - Revenue by source.** Show the "הכנסות לפי מקור" report on the same screen: "The owner sees which source
    brought paying clients."
11. **4:30 - Disconnect and deletion.** Open `https://kalmea.app/privacy#data-deletion`. "A person can ask for
    deletion by e-mail, and Meta's deletion callback removes the connections we hold for that Facebook user." (If
    you want to show the callback itself: Meta App Dashboard > Facebook Login > Settings > the callback URLs.)
12. **4:50 - Close.** "That is every permission we request, used as shown."
