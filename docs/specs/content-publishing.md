# Content planning and publishing: feature spec

Status: **stage 1 built 2026-10-21** (weekly plan, Instagram + Facebook captions, approve, morning reminder; behind the `content_plan` flag; SQL `add_content_plan.sql` + `add_content_gate.sql`). Stages 2 to 4 not started. Owner decisions recorded 2026-10-18 (section 8). Written 2026-10-17 from a read-only reading of the code on `main` (76bdca5) and from public
platform documentation. **Nothing here was built or run.** Facts about Meta, TikTok and YouTube are from their
public docs and developer guides as found on 2026-10-17; anything that depends on those platforms' current
rules is marked UNVERIFIED and must be re-checked in the platform's own dashboard before work starts. They change
rules without notice.

Rules from the owner that this spec obeys (CLAUDE.md): SQL is written as files only and never run; the real tenant
and real client messages are never touched in tests; anything that costs money needs approval; nothing is deleted
from the product (new things hide behind a flag); text for her terminal is English, product copy is Hebrew.

---

## 0. Summary

Goal: every cosmetician gets a weekly posting plan, with the words and the picture or reel for each platform, and
then (stage by stage) less and less manual work to actually publish it.

| Stage | What she gets | External APIs | Gate to start | Effort (dev-days, with AI help) | Recurring cost |
|---|---|---|---|---|---|
| 1 | Weekly pack, per-platform captions (Instagram, Facebook, TikTok, YouTube Shorts), calendar, reminders, one-tap copy/share | none | none | 8 to 12 | AI calls inside existing caps, about 1 call per pack |
| 2 | Auto-scheduled posting to Instagram and Facebook | Meta Graph API | Meta App Review + Business Verification (weeks, outside our control) | 12 to 18 (+ review rounds) | free API; hosting for a publisher job |
| 3 | TikTok and YouTube Shorts publishing | TikTok Content Posting API, YouTube Data API | TikTok audit; Google API compliance audit | 10 to 15 (+ audit waits) | free API; quotas |
| 4 | Raw footage in, finished reel out | none new (our own scripts) | a video worker outside Vercel | 20 to 30 | compute per reel; storage |

Recommended order: **1, then 4 in parallel with the Meta review wait, then 2, then 3.** Stage 1 needs nothing
external and gives value on day one. The Meta review takes weeks, so it should be *submitted* as soon as stage 2's
screencast can be shown, not after stage 2 is "finished".

---

## 1. What already exists (reuse list for all stages)

Verified by reading the files named.

| Need | Existing piece | Where |
|---|---|---|
| A post as data (template, values, images, status, caption) | `designs` table: `format` includes `reel`, `status` draft/final/archived, `copy jsonb` = `{ text, hashtags[] }`, `export_path` = the rendered file | `supabase/migrations/add_designs.sql`, `add_designs_reel_and_copy.sql` |
| "What to post this week" suggestions | `suggestPosts()`: an occasion in its window, a quiet day in her calendar, an unposted treatment, a saved review, the week's tip. UI is `WeekView` | `lib/design/suggestions.ts`, `app/design/WeekView.jsx` |
| Occasions | Hebrew-calendar aware `upcomingHolidays()` | `lib/design/holidays.ts` |
| Topics with a fixed shape (tip, myth vs reality, behind the treatment...) | topic bank, 73 topics x 5 shapes, turned into a brief | `lib/ai/topicBank.ts` |
| AI captions in her voice, grounded in her services | `postGenerator.ts` + `buildBusinessContext`, claims guard (no medical or result promises), Hebrew slip fixer | `lib/ai/postGenerator.ts`, `lib/ai/claimsGuard.ts` |
| AI spend control | per-feature monthly caps and a per-tenant dollar ceiling, metered into `ai_usage` | `lib/ai/callCaps.ts`, `lib/ai/usage.ts` |
| Reels in the browser | reel templates, `ReelEditor`/`ReelRender`, recorder picks H.264 + AAC explicitly | `lib/design/reels`, `lib/design/recorderMime.js` |
| Copy/share today | `shareWhatsApp`, `shareFacebook` (copies caption, opens facebook.com), copy caption | `app/design/DesignEditor.jsx:46-47` |
| Reminders to the owner | `owner_notifications` row (source of truth) + web push to `push_subscriptions` (VAPID, `web-push`) | `lib/ownerNotify.js`, `app/api/push/subscribe` |
| Scheduled jobs per tenant, isolated and time-boxed | Vercel crons in `vercel.json` (daily today) + `cronFanout` (cap, per-item timeout, deadline, report) + `cronAuth` | `vercel.json`, `lib/cronFanout.js`, `lib/cronAuth.js` |
| Meta connection | OAuth start/callback, encrypted tokens (AES-256-GCM), `facebook_pages` with `instagram_business_id`, `fb_user_id`, `user_access_token_encrypted`, `granted_scopes`; webhook, deauthorize and data-deletion callbacks | `app/api/facebook/*`, `lib/facebook/*`, `add_facebook_user_token.sql` |
| Meta App Review package | already written: App ID 950953347958539, permission inventory, "how we use it" texts, screencast scripts, blockers | `docs/APP_REVIEW.md` |
| Trial / plan state | `planState()`, `is_tenant_active()` (RLS), `requireActiveTenant` (routes), `tenantIsBlocked` (no-session paths) | `lib/planState.ts`, `lib/planGuard.ts`, `lib/tenantActive.ts`, `trial-gate-policies.sql` |
| Failures that must be seen | `raiseOpsAlert` writes `ops_events`, shown at `/dashboard/admin` | `lib/opsAlert.js` |
| Demo-tenant protection | `isDemoTenantId` | `lib/demoTenants.ts` |
| Hiding unfinished things | per-tenant feature flags | `lib/featureFlags.ts` |
| Storage for exports | public bucket `community-images` (`PUBLIC_BUCKET`) | `lib/clientImages.js` |

Gaps found: nothing stores a *planned date or time* for a post; nothing stores a caption per platform (one `copy`
per design); there is no publisher; the reel recorder output is a browser recording, not a guaranteed
platform-ready file; no server-side video processing exists in the repo.

