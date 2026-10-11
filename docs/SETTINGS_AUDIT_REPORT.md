# Settings audit: final report

Branch: `fix/settings-audit` (based on `feat/template-packs`, so it also carries that branch and the marketing-audit fixes).
Preview: https://beautyos-git-fix-settings-audit-mayan5655-4213s-projects.vercel.app

Every step passed `tsc`, the full test suite (111 files) and `next build`. Nothing was merged to main, deployed,
or written to the production database. Migrations were written as files, not run.

## 1. What was done

Settings is now seven groups instead of eight tabs, in this order: **My business, My page, Calendar and services,
Messages, Clients and leads, Connections, Advanced.** The old section blocks were kept; a group decides which are drawn.

| # | Item | Result |
|---|---|---|
| 1 | "More screens" and skin-scan switches unreachable | Moved out of the block that was hidden for every new tenant; they live in Advanced |
| 2 | Phone field mislabelled | Named for what it is (public WhatsApp contact, and Bit). A separate "your number for alerts" field (`automations.owner_phone`); alerts use it, else the business number |
| 3 | Tax status silently "exempt" | Explicit choice only: onboarding step (skippable), Settings (nothing pre-selected, warning when unset), income summary asks instead of guessing, legal receipts refuse to issue until it is chosen, setup checklist step |
| 4 | Win-back / package nudges re-queued daily | A queued message counts as handled and is logged, so it is not built again tomorrow |
| 5 | Public page for nails-only tenants | SQL adds `business_fields` to the public branding function; public defaults (benefits line, value props) now fit the trade |
| 6 | Slug claim likely failing | Claim through a definer function (SQL); reserved list gains `demo`, `logo`, `og`, `accessibility`; the code falls back to the old direct update until the SQL is run |
| 7 | Default colour not selectable; duplicates | `#E9A9A1` added to the Settings palette; the duplicate colour picker moved to Advanced |
| 8 | No Facebook/Instagram card | Connections card: every connected Page, lead delivery on/off per Page (nothing deleted, Meta subscription removed best-effort), Instagram link status, reconnect; plus WhatsApp status |
| 9 | Helper texts that described something else | Review link, quiet mode, owner alert, auto payment confirmation, evening summary, marketing-info, secondary colour label corrected |
| 10 | Bot and FAQ | Bot is in Advanced; the FAQ now says when the bot is not live |
| 11 | Services price/duration | Visible units, price from 0, duration 5-600 minutes (clamped when she leaves the field), validation on add |
| 12 | Booking rules and follow-up timing | Minimum notice and how-far-ahead enforced by the public page and `/api/book-appointment` from one function; review delay and win-back days read by the reminders engine |
| 13 | Save replaced whole bags | `automations` and `branding` merge into the stored copy; the tour's flags always keep the stored value |
| 14 | Write guard migration | Verified that no browser code path writes `settings` any more, and put it in the ordered SQL list |

## 2. Decisions

- **Regrouped, not rewritten.** Wrapping the existing blocks was far lower risk than rebuilding an 800-line screen.
  In "Calendar and services" the services list appears before the hours (file order).
- **No migration for new settings.** Owner phone, booking rules and timing live in the existing `automations` /
  `branding` bags. Booking rules are in `branding.booking_rules` because the public page already reads `branding`.
  Defaults equal the old behaviour (2 hours' notice, 21 days).
- **Tax status:** explicit, skippable in onboarding, but never defaulted. Until chosen: no legal document is issued
  and the income summary asks. A credit note against an older document keeps its previous behaviour.
- **Facebook "disconnect" is a pause.** The Page row stays (`is_active=false`), the webhook skips it and says so in
  the events list, and reconnecting turns it back on.
- **Merge on save** is a shallow merge per bag; clearing a field works because the screen sends an explicit empty value.
- **Nudge de-duplication** is by logging queued messages, not by changing the queue.
- **Not done on purpose:** lead sources, goals and reports (not in the approved 14); removing the remaining
  copy-link buttons that sit in different groups.

## 3. SQL files to run, in this order

Copies are on the Desktop (`kalmea-sql-A-1/2/3-*.txt`); each ends with verify queries.

1. `supabase/migrations/add_settings_write_guard.sql` - revokes the browser's direct write on `settings` (the
   server route is the only writer) and makes a WhatsApp instance id unique. **Run only after this branch is deployed.**
2. `supabase/migrations/add_public_branding_business_fields.sql` - makes the public branding function return
   `business_fields`, so a nails-only public page uses nails defaults. **Read the live function first** (verify query 1).
3. `supabase/migrations/add_slug_claim_rpc.sql` - adds the function that lets her claim her page address, and
   extends the reserved-address list.

Already run earlier: `add_designs_reel_and_copy.sql`, `add_ai_usage_month_spend.sql`.

## 4. Preview

https://beautyos-git-fix-settings-audit-mayan5655-4213s-projects.vercel.app (Ready; `/login` returns 200).
It uses the production database: use a test account, and note saves are real.

## 5. Unfinished / unverified

- **Not exercised in a browser.** Verified by build, tests and reading the code. The Settings groups, the
  Connections card, onboarding's new step and the booking rules need a pass on the preview with a test account.
- **Not tried against live systems:** Facebook page on/off with Meta, the slug function, the public branding
  function. Their SQL has not been run.
- **Settings take effect on "Save",** like every setting (including booking rules and timing).
- **Template/pack work is unchanged** by this branch.
- **Still missing for marketing and sales** (reported, not built): lead sources and attribution, goals and
  reports, consent defaults on the booking page, deposits and cancellation rules.
- **`add_settings_write_guard.sql` header** still says "NOT APPLIED"; update the header after you run it.
