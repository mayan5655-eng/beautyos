# BloomOS — Pre-Beta Expert Review (Six Perspectives)

**Context:** BloomOS is a multi-tenant SaaS CRM for Israeli cosmeticians — calendar, clients,
leads, cashier, tax, WhatsApp automation, marketing, an AI advisor, and a switchable floral
brand theme. Next.js 16 + Supabase. About to go to its first beta users (real cosmeticians).

Findings marked **[verified]** come from the code. The rest are judgement from domain patterns.

---

## 1. DEVELOPER

**F1. No error monitoring at all. [verified]** No Sentry, no `captureException`.
`instrumentation.ts` exists but is a process-listener guard — and it is **untracked in git**, so
it does not even deploy. When a beta user hits a bug, you learn via WhatsApp, if at all. A
hook-order crash took production down this week and nothing reported it.

**F2. Zero tests. [verified]** No `.test.*`, no `.spec.*`. `tsc` is the entire safety net, and it
cannot see hook-order violations, bad effect deps, or any runtime React error. `beautyos.jsx` is
~7,200 lines with no coverage.

**F3. No rate limiting or bot protection anywhere. [verified]** Four unauthenticated endpoints
run on the service-role key, which bypasses RLS:

| Endpoint | Exposure |
| --- | --- |
| `skin-scan/lead` | `tenantId` from the request body — injects leads into any tenant |
| `skin-scan/send` | `tenantId` from the request body — injects leads AND sends WhatsApp on that tenant's quota |
| `book-appointment` | `tenantId` from the request body — writes appointments into any tenant |
| `confirm` | **public GET, no token at all** — confirms/cancels ANY appointment in ANY tenant and returns the full row |

`confirm` is the worst of the four and is the only one that is also a *read* leak. A fix exists
in commit `3a8683d` (signed HMAC token, POST instead of GET, no row in the response) but is **not
yet pushed**. The other three remain unmitigated: with no rate limit, a script can fill a beta
user's calendar with junk and burn her Green API credit.

**F4. One 7,200-line client component.** Every tab, modal and handler in one file. Every change
risks everything, and merge conflicts will be brutal with a second developer.

**F5. Green API is a single point of failure with no queue.** WhatsApp sends are fire-and-forget
inside request handlers. If the provider is down or rate-limits, reminders are silently lost —
no retry, no dead-letter record.

### INSPIRATION MISSING
- **Sentry + source maps** — table stakes. Linear and Vercel surface user-facing error IDs so
  support can say "send me the code on screen."
- **Feature flags** (LaunchDarkly or simple DB flags) — ship the 13 tabs behind flags, enable
  per-tenant.