---

## 2. Trial gate: rules for every new table (applies to all stages)

How the gate works today: `trial-gate-policies.sql` creates three RESTRICTIVE policies (insert, update, delete) per
table, all `to authenticated`, all calling `is_tenant_active()`. A table is covered only if it is named in that
file's `targets` array. SELECT is never blocked: a tenant on hold keeps reading. The script is one-shot, and the
file itself warns that a missing table is a silent gap ("SKIPPED ... GAP IN THE GATE").

Therefore, for this feature:

1. **Every new table gets the same tenant-scope policies as `designs`** (`tenant_id = get_user_tenant_id()` for
   select/insert/update/delete) **and its own restrictive gate policies.** Do not edit `trial-gate-policies.sql`
   (it is already applied or pending by hand). Instead ship one new file, `add_content_gate.sql`, that repeats the
   same `do $$ ... foreach t in array targets` block for the new table names, and ends with a verification query
   that lists any new table without all three `_require_active_*` policies. It must be listed after the table
   migrations in the run order.
2. **Service-role code bypasses RLS, so the gate does not stop it.** The publisher cron, the video worker callback
   and the token-refresh job all run as service role. Each of them must call `tenantIsBlocked()` per tenant before
   doing anything that posts, spends or renders, and skip (and log, not alert) when blocked. Otherwise a tenant
   whose trial ended keeps auto-posting and burning compute. `tenantIsBlocked` fails open on read errors by
   design; for publishing and rendering that is the wrong default (it would spend money for a blocked tenant), so
   add a strict variant (`tenantMustBeActive`) that fails closed for these two jobs only. Billing code keeps its
   fail-open rule.
3. **Read stays open on hold.** She can see her plan, calendar and past posts while on hold. What stops: creating
   or editing plan items, connecting accounts, queueing posts, starting renders. Already-queued jobs are paused,
   not deleted (nothing is deleted). When she renews, they come back as "paused: choose what to keep" rather than
   firing all at once with stale content.
4. **Routes that mutate or spend** call `requireActiveTenant` first (clean 402 with the existing Hebrew copy),
   as the AI routes do.
5. **Demo tenants never publish or render.** Same guard as the other outbound paths (`isDemoTenantId`).
6. **Tokens** are encrypted with the existing `lib/facebook/encryption.ts` pattern (same key variable). Never in
   `settings`, never returned to the browser.
7. **Migrations**: files in `supabase/migrations/` plus a copy on her Desktop as `kalmea-sql-content-*.txt`, with
   verify queries at the bottom; never run. Code must degrade honestly when a migration has not run (a clear
   Hebrew message, no crash, no fake success), as the designs code already does with its `copy` column probe.

---

## 3. Stage 1: weekly posting pack, per-platform captions, calendar, reminders, one-tap share (no external APIs)

### 3.1 What she sees

