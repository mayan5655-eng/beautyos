---
name: kalmea
description: Kalmea project conventions and hard-won lessons — verification discipline, brand rules, Hebrew copy, video/RTL rendering, migration handling, and the improvement-pass audit method. Load at the start of every Kalmea (beautyos) session, and before any UI, copy, video/export, or migration work.
---

# Kalmea — what this repo taught the hard way

Kalmea (formerly BloomOS) is a Hebrew RTL beauty-business SaaS. This skill is not
generic advice — every rule below exists because something specific broke in
production first. Read it before touching UI, copy, video export, or migrations,
and apply the verification discipline to every claim of "done."

## 1. Verification — the discipline that matters most

**Never report "done" from reading the JSX.** Three times in one week the code
said one thing and production did another:
- A mobile CSS rule silently stripped the card design at phone width.
- "Sent" meant only that GreenAPI returned 200 — nothing was actually delivered.
- The booking route stopped creating appointments at all.

So, before calling anything verified:
- Screenshot at 430px width against production for any UI claim — don't trust
  the component tree, trust the rendered pixels.
- Walk flows on a **brand-new, empty tenant** — never the founder's own account
  and never the demo tenant. Both carry data that hides bugs (a populated
  services list, existing appointments, a non-zero client count) that a
  genuinely new signup will never have. Empty-state bugs are invisible on any
  account that already has data, which is exactly why they reach production.
- Run the **real build** (`npx next build`), not just `npx tsc --noEmit`. Type
  checking proves types line up; it proves nothing about runtime behavior,
  bundling, or whether a closure-scoped variable is reachable from where it's
  called.
- Label anything you only read — never ran, never screenshotted, never hit
  live — explicitly as **unverified**. Don't let it sit next to verified
  findings without that label.
- When a message claims to have "sent" something (WhatsApp, push, email),
  trace it to the actual delivery confirmation, not just the HTTP status of
  the call that queued it.

## 2. Brand

- Palette: deep green `#1F3A30`, petal pink `#E9A9A1`, cream `#FBF8F1`, pale
  petal `#FBEDE9`, sage `#DCE4D5`.
- Type: Frank Ruhl Libre for headings and numbers, Assistant for body, Gveret
  Levin for handwritten accents.
- The cosmos flower is a quiet mark — watermark, divider, empty-state glyph, or
  small header mark. Never more than two on one screen.
- Ads are loud; the app is soft. Same brand, different volume — don't carry ad
  energy into in-app UI.

**The rule that breaks things if forgotten**: Kalmea's own colors (`--brand-*`)
are product chrome *only*. `settings.primary_color` is **her** brand — it
drives her public booking page, her templates, her posts and reels, her
printed receipts — and must never be overwritten by Kalmea green. If you're
touching anything tenant-facing, use `--pc-*` / `pc` / `herAccent`, not
`--brand-*`. Dashboard chrome and tenant accent are deliberately separate;
don't re-merge them.

## 3. Hebrew copy

- Warm, in the voice of a cosmetician writing to her own client — never a
  system notice. ("שלום רונית! 🌸 התור שלך נקבע", not "תור נקבע בהצלחה.")
- Feminine forms throughout — the user base is overwhelmingly women.
- Never claim a message was **sent** when it was only **queued**. If the
  central WhatsApp number isn't connected, say it's waiting, with an age
  marker — don't paper over the difference.
- Never say "קבלה" (legal receipt) for what the system issues by default. The
  system issues "אישור תשלום" (payment confirmation); a real legal receipt
  comes from her own registered provider (Morning / iCount / Yesh), and that
  distinction has to be visible to her before her first payment, not
  discovered later.

## 4. Video and reels — paid-for knowledge, don't rediscover it

Hebrew in auto-generated video/canvas contexts breaks in specific, repeatable
ways:
- Auto-wrapped paragraphs can render with **line order reversed** (bottom to
  top).
- A line starting with a **digit flips to LTR**, which drags the rest of that
  line's logical order with it.
- A `₪` symbol following a space can **jump to the wrong end** of the line.
- Explicit direction marks (RLM) are **ignored** by some renderers.

Because of this: captions must be composed **one Hebrew-first line at a
time**, with line breaks chosen by us, never left to auto-wrap, and
currency/number symbols glued directly to their digit with no space that could
let them separate.

- **Never rasterize text from the DOM** (e.g. `html2canvas`) for video — it
  clipped text, scrambled letter-spacing in Hebrew, reversed a contact line,
  and turned decorative elements into solid black squares. Draw text directly
  on the canvas instead.
- **Creatomate failed every Hebrew bidi probe** tried against it. **IMG.LY
  CE.SDK passed** every probe (wrap, digit-first lines, trailing ₪). Default
  to CE.SDK for anything involving Hebrew text in generated video/image
  assets; treat Creatomate as unsuitable for this use case.
- Known open gap: the browser-based recorder outputs `.webm`; Instagram wants
  `.mp4`. Reliable `.webm`→`.mp4` conversion needs server-side rendering —
  this has not been solved client-side.

## 5. Migrations

- Nothing runs automatically against the live database in this project — no
  service-role credentials are available in-session. Every migration is
  **handed to the user as a file to run by hand** in the Supabase SQL editor,
  typically written to her desktop as a plain `.txt`, with verify queries
  included at the bottom so she can confirm it applied.
- A migration file's own "STATUS: pending/applied" header is **never**
  trusted as proof of the live database state — if it matters, check the
  database directly (query the table/column), don't infer from a comment.
- Code must **degrade honestly** when a migration hasn't run yet: a clear,
  specific message ("this feature needs a migration that hasn't run yet"),
  never a crash, and never a silent no-op that looks like success.

## 6. The improvement pass — a repeatable audit method

Invoked on request (e.g. "do an improvement pass on X"). The method:
1. Walk a real flow on a **fresh, empty tenant** (see §1 — not the founder
   account, not the demo tenant).
2. Hunt specifically for things that **succeed visually while doing nothing**
   — a button that shows a success toast but wrote nothing, a "sent"
   confirmation for a message that's actually queued or silently dropped.
3. Find **code and comments that disagree with each other and with the
   database** — a comment describing behavior the code no longer has, or
   either one describing a column/table that doesn't exist in the live
   schema.
4. Find **buttons that can never succeed** given current state (missing
   config, unmet precondition, a migration that hasn't run).
5. Find anything that **only works because of one tenant's data** — i.e.
   would break instantly on the brand-new empty tenant from step 1.
6. **Rank findings by when a new user would hit them**, not by severity and
   not by which lens (engineering/design/business) found them.
7. **Report everything before fixing anything** — the full list goes to the
   user first; fixes happen only after she's seen the whole picture and
   said what to act on.
8. **Never fix more than was asked** — a reported finding is not an implicit
   green light to patch it; wait for explicit sign-off, the same way "Ship
   the two headline bugs now" was a specific, scoped authorization, not a
   blanket one.