- **Idempotency keys on outbound sends** (Stripe's pattern) — a retried reminder must not
  double-message a client.
- **A job queue for WhatsApp** (Inngest, QStash, or a `pending_messages` table + cron) with
  retry/backoff. Mature messaging products decouple send from request.
- **Zod at every API boundary** — bodies are currently destructured raw.

---

## 2. PRODUCT MANAGER

**F1. Thirteen tabs before a single paying user. [verified]** `dashboard, insights, calendar,
clients, leads, cashier, tax, whatsapp, campaigns, community, packages, protocols, advisor`. A
cosmetician evaluating this in 10 minutes cannot tell what it is *for*. The core loop — book →
remind → take payment — is buried among nine things she did not ask for.

**F2. Three features are one-insert stubs. [verified]** `packages`, `waitlist`,
`treatment_protocols` each have exactly one write path. They look finished in the nav and feel
abandoned on contact. Half-built features damage trust more than absent ones.

**F3. The Facebook lead webhook has never run end-to-end.** `facebook_pages` is empty.
Leads-from-Facebook is presented as working but is unproven.

**F4. Nothing measures activation.** No event tracking, so after beta you will not know whether
users reached "first appointment booked" or dropped at import.

**Top 3 for beta:** (1) hide the three stubs; (2) instrument activation; (3) surface gap-fill in
the setup checklist so it is actually switched on.

**Cut/hide: `packages`, `protocols`, `community`** — the three one-insert stubs, and nothing else.

**CORRECTED — campaigns stays.** An earlier draft proposed hiding `campaigns` and `insights` too.
That was wrong on `campaigns`: ad and campaign management is the reason this product exists and is
the thing that differentiates it from Fresha, which does bookings but not a clinic's marketing.
Hiding the differentiator to make the app look simpler would have made it look like everything
else. `insights` stays as well.

**Keep:** calendar, clients, cashier, whatsapp, leads, tax, campaigns, insights, advisor.

### INSPIRATION MISSING
- **Superhuman's onboarding** — a real human 1:1 session for the first 20 users. Beats any
  in-app tour at beta scale and produces the sharpest feedback you will get.
- **Linear's "empty states that teach"** — every empty tab shows what it looks like full, with
  one action.
- **Progressive disclosure** (Notion, Stripe Dashboard) — advanced surfaces unlock as basics
  complete. The setup checklist already exists; use its completion to *reveal* tabs.
- **One activation North Star** (PostHog/Amplitude): "10 appointments booked in week 1."

---

## 3. DESIGNER (UX/UI)

**F1. 249 text nodes below 11px. [verified]** 33 at 8px, 102 at 9px. On a phone, in Hebrew, for a
user who may be 45+, glancing between clients with wet hands. Biggest usability gap, and why the
app still feels "webby" rather than native.

**F2. Inconsistent surface language.** Cards are glass with square edges; modals are opaque with
24px radius; onboarding has its own card style; `PRESET_COLORS` still contains swept
`var(--pc-tint)` tokens producing duplicate/blank swatches. Three visual dialects in one product.

**F3. Nothing has been visually verified.** Changes were validated by `tsc`, greps and
arithmetic — never by looking. A greeting-overlap bug survived two "fixes" for exactly this
reason.

**F4. No loading/empty/error state system.** A skeleton on first load, then a mix of spinners,
toasts and silence.

**F5. Tap targets and density.** `.icon-btn` is 40px (below the 44px iOS guideline); list rows are
dense for a thumb.

### INSPIRATION MISSING
- **Fresha / Treatwell** (direct competitors) — day view as the default home, drag-to-reschedule.
  Their calendar *is* the product; yours is one tab.
- **iOS-native list conventions** — swipe-to-action on appointment rows (left = cancel,
  right = message). Cosmeticians work one-handed.
- **Airbnb's type scale** — a strict 5-step scale (12/14/16/20/28) instead of 8, 8.5, 9, 9.5, 10,
  10.5, 11.5, 12.5, 13… Pick five, delete the rest.
- **Headspace / Calm** for the wellness feel — big type, generous whitespace, one primary action
  per screen.
- **Haptics + optimistic UI** on booking confirm.

---

## 4. COSMETICIAN (the real user)

**F1. Booking a walk-in mid-treatment is too slow.** Modal → client → service → date → hour →
duration → price → save. My hands are covered in wax. Fresha does this in two taps from the day
view.

**F2. The 30-minute problem is disqualifying. [verified]** `appointments.hour` is a **whole-hour
integer**. I cannot book 14:30. My lash fills are 45 minutes, brows are 20. Not a missing
feature — my actual schedule is unrepresentable. This alone would make me refuse to switch.

**F3. CORRECTED — the send log exists; the gap is the alert. [verified]** An earlier draft of this
review claimed there was no send log. That was wrong. `aad5e29` is on `origin/main` and live: the
WhatsApp tab has a send/log toggle (`waView`), and the log reads `/api/messages`, which derives
the tenant from the session and returns the last 100 rows of `whatsapp_messages`.

The real gap is narrower and still worth fixing: the log is **pull, not push**. She has to think
to go and look. If a reminder fails at 20:00 the night before, nothing tells her — she finds out
when the client does not arrive. What is missing is a failure *notification*, not the log itself.

**F4. CORRECTED — gap-fill is built; it is switched off. [verified]** An earlier draft claimed
this was not a flow. Also wrong. It is complete and race-safe end to end:
`app/beautyos.jsx:1716` schedules `triggerGapFill(appt)` 6.5s after a delete, guarded by the
`restored` flag so the undo cancels it before any message goes out; `app/api/slots/offer/route.js`
re-checks server-side and refuses unless `gap_fill_enabled === true`.

So this is a **settings problem, not a build problem** — `gap_fill_enabled` is false and
`green_api_token` is missing. The product lesson stands, though: the single feature that most
directly recovers lost revenue ships **off by default**, behind a toggle a new user will never
find. It should be part of the setup checklist, not buried in automations.

**F5. End-of-day cash** — I cannot answer "how much did I take today?" in one tap from the home
screen.

### INSPIRATION MISSING
- **Fresha** — free for the salon, monetises marketplace bookings. Israeli cosmeticians know it.
  Day view + drag-reschedule + automatic waitlist fill is the bar.
- **Israeli incumbents (מסלולית / Cluster / Sky-Line)** — what they get right is **חשבונית ירוקה
  integration** (real tax invoices, not a receipt PDF). A legal requirement for her, not a
  nice-to-have.
- **Boulevard / Mangomint (US high-end)** — client photo timeline before/after per treatment;
  client notes surfaced at check-in so she looks like she remembers everything.
- **Deposits / no-show protection** (Bit or card hold at booking) — the #1 pain of every service
  business.

---

## 5. BUSINESS ADVISOR

**F1. The product tracks activity, not money.** No LTV, no repeat rate, no "clients who have not
returned in 60 days" as a *worklist*.

**F2. Packages exist as a table, not a business model. [verified]** Prepaid packages are *the*
cash-flow lever in beauty — money now, visits later, retention locked in. One insert path means
decorative.

**F3. No deposits or no-show protection.** For a solo cosmetician, 3 no-shows/week ≈ ₪900/week
≈ ₪45k/year. Nothing addresses the largest leak.

**F4. Plan gate exists but there is no upgrade moment.** `planState`, trial banners and gates are
built, but nothing makes her *want* to pay at the right time.

**The one buried thing that would most help her business: rebooking at checkout.** The cashier
flow ends at payment. It should end with "book her next appointment" — the highest-ROI habit in
the industry, and both screens already exist.

### INSPIRATION MISSING
- **Prepaid packages/memberships** (ClassPass, Mindbody) — "10 treatments for the price of 9",
  tracked balance, auto-decrement at checkout.
- **Referral loop** (Dropbox/Uber mechanics, localised) — "שלחי לחברה, שתיכן מקבלות ₪50". Beauty
  is word-of-mouth; this is free growth.
- **Win-back automation** (Klaviyo's lapsed-customer flow) — auto-WhatsApp at 60/90 days with a
  reason to return. You have the data and the channel.
- **Rebooking prompt at checkout** — Boulevard reports ~30% rebooking lift.
- **Review requests** post-visit → Google Business Profile. Israeli clients choose by
  Google/Instagram.

---

## 6. DIGITAL MARKETER

**F1. The top of the funnel is unproven. [verified]** Facebook lead ingestion has never run
end-to-end — `facebook_pages` is empty.

**F2. Leads leak at speed-to-lead.** The 10-status pipeline and templates are built, but nothing
enforces the *first 5 minutes*, where conversion is won. No "new lead → auto-WhatsApp within 60
seconds" rule.

**F3. No attribution.** `source` exists on leads, but nothing reports "Instagram → 12 leads → 4
clients → ₪4,800." She cannot tell where to spend.

**F4. Mini-site and skin-scan are lead magnets with no capture discipline.** The skin scanner is a
genuinely strong hook, but scan → lead → booked appointment is not instrumented or optimised.

**F5. No reactivation campaigns to the existing client list** — always the cheapest revenue
available.

### INSPIRATION MISSING
- **Speed-to-lead automation** (HubSpot/Chili Piper) — auto-respond in <60s, book from the reply.
- **Link-in-bio booking** (Linktree / Fresha booking link) — one Instagram-ready page. `/[slug]`
  exists; make it the marketing centrepiece.
- **WhatsApp Business catalog + click-to-WhatsApp ads** — the dominant Israeli funnel, and you are
  already on WhatsApp.
- **Before/after consent + auto-post** — highest-converting content in beauty, generated from her
  own treatment photos.
- **UTM → revenue attribution** on the booking link.

---

## TOP 5 BEFORE BETA — approved order

1. **Add minutes to appointments.** `hour` is a whole-hour integer, so 14:30 is unbookable. Real
   schedules are unrepresentable. Schema change — do it now, before there is real data to migrate.
2. **Sentry + commit `instrumentation.ts`.** Production cannot currently be observed failing. That
   has already happened once, and it was found by a user rather than by us.
3. **Rate limiting + push the signed token on `confirm`** (`3a8683d`, already built, unpushed).
   Closes the read leak and caps the abuse surface on the remaining three public endpoints.
4. **Hide only the three stubs** — `packages`, `protocols`, `community`. Campaigns and insights
   stay.
5. **Raise the sub-11px text** on daily-use screens. Legibility for the real user in real
   conditions, not polish.

**Deliberately not in the top 5**, though highest *business* value: rebooking-at-checkout and
prepaid packages. They make her money, but they need a working, trusted core first.

**Nearly free, worth doing alongside:** switch `gap_fill_enabled` on and finish the Green API
connection. The feature is already built and race-safe (F4) — it is one setting away from
recovering revenue that is currently lost on every cancellation.

---

## Known gaps, logged not fixed

**Group WhatsApp sends are not personalised. [verified]** `{name}` is substituted **once, at
compose time**, not per recipient. `openBulk` calls
`renderLeadTemplate(tpl, singleLead, settings)`, and for a group `singleLead` is null, so
`lib/leads/templates.ts` falls back to `NAME_FALLBACK` — **`לקוחה יקרה`** — and every recipient
gets that same frozen string. A send from the lead drawer passes the lead and does substitute her
real name, so the two paths behave differently from the same template.

She cannot see this before sending: the composer shows the rendered text, so what she reads in the
textarea *is* what goes out. It looks correct, because for a one-off send it is.

The fix is not in the UI. `app/api/leads/send-bulk/route.js` already loads each lead's `name`
before sending (`route.js:77`), so it should take the template with `{name}` **unsubstituted** and
render per recipient inside the send loop. That means the composer has to show a preview rather
than the final text, and the route has to distinguish a template from a literal message — which is
why this is a deliberate deferral and not a one-line change.

Logged 2026-08-31, alongside merging the leads status filter and the bulk-send strip into one control.

**The app loads every appointment ever, on every boot. [verified]** `app/beautyos.jsx:1733-1743`
issues ten `.select("*")` with no `.limit()`, no `.range()` and no date window — appointments,
clients, forms, leads, service_prices, settings, receipts, packages, waitlist, expenses. The
appointments read is the one that grows without bound, and it degrades with her success: the
cosmetician who uses the product most has the slowest app.

**TRIGGER: revisit when any single tenant passes ~2,000 appointment rows.** That is the number to
check, because it is checkable:

```sql
select tenant_id, count(*) from public.appointments group by tenant_id order by count(*) desc limit 5;
```

At 300-400 appointments a year that threshold is roughly year five; at a full book (8 a day, ~2,000
a year) it arrives inside the first year. Which is why the row count is the trigger and the
calendar year is not.

**Do NOT fix this by adding a date filter to the boot read.** Three consumers assume they have all
of history, and a window breaks each one differently. This was audited on 2026-09-01; the other
thirteen consumers are bounded near today and are safe under any reasonable window.

| Consumer | Where | What breaks |
| --- | --- | --- |
| Client history tab | `getClientAppts`, `beautyos.jsx:1906` | A client with two years of visits shows only the windowed slice. She reads it as her data being gone — the most trust-destroying failure of the three. |
| 6-month revenue chart | `monthlyData`, `beautyos.jsx:1951` | Counts come from `appointments`; revenue comes from `receipts`, which stay whole. Months past the window show **0 appointments against real revenue** — a chart contradicting itself. |
| "Days since last visit" | `getDaysSince`, `beautyos.jsx:1904` | Returns the sentinel **999** when no appointment is found. Windowed, a client last seen 200 days ago displays **999** in the client row (`:6341`) and the drawer (`:8761`). |

Checked and NOT broken, so nobody re-derives it: the active/cold split survives any window of 90
days or more, because the boundary is 60 days and a client beyond the window still lands on the
correct side. The win-back message carries `days` as metadata but never interpolates it into the
text (`:6599`), so a `999` cannot reach a client over WhatsApp. `serviceStats` (`:1930`) degrades
only for a treatment booked but never paid outside the window, because receipts stay whole and also
carry `service`.

**The two-tier design that does work:**

1. **Boot** loads a window sized by the furthest-back *aggregate* consumer — −13 months to +12
   months covers the 6-month chart with room for year-over-year, and keeps every calendar view
   exact.
2. **The client drawer fetches that client's own appointments on open** — one indexed query on
   `client_id`, a few dozen rows. That makes `getClientAppts` correct rather than approximately
   correct, which is the only acceptable state for a client's treatment history.
3. **`getDaysSince` stops lying.** Once a window exists, "no appointment found" no longer means
   "never visited" — it means "not in the window". The `999` sentinel has to become an honest "over
   a year ago". Skipping this step trades a slow app for an app that displays a wrong number, which
   is the worse bug.

Step 3 is not optional. Steps 1 and 2 without it is exactly the silent-wrongness category this
review was written to catch.

Logged 2026-09-01. Not attempted: the size of the win is unmeasured — without database access there
was no way to tell whether the current payload is 1MB or 8MB, so the shape of the problem is certain
and its severity today is not.

---

## Corrections log

This document was revised after review. Four findings were wrong:

1. **"No send log"** — wrong. Built and live in `aad5e29`. Corrected to a narrower, real gap: no
   failure *alert*.
2. **"Gap-fill is not a flow"** — wrong. Built end to end, race-safe, 6.5s undo. It is switched
   off. Corrected to a defaults/discoverability finding.
3. **Unauthenticated endpoint list** — omitted `app/api/confirm/route.ts`, the most serious of the
   four and the only read leak. Added.
4. **"Hide campaigns"** — wrong call. Campaigns are the product's differentiator against Fresha.
   Only the three genuine stubs should be hidden.

Corrections 1 and 2 were verified against the code before being accepted, not taken on assertion.