- **"התוכנית של השבוע"** (this week's plan) at the top of the existing content door (`WeekView`). A 7-day strip,
  3 to 5 items by default, each item a card: the picture or reel thumbnail, the topic in one line, the day and time,
  and four small platform chips (Instagram, Facebook, TikTok, YouTube Shorts) that open that platform's caption.
- **Calendar view**: week and month, items as dots/cards; drag to another day (or tap to change time). Holidays
  from `holidays.ts` and her quiet days from the appointment data are shown as hints ("יום שקט ביומן: אפשר לפרסם").
  Posted/not posted state is visible at a glance.
- **Per-platform captions** (see 3.3), generated once per pack, editable, with a character counter per platform.
- **One-tap actions per platform chip**: "העתקי טקסט" (copy caption + hashtags), "הורידי קובץ" (download image/reel),
  "פתחי באינסטגרם/טיקטוק/יוטיוב/פייסבוק" (open the app or site; on phones use the Web Share API with the file so the
  platform's own composer opens with the media; fall back to download + copy + open), and "סימנתי שפורסם" (mark as
  posted, optional paste of the post link).
- **Reminders** (see 3.4): "בעוד 30 דקות: פוסט על ... מוכן לפרסום" with a button that opens the item.
- **Weekly pack generation**: Sunday (and on demand). Uses what the app already knows: the week's occasions, quiet
  days, services she has not posted about, saved reviews, topic bank. Each item links to a design (existing
  template flow) or a reel idea (what to film, from the existing planning card). She can swap, skip or regenerate
  one item without regenerating the pack.

### 3.2 How the pack is generated

1. `suggestPosts()` proposes candidates (no AI). Rank and pick 3 to 5, spread over her preferred days, avoiding two
   items of the same category in a row and anything she posted in the last 10 days (needs `content_items` history).
2. One AI call per pack (call site `content/pack`, counted against a new monthly cap, default 6, in
   `MONTHLY_CALL_CAPS`) writes, for every item, the topic line and the **four** captions in one JSON response. One
   call, not 20, keeps cost and latency down and keeps the tone consistent across platforms.
3. Output passes `claimsGuard` and `fixHebrewSlips`, same as `postGenerator`. Captions never promise results,
   never include medical claims, never invent prices or offers (the offer text is passed in from her settings only
   if she set one).
4. Designs: items that need a picture are created as `designs` rows through the existing generate/fill path, so the
   picture is a normal editable design (no second system). AI images follow the existing image cap.

### 3.3 Per-platform captions (rules to encode; limits UNVERIFIED, re-check each platform before shipping)

| Platform | Style to generate | Limits to enforce in the counter (as known; verify) |
|---|---|---|
| Instagram | Hook line first (it is what shows before "more"), short paragraphs, 3 to 5 relevant hashtags at the end, one clear call to action ("שלחי הודעה", "קישור בביו") | caption about 2,200 chars; a handful of hashtags performs best (hard limit around 30) |
| Facebook | A bit longer and warmer, can contain a link, fewer hashtags (0 to 2) | very long allowed; keep short anyway |
| TikTok | One punchy line, 2 to 4 hashtags, written to the on-screen hook; mention that audio can be added in-app | caption about 2,200 chars (UNVERIFIED, has changed); show a "add a trending sound in the app" hint |
| YouTube Shorts | A **title** (around 100 chars, with the topic in the first words) plus a short description; `#Shorts` tag | title about 100 chars; description about 5,000 |

Every caption is Hebrew, feminine forms, her voice, no ad shouting (the brand rule: ads loud, app soft applies to
the *UI*, not to her captions; the captions follow her own tone settings). She can edit any of them; edits are
kept (`edited = true`) and never overwritten by regeneration unless she asks.

Labelling: reels that contain AI-generated footage get a one-line reminder to switch on the platform's AI label.
That is already in the posting kit notes for the founder; productize it as a checkbox per item
("יש כאן תוכן שנוצר ב-AI") that adds the right reminder text per platform.

### 3.4 Reminders (no external API)

- A cron (decision 3: production is on Vercel Pro, so a frequent cron is available, see 4.4; the morning and Sunday
  reminders can use the existing daily slot) fans out per active tenant using `cronFanout` and writes `owner_notifications` + web push through `ownerNotify`. Three kinds:
  **plan ready** (Sunday), **today you post** (morning, at her chosen hour), **missed** (next morning, once, gentle).
- Exact-time reminders ("in 30 minutes") need the frequent cron from decision 3. Until it is deployed, promise only
  what a daily run can keep: a morning reminder with the planned time shown. Do not claim a push at 18:30 if the
  cron runs at 14:00. (This is the "queued is not sent" rule from the kalmea skill, applied to
  reminders.)
- Owner only. Nothing in this module ever messages her clients. No WhatsApp to herself either (that was removed from
  owner pings on purpose, see `lib/ownerNotify.js`).
- Respect quiet hours and a daily cap of one content notification per kind.

### 3.5 Reuse and new code

Reuse: `designs`, `WeekView`, `suggestions.ts`, `holidays.ts`, `topicBank.ts`, `postGenerator`/claims guard, caps,
`ownerNotify`, `cronFanout`, DesignEditor share functions (move into a small shared `lib/content/share.ts`; keep the
old buttons working, nothing removed).

New: `lib/content/pack.ts` (select + AI prompt), `lib/content/captions.ts` (platform rules and counters),
`app/api/content/pack` (generate), `app/api/content/items` (CRUD), `app/api/content/remind` (cron),
`app/design/PlanCalendar.jsx`, `app/design/PlatformCaption.jsx`, feature flag `content_plan`.

### 3.6 New tables (stage 1)

All with `tenant_id uuid not null`, RLS tenant-scoped like `designs`, restrictive gate per section 2.

- `content_plans`: `id`, `tenant_id`, `week_start date` (Sunday, Israel time, use `apptTime`/`dbTime` helpers),
  `status` (draft, active, archived), `generated_by` (ai, manual), `source jsonb` (which suggestions fed it),
  `created_at`. Unique `(tenant_id, week_start)`.
- `content_items`: `id`, `tenant_id`, `plan_id`, `design_id uuid references designs(id) on delete set null`,
  `kind` (post, reel, story), `topic text`, `occasion_key text null`, `planned_for timestamptz`, `status` (planned,
  ready, posted, skipped), `ai_label boolean`, `reminder_sent_at`, `created_at`, `updated_at`. Index
  `(tenant_id, planned_for)`.
- `content_item_platforms`: `id`, `item_id`, `tenant_id`, `platform` (instagram, facebook, tiktok, youtube_shorts),
  `caption text`, `hashtags text[]`, `title text null` (YouTube), `edited boolean`, `copied_at`, `shared_at`,
  `posted_marked_at`, `external_url text null`. Unique `(item_id, platform)`. Stages 2 and 3 add columns here
  (publish state) rather than a parallel table where possible.
- `content_preferences`: `tenant_id primary key`, `platforms text[]`, `posting_days int[]`, `post_hour int`,
  `items_per_week int`, `reminders boolean`, `default_hashtags text[]`, `tone text`. A table, not a `settings`
  column, because `settings` is deliberately outside the trial gate (see the header of `trial-gate-policies.sql`)
  and these preferences should freeze with the rest of her writes.

Nothing existing is altered except an optional later `designs.content_item_id`. Not needed for stage 1.

### 3.7 Effort, cost, risks (stage 1)

- Effort: schema 1 day, pack generation 2 days, calendar UI 3 days, captions + counters 1 day, reminders 1 day,
  share/copy consolidation 1 day, tests + gate SQL + empty-tenant walkthrough 2 days. **8 to 12 days.**
- Cost: AI only. One Claude call per pack, inside the existing per-tenant dollar ceiling; images keep their own
  cap. No new vendor.
- Risks:
  - Generic or repetitive captions after a few weeks: mitigate with the history check, the topic bank shapes, and
    per-tenant facts only (services, quiet days). Test on a fresh empty tenant (no services, no clients): the pack
    must degrade to occasion + tip items, not crash or invent services.
  - Claims in captions: claims guard on every caption; no results promises.
  - Web Share with files is uneven across browsers (UNVERIFIED on the iOS versions she uses): always keep the
    download + copy fallback and test the real path on a phone, not a desktop emulation.
  - Reminder promises the cron cannot keep (see 3.4).
  - Plan fatigue: a plan she ignores for 2 weeks should get quieter, not louder (halve reminders after 2 missed
    weeks, stop after 4, never shame).

---

## 4. Stage 2: auto-scheduling to Instagram and Facebook (Meta API)

### 4.1 What she gets

Per plan item and platform: "פרסמי אוטומטית" with a date/time. Kalmea publishes at that time to her Facebook Page
and her linked Instagram professional account, tells her it happened (with the post link) or tells her it failed and
what to do. Every auto-post is shown to her first ("מוכן לפרסום, בדקי") and requires one confirm; fully hands-off
mode is a later opt-in once trust exists.

### 4.2 Platform facts and flows (from public docs; UNVERIFIED items must be confirmed in the App Dashboard)

**Instagram (Instagram API / Graph, content publishing)**
- Works for Instagram professional accounts; the official and third-party sources disagree on whether Creator
  accounts can publish reels via API. UNVERIFIED: confirm, and design the connect screen to detect the account type
  and explain ("צריך חשבון עסקי").
- Flow: `POST /{ig-user-id}/media` with `media_type=REELS` (or image) and a **public `video_url`**, poll
  `GET /{container-id}?fields=status_code` until `FINISHED`, then `POST /{ig-user-id}/media_publish`. The video
  must be fetchable by Meta at publish time, so it must sit at a public (or signed) URL for that window.
- There is no native "schedule" parameter on Instagram's publishing endpoints that third-party guides agree on, so
  **Kalmea does the scheduling itself**: store the job, run it at the time, create the container shortly before.
- Limits: Meta's docs state a cap on API-published posts per 24 hours (stated as 100 in the official page found;
  third-party guides quote 25 or 50). Read the live number from `GET /{ig-id}/content_publishing_limit` and enforce
  it. For one cosmetician this is not a constraint; it matters only for our retry logic.
- Reels constraints (vertical 9:16, H.264/HEVC + AAC, MP4/MOV, a maximum duration around 90 seconds for API reels,
  UNVERIFIED): validate the file before queuing (stage 4's output or the recorder output). This is where the
  existing `recorderMime` lesson applies: a file named `.mp4` that holds VP9/Opus will fail. Probe the real codec,
  do not trust the extension.

**Facebook Page**
- Posts and videos: Page access token of a person with the CREATE_CONTENT task on the Page.
- Feed posts/videos have native scheduling (`published=false` + `scheduled_publish_time`, between 10 minutes and
  30 days ahead per the official doc). Reels use `POST /{page-id}/video_reels` (start), upload to `rupload.facebook.com`,
  then finish; the Reels doc lists `video_state` PUBLISHED/DRAFT/SCHEDULED, but a third-party guide says scheduled
  reels are unsupported. UNVERIFIED: test with a real call. Safest design: do not depend on native scheduling, use
  our own scheduler for everything, so behavior is the same on both platforms.
- Reels limit: Meta states 30 API-published reels per 24 hours per Page (stated in the docs found; UNVERIFIED).

### 4.3 Permissions and App Review: exactly what to request

Today `FACEBOOK_SCOPES` (`app/api/facebook/oauth/start/route.ts`) are `public_profile`, `pages_show_list`,
`pages_manage_metadata`, `pages_read_engagement`, `leads_retrieval`; `docs/APP_REVIEW.md` records `ads_read` as built
but not requested, and `instagram_basic` as stored but unused.

For stage 2 the additional permissions are:

| Permission | Why | Notes |
|---|---|---|
| `pages_manage_posts` | publish photos, videos and reels to her Page | listed as "not built" in `docs/APP_REVIEW.md` |
| `pages_read_engagement` | already requested; needed alongside publishing | keep |
| `pages_show_list` | already requested | keep |
| `publish_video` | the Pages posts guide lists it for publishing video to a Page | UNVERIFIED whether still required separately; check the Reels guide's permission list in the dashboard |
| Instagram publishing permission | publish to her Instagram account | **Naming has changed.** One guide says `instagram_basic` and `instagram_content_publish` were deprecated on 2025-01-27 in favour of `instagram_business_basic` and `instagram_business_content_publish` (the "Instagram API with Instagram Login" product). The Facebook-Login-based route (Page-linked account) may still use the older names. UNVERIFIED and decisive: pick one route in the dashboard before coding, because it changes the OAuth flow. |
| `instagram_manage_insights` | optional, later: show how a post did | do not request until a feature uses it |

App Review steps (what each takes, in order):

1. **Business Verification** of the Business portfolio that owns app 950953347958539 (legal business documents;
   free; days to weeks). Needed for Advanced Access for apps used by people who have no role on the app, which is
   exactly our users. Becoming a **Tech Provider** may also be needed (UNVERIFIED for this use case).
2. **Privacy policy, Data Deletion and Deauthorize callbacks**: already built (`app/api/facebook/data-deletion`,
   `deauthorize`). Re-check that the privacy page names publishing and what is stored (post text, media URLs, post
   ids).
3. **App Dashboard > App Review > Permissions and Features**: request Advanced Access for each permission above. Each
   needs: a plain description of the use (extend section 2 of `docs/APP_REVIEW.md`), a **screencast** that shows the
   Facebook Login dialog with the permission list, then the feature working end to end on a test Page and a test
   Instagram professional account, and test credentials for the reviewer. Meta reviews each permission separately;
   third-party guides quote 2 to 4 weeks per submission, anecdotal.
4. **Development mode limit**: until approval, only people with a role on the app (test users) can publish. So the
   whole of stage 2 is built and tested with test users first; real cosmeticians come after approval.
5. **App in Live mode**, data use checkup (annual), keep the review notes current. A rejected permission slows the
   others, so submit only what the screencast demonstrates (the lesson already written in `docs/APP_REVIEW.md`).
6. **Blockers that already exist** (from `docs/APP_REVIEW.md`, state as of 2026-10-12): the app secret in Vercel was
   wrong or unset, the icon size, the callbacks. Confirm each is fixed before the screencast; a webhook that fails
   its signature check cannot be demonstrated.
7. Every existing connection was made with the old scope list. After approval, a connected cosmetician must
   **re-consent** to get the new permissions; `facebook_pages.granted_scopes` already records what was granted, so
   the UI can say "צריך לחבר מחדש כדי לאפשר פרסום" instead of failing in a Graph call.

### 4.4 Architecture

- **Queue table + a publisher job.** A cron calls `/api/content/publish-due` every few minutes; it uses
  `cronFanout` per tenant, claims due jobs with `update ... set state='claimed' ... where state='queued' and
  run_at <= now() returning *` (atomic, so two overlapping runs cannot double-post), checks `tenantMustBeActive`
  (section 2.2), refreshes nothing silently, publishes, and writes the result. **Decision 3: she is on Vercel Pro, so
  this is a Vercel cron entry in `vercel.json` running every 5 minutes** (current crons are all daily; the exact
  minimum interval and per-plan cron limits are UNVERIFIED, so confirm in the Vercel dashboard when adding it). No
  extra service and no extra cost is assumed. Fallback only if the interval is refused: Supabase `pg_cron` calling
  the same route with the cron secret (would need her approval, as it is a new moving part).
- **Idempotency**: `idempotency_key` unique per `(item_platform_id, attempt_group)`; never create a second container
  for the same item; store the container id before calling `media_publish` so a crash does not double-post.
- **Failure handling**: classify errors (token expired, permission missing, media rejected, rate limited, platform
  down). Retry only the retryable ones with backoff, max 3. Anything else becomes a Hebrew message to her with one
  clear action, plus `raiseOpsAlert` for platform-side problems. Never say "published" until the publish call
  returned a post id and, for Instagram, the container status is `FINISHED` then `media_publish` succeeded.
- **Media**: file from `designs.export_path` (or stage 4 output) copied to a bucket path with a short-lived signed
  URL for Meta to fetch; probe with ffprobe-equivalent on upload (codec, size, duration, aspect) and block before
  queuing, with a Hebrew explanation.
- **Confirmation to her**: `owner_notifications` + push: "פורסם באינסטגרם" with the link, or the failure and the
  fix.

### 4.5 New tables (stage 2)

- `publish_jobs`: `id`, `tenant_id`, `item_platform_id`, `platform` (instagram, facebook), `run_at timestamptz`,
  `state` (queued, claimed, container_created, publishing, published, failed, cancelled, paused), `attempts int`,
  `container_id text`, `external_id text`, `external_url text`, `error_class text`, `error_text text`,
  `locked_until timestamptz`, `idempotency_key text unique`, `created_at`, `updated_at`. Index
  `(state, run_at)` for the claimer.
- `publish_events`: append-only log `(job_id, tenant_id, at, event, detail jsonb)`. Never updated or deleted.
- `media_assets`: `id`, `tenant_id`, `design_id null`, `source` (design, upload, auto_edit), `storage_path`, `mime`,
  `codec_video`, `codec_audio`, `width`, `height`, `duration_s`, `bytes`, `validated_for text[]`, `created_at`.
- Alter `facebook_pages`: add `publish_enabled boolean default false`, `ig_account_type text`. Nothing removed.
- All gated per section 2 (including `publish_events`: insert blocked on hold; the publisher itself skips blocked
  tenants anyway).

### 4.6 Effort, cost, risks (stage 2)

- Effort: scheduler + queue 3 days, Facebook publisher (photo, video, reel) 3 days, Instagram publisher 3 days,
  media validation 2 days, connect/re-consent/permission UI 2 days, review package + screencasts 2 days,
  tests (with Meta test users, never a real cosmetician Page) 2 days, **12 to 18 dev-days, plus review rounds that
  are calendar time, not work**: realistic 3 to 8 weeks from first submission to Advanced Access.
- Cost: Meta APIs are free. App Review and Business Verification are free. Hosting a faster scheduler may need a
  paid Vercel plan or a small external scheduler (UNVERIFIED which plan she has; needs her approval before any
  upgrade). Storage and egress for signed media URLs are small.
- Risks:
  - **Review rejection or delay** (biggest). Mitigation: ship stage 1 first (value without Meta), submit with a
    clean screencast, request only what is demonstrated.
  - **Permission and product names change** (Instagram Login vs Facebook Login route). Decide first, in the
    dashboard.
  - **Wrong or unplayable media** (the VP9-in-MP4 lesson). Validate by probing the codec.
  - **Double posting** on retries: idempotency + store container id first.
  - **Token expiry/revocation** (she changes password, removes the app): detect, pause her jobs, ask her to
    reconnect; never fail silently.
  - **Posting something she would not want** (stale caption, wrong picture): default to confirm-before-publish,
    show the exact post, allow cancel until the moment of publishing.
  - **Account types**: personal Instagram accounts cannot be used; explain at connect.
  - **Policy**: auto-posting must not look like automation abuse; one post at a time per account, human-set times.

---

## 5. Stage 3: TikTok and YouTube Shorts

### 5.1 What she gets

The same "publish automatically" choice for TikTok and YouTube Shorts, using the same queue, the same confirm step
and the same plan items. Until approvals arrive, those platforms stay in stage-1 mode (caption + file + open the
app).

### 5.2 TikTok (Content Posting API)

- Two ways: **Direct Post** (`video.publish`) and **Upload to drafts** (`video.upload`, the video lands in her
  TikTok inbox/drafts and she finishes it in the app). The Direct Post docs state that content posted by
  **unaudited clients is restricted to private viewing**, and the API returns
  `unaudited_client_can_only_post_to_private_accounts`. So **Direct Post to a public account requires passing
  TikTok's audit**; until then only the drafts route is practical and useful. One guide mentions an additional cap of
  about 5 users per 24 hours for unaudited direct posts (UNVERIFIED).
- Audit requirements (UNVERIFIED in detail): register the app on TikTok for Developers, add the Content Posting API
  product, state the use case, provide a demo video of the complete flow including the TikTok login/consent
  screen, show the mandatory post-composer UX elements TikTok's guidelines require for direct posting (creator
  info shown, privacy level chosen by the user, comment/duet/stitch toggles, branded-content disclosure) and a
  privacy policy and terms URL. Rules about what an app may pre-fill are strict: the user must set privacy and
  final caption herself. This conflicts with a fully hands-off mode; plan on confirm-before-publish for TikTok
  permanently.
- Recommended path: **ship TikTok as "send to drafts" first** (needs `video.upload` and an approved app but not the
  direct-post audit, UNVERIFIED), and apply for Direct Post later with real usage numbers.
- Tokens: access tokens are short-lived and need refresh; store refresh tokens encrypted; a refresh job per tenant.

### 5.3 YouTube Shorts (YouTube Data API v3)

- A Short is an ordinary video upload (`videos.insert`) that is vertical, 60 seconds or less (limit has been
  changing; UNVERIFIED), with `#Shorts` in the title or description. There is no separate Shorts endpoint.
- OAuth scope `https://www.googleapis.com/auth/youtube.upload` is a **sensitive scope**: the Google Cloud OAuth
  consent screen must be verified (privacy policy, homepage, a demo video of the scope in use, domain ownership)
  before more than 100 test users can use it and before the "unverified app" warning goes away.
- **Compliance audit**: Google states that videos uploaded from an unverified API project created after
  2020-07-28 are forced to **private** until the project passes a YouTube API Services audit. The call succeeds and
  returns an id, but nobody can see the video. Same trap as TikTok. Audit takes days to weeks.
- **Quota**: `videos.insert` is documented at 1,600 units of the default 10,000 per day per project (about 6 uploads
  a day for the whole product), and a quota extension requires the audit/application. Two third-party blogs claim a
  separate, larger bucket now exists; UNVERIFIED, check the live quota page. At small scale 6/day across all tenants
  is a real ceiling; request an extension with the audit.
- Per-tenant OAuth: each cosmetician connects her own channel; refresh tokens are long-lived but can be revoked
  (and expire if the consent screen stays in "testing", about 7 days). Verified consent screen is mandatory before
  launch.

### 5.4 New tables (stage 3)

- `social_accounts`: `id`, `tenant_id`, `platform` (tiktok, youtube), `external_account_id`, `display_name`,
  `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `scopes text`, `status` (connected,
  needs_reconnect, revoked), `connected_by uuid`, `created_at`, `updated_at`. Unique
  `(tenant_id, platform, external_account_id)`. Gated per section 2. (Facebook/Instagram stay in
  `facebook_pages`; no migration of existing rows, no deletion.)
- `publish_jobs` from stage 2 gets `platform` values `tiktok`, `youtube` (check constraint widened by a new
  migration, not by editing the old one).
- Deauthorize/delete handling for both platforms (revoke and remove tokens on request), added to the privacy page.

### 5.5 Effort, cost, risks (stage 3)

- Effort: TikTok OAuth + drafts upload + refresh 4 days, YouTube OAuth + resumable upload + refresh 4 days, consent
  screen/audit packages and demo videos 2 days, UI and error states 2 days, tests 2 days: **10 to 15 dev-days plus
  audit waits** (TikTok audit and Google verification: days to weeks each, UNVERIFIED).
- Cost: APIs free; quota is the limit on YouTube. A quota extension is a request, not a fee (UNVERIFIED).
- Risks:
  - **Private-only until audited** on both platforms: never tell her a post is public if the platform forced it
    private; read back the resulting privacy status and show it.
  - **TikTok UX rules** forbid hidden or pre-filled settings; automation level is capped by policy.
  - **Platform policy changes** and API deprecations; isolate each platform behind one adapter with a contract test.
  - **YouTube quota** exhausted by one busy day; queue and spread, tell her honestly when delayed.
  - **Content rules**: both platforms act against reposted or watermarked content; our reels carry no third-party
    watermarks. The Kalmea end-card is her brand, fine.
  - **Sensitive-scope verification** requires a real domain, privacy policy and demo; start early.

---

## 6. Stage 4: automatic reel editing from raw footage

### 6.1 What she gets

She uploads raw footage (a phone video of herself talking, or a long recording). Kalmea returns two or three ready
reels: strongest sentence as the hook, stutters and pauses cut, clean voice, soft music under it, large Hebrew
subtitles, soft cutaways from her own clips and images, her brand card at the end, 30 to 45 seconds, and a plan
item with captions per platform for each. She approves or tweaks the cut list and subtitle text before anything is
final. No face editing of any kind (decided by the owner, 2026-10-17): colour/light and stabilization only.

### 6.2 What exists in `C:\Users\ksafi\kalmea-podcast-work` and how it maps (read from the scripts, not re-run)

| Step in a reel | Script today | Notes for productization |
|---|---|---|
| Transcribe with word times | `faster-whisper`, model `ivrit-ai/whisper-large-v3-turbo-ct2`, int8 CPU | word times accurate to about +-0.2 s; first transcript hides stutters, a prompted pass (`initial_prompt` with fillers) exposes more (`audio_only.py`, `dis_transcribe.py`). Check the model's licence before commercial use. UNVERIFIED |
| Choose what to keep | **hand-picked spans per reel** in `build_v2.py` / `build_cam.py` (`P(first,last)`, `removals`) | this is the piece that does not exist as automation: a "pick the best 30 to 45 s" step. Needs an LLM pass over the transcript (hook candidates, self-contained spans, no cut mid-thought), reusing Kalmea's Claude client and caps |
| Cut stutters/pauses without clipping words | silence-anchored refine: `valley_near()`, `silent_runs()` (energy envelope), skip a cut when there is no clean gap | works; reports cuts it skipped. Keep the "report what could not be cut" behaviour as a UI list |
| Verify the cuts | re-transcribe the cut audio, look for clipped words (`audio_only.py`, `verify_voice.py`) | keep as an automatic QA step with a pass/warn result |
| Vertical crop + face-following | `R.face_center_x`, crop to 9:16, alternating 1.0/0.94 punch-in at each jump cut | |
| Head-bob stabilization | `headtrack.py` (Haar per frame) + the `stab` variant in `build_v2.py`: window follows the face, zoom anchored on the face | built 2026-10-17; head jump at cuts measured from up to 21 px to 2 px or less (of 480). Slow in Python (about 9 minutes per 35 s reel on her laptop before face edits were removed); needs a faster tracker |
| Light | ffmpeg `eq/colorbalance/curves` grade on the face layer; separate milder grade for the podcast background | per-background tuning was a manual look-at-one-frame step. Productize as 2 to 3 presets chosen by a brightness/colour-cast measurement of a sample frame, with her preview |
| Voice | `deep-filter.exe` (DeepFilterNet, MIT/Apache, runs on CPU), then tone chain / `dereverb.py` (numpy STFT), `loudnorm` to -14 LUFS | owner chose "sample 3" (DeepFilterNet + tone chain). DeepFilterNet's own warning: clipping if input peaks at 1.0, so normalize input first |
| Music | `make_music.py`, original synthesized (numpy), ducked with `sidechaincompress`, chord lands on the end card | no licensing risk (we synthesize it). Keep |
| Subtitles | `reelkit.py` (`build_cues`, `write_ass`), libass, font Assistant, RLM-prefixed lines, our own line breaks, `R.FIXES` word-fix list | the RTL rules in the kalmea skill apply unchanged. `R.FIXES` is a growing manual list: needs a per-tenant correction UI |
| Cutaways | `build_v2.py` kinds `vid`, `still`, `split`, `vidshift`, text cards (PNG cards rendered by Chrome/Playwright) | needs a clip library per tenant (her own phone clips and images, plus our stock/AI clips) and a matcher: pick the 2 to 4 clips whose topic matches the spoken words (an LLM or embedding step) |
| Banner | `banner.jpg`/`card.png` as a 3.5 s end card | brand assets exist in `settings.branding`; render from them |
| Hook card | PNG text cards, `hooks*.cjs` | replace with the existing `lib/design` text/scene renderer |
| Orchestration | one Python file per reel + shell loops | needs a job runner with a state machine (below) |

What does not exist: any server-side video runtime in the Kalmea repo (Vercel functions cannot run this: no ffmpeg
binary guarantee, no Python, CPU time and memory limits, 120 s `maxDuration` seen in the existing routes).

### 6.3 Architecture

- **A separate worker**, not Vercel: a small container (Python + ffmpeg + whisper model + DeepFilterNet binary) run
  on a managed container service that can scale to zero (options: Cloud Run, Fly.io, Railway, Modal; pick one and
  cost it, see 6.5). Kalmea (Vercel) only creates jobs and shows progress.
- **Flow**: browser uploads raw footage straight to object storage with a resumable, size-capped upload (Supabase
  Storage is the existing storage; its per-file size limits depend on plan, UNVERIFIED) -> `raw_uploads` row ->
  `edit_jobs` row (queued) -> worker claims it with the same atomic-claim pattern as stage 2 -> steps, each writing
  progress: *probe -> transcribe -> pick spans (LLM) -> cut + verify -> crop/stabilize/grade -> voice -> music ->
  subtitles -> cutaways -> end card -> encode H.264/AAC 9:16 -> probe output -> upload* -> a `designs` row of format
  `reel` (so it appears in her archive and in the plan) + `media_assets` + three platform captions generated as in
  stage 1.
- **Human in the loop**: a "review the cut" screen shows the transcript with removed words struck through, the
  chosen hook, the subtitle text (editable, uses the existing RTL-safe cue builder), and the skipped-cuts list.
  Her edits create a new render from the stored recipe (`recipe jsonb`: spans, removals, cutaways, texts), so a
  tweak does not need the 46 minutes of analysis again.
- **Determinism and recipe**: the recipe JSON is the same shape as today's `reel(name, spans, removals, cuts, texts,
  zoom, fix)` config in `build_v2.py`. This lets the existing code be wrapped rather than rewritten, which is the
  fastest route and keeps the tuned behaviour.
- **Hebrew rendering**: subtitles stay libass with our own line breaks; never DOM rasterization (kalmea skill, video
  section). Cards use the existing canvas/scene renderer, or pre-rendered PNGs, not `html2canvas`.
- **Gate and abuse**: **decision 5: a trial tenant gets 2 auto-edits** (plans are unlimited), enforced by a per-tenant counter in `callCaps` style (`reels/auto-edit`) and a size/duration limit at
  upload; the worker re-checks `tenantMustBeActive` before starting and before the expensive steps. Nothing is
  deleted from her side when the trial ends; raw files older than a retention window can be moved to cold storage
  only with her consent, never silently removed.

### 6.4 New tables (stage 4)

- `raw_uploads`: `id`, `tenant_id`, `storage_path`, `bytes`, `duration_s`, `width`, `height`, `status` (uploaded,
  probed, rejected), `created_at`.
- `edit_jobs`: `id`, `tenant_id`, `raw_upload_id`, `state` (queued, claimed, running, needs_review, rendering, done,
  failed, cancelled, paused), `step text`, `progress int`, `recipe jsonb`, `report jsonb` (skipped cuts, QA
  warnings), `worker_id`, `compute_seconds int`, `cost_usd numeric`, `output_design_id uuid null`, `error_text`,
  `created_at`, `updated_at`.
- `transcripts`: `id`, `tenant_id`, `raw_upload_id`, `words jsonb` (word, start, end), `model text`, `created_at`.
- `clip_library`: `id`, `tenant_id`, `storage_path`, `kind` (video, image), `tags text[]`, `description text`,
  `duration_s`, `source` (own, stock, ai), `created_at`. Needed by the cutaway matcher.
- All gated per section 2. The worker authenticates with a worker secret and writes with the service role, so it
  checks plan state itself.

### 6.5 Effort, cost, risks (stage 4)

- Effort: worker container + job runner 5 days, port/wrap existing scripts into one parameterized pipeline 5 days,
  LLM "pick the best spans + hook" step with evaluation 4 days, stabilization speed-up 2 days, cutaway matcher + clip
  library 3 days, review screen (transcript, cuts, subtitles) 4 days, upload/size limits/progress 2 days, QA
  automation + tests on real footage 3 days: **20 to 30 dev-days.**
- **Budget (decision 4): the video server runs on a scale-to-zero service with a hard monthly cap of 100 ILS that she
  approves.** Enforced in code, not by hope: every `edit_jobs` row records `compute_seconds` and `cost_usd`; before
  starting a job the worker sums the month's spend and refuses (job state `paused`, Hebrew message "החודש הגענו
  לתקרת העיבוד, נמשיך בחודש הבא או שנעדכן") once the cap would be exceeded; the provider's own spend alert is set
  below the cap too. Raising the cap is her decision each time. At the estimate below this means a few hundred
  reels per month, far above trial and early-launch use.
- Cost (estimates, not quotes; measure before committing, and she approves any spend):
  - Compute: measured on her laptop without GPU, a 35 s reel took about 95 to 100 s of render (audio + video) and a
    46-minute transcription was the long step; stabilization was about 9 minutes per reel before optimization. On a
    4 to 8 vCPU container that is roughly 5 to 15 minutes of compute per finished reel, order of cents to low tens of
    cents per reel on pay-per-second container pricing (UNVERIFIED, depends on provider). A GPU for Whisper would cut
    transcription time but costs more per hour; CPU int8 is likely enough for 1 to 5 minute raw clips, which is the
    realistic upload (not a 46-minute podcast).
  - LLM: one or two Claude calls per job for span selection and captions; inside the existing caps.
  - Storage and egress: 4K raw footage is large (hundreds of MB per minute). Cap uploads, transcode a proxy for
    analysis, keep raw for a limited window with her consent. Storage plan limits UNVERIFIED.
- Risks:
  - **Quality is the product.** The manual process needed several passes (clipped words, residual stutters, head dips).
    The automation will produce some bad cuts. Mitigate with the verify-by-re-transcription step, the skipped-cuts
    report, and the review screen. Never publish an auto-edit without her approval.
  - **Honesty about limits**: some stutters sit inside continuous speech and cannot be cut without clipping the next
    word; the tool must say so (it already does in the manual flow).
  - **Hebrew ASR errors**: wrong words in subtitles are visible. The review screen with editable subtitles and a
    per-tenant correction list is mandatory, not optional.
  - **Face handling**: no slimming, smoothing or contouring, ever (owner rule). Stabilization and light only.
    Anything touching a face goes through that rule.
  - **Model and tool licences** (ivrit whisper weights, DeepFilterNet, fonts, synthesized music) must be checked for
    commercial use before launch. UNVERIFIED.
  - **Footage privacy**: raw footage of clients' faces may appear in her recordings; store per-tenant, private
    bucket, signed URLs only, deletion on request through the existing data-deletion path.
  - **Cost runaway**: caps per tenant per month, job timeouts, a kill switch in the admin panel.
  - **Platform fit**: outputs must satisfy stage 2/3 media validation (H.264/AAC, 9:16, duration limits); the worker
    runs the same probe as the publisher.

---

## 7. Cross-cutting

- **Feature flags**: `content_plan` (stage 1), `content_publish_meta` (2), `content_publish_tiktok_youtube` (3),
  `content_auto_edit` (4), each default off, enabled per tenant (founder first, on a dedicated test tenant, never her
  real tenant 448e9e45-2251-4572-b665-886c5bc7a4c8 for publishing tests). Hidden, never deleted.
- **Testing without touching real accounts**: Meta test users and a test Page/Instagram account; TikTok sandbox
  (UNVERIFIED availability); a throwaway YouTube channel. No test ever posts to the founder's real accounts or
  messages a real client. Clean up created posts and rows after each run.
- **Honest status language** (kalmea skill): "מתוזמן" is not "פורסם". Show queued, publishing, published (with link),
  failed (with reason and a fix), paused (on hold). A post marked posted by hand is labelled "סימנת שפורסם".
- **Ops**: failures into `ops_events` via `raiseOpsAlert`; the admin panel gets a "content jobs" list (stuck jobs,
  failure rate). Sentry for the worker.
- **Privacy**: privacy policy and data-deletion page updated to name publishing tokens, media and captions; deletion
  removes tokens and files for a tenant when she asks.
- **Run order for her** (SQL files only, never run by Claude): 1) `add_content_plan.sql` (stage 1 tables),
  2) `add_content_gate.sql` (gate for stage 1 tables), then per stage: `add_publish_jobs.sql` then its gate;
  `add_social_accounts.sql` then its gate; `add_auto_edit.sql` then its gate. Each file idempotent, with verify
  queries at the bottom, and a Desktop copy named `kalmea-sql-content-<stage>.txt`.
- **What must not change**: existing share buttons, `designs.copy`, the lead-ads connection and its scopes, the
  posting kit. New permissions are added alongside the current ones; existing connections keep working until she
  chooses to reconnect.

## 8. Decisions (owner, 2026-10-18)

| # | Decision | Effect on this spec |
|---|---|---|
| 1 | Stage 1 first, then stage 4 while Meta reviews | Order: 1, then 4 in parallel with the Meta wait, then 2, then 3. Stage 1 needs no approval and has no cost. |
| 2 | Check the App Dashboard first; prefer the Facebook Login route for Instagram | First task of stage 2 (before any code): open Permissions and Features, confirm which Instagram publishing permission names exist for the Facebook Login (Page-linked) route, and write the result into section 4.3. Keeps the existing Page connection and `facebook_pages.instagram_business_id`; Instagram Login is only the fallback if the dashboard offers no publishing permission on the Facebook route. |
| 3 | Vercel Pro: use a frequent Vercel cron | Publisher cron every 5 minutes in `vercel.json` (section 4.4). No external scheduler. Confirm the minimum interval in the Vercel dashboard when adding it. |
| 4 | Scale-to-zero video server, monthly cap 100 ILS, approved by her | Provider chosen at the start of stage 4 (candidates: Cloud Run, Fly.io; pick the one whose pricing fits the cap, and show her the numbers before creating any account). Spend is tracked per job and enforced as a hard cap (section 6.5). Nothing is created or paid for until she approves the provider. |
| 5 | Unlimited plans, 2 auto-edits in the trial | No cap on stage 1 plans (one AI call per pack stays inside the existing AI ceiling). Stage 4 counter `reels/auto-edit` is 2 for a trial tenant. The raw-footage length limit per upload is not decided; propose a default at build time and ask. |
| 6 | Approval always required for TikTok; default approval for Instagram and Facebook; optional hands-off mode later | Every Instagram/Facebook post shows "מוכן לפרסום, בדקי" and waits for one confirm. TikTok has no hands-off mode ever (platform rules). A hands-off toggle for Meta is a later, separate change behind its own flag, off by default. |

Not decided and still open: the raw-footage minutes per trial upload (decision 5), and the per-month paid-plan
allowances for auto-edits (not asked yet).

## 9. Sources used for platform facts (checked 2026-10-17; re-verify before building)

- Meta, Instagram Platform content publishing: https://developers.facebook.com/documentation/instagram-platform/content-publishing
- Meta, Pages API posts: https://developers.facebook.com/documentation/pages-api/posts
- Meta, Reels Publishing API: https://developers.facebook.com/docs/video-api/guides/reels-publishing
- TikTok, Content Posting API Direct Post reference: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- Google, YouTube Data API quota cost: https://developers.google.com/youtube/v3/determine_quota_cost
- Third-party guides were used only to flag disagreements; every disagreement above is marked UNVERIFIED.
