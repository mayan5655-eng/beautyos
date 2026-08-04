# Mobile Optimization Plan — BloomOS

**Branch:** `mobile/responsive` (keep `main` safe until merge)
**Status:** Audited + planned. Not built yet.
**Calendar approach chosen:** single-day agenda view on mobile.
**Rollout chosen:** Phase 1 first → test on phone → then phases 2–5.

---

## Audit summary (what's NOT mobile-friendly)

The **shell already adapts** — one `@media (max-width:680px)` block in `app/beautyos.jsx:2630-2641`
turns sidebars into off-canvas drawers, caps modals to 94%/380px, and toggles a hamburger.
The failures are **inside `<main>`**: `globals.css` has zero breakpoints, and there are
**229 font sizes between 7–10px** with no mobile floor. Modals are the strongest part
(all capped `maxWidth:100%` + scroll) — low priority.

### Top problems (worst screens first)

| # | Screen | Problem | File:line | Severity |
|---|--------|---------|-----------|----------|
| 1 | Calendar | 6-col grid hardcoded `minWidth:480` → whole week scrolls sideways at 375px | `beautyos.jsx:3368`, `:3387` | HIGH |
| 1 | Calendar | Action buttons 17×17px, delete 15×15px — un-tappable in ~70px cell | `:3406-3410` | HIGH |
| 1 | Calendar | **Delete is hover-only** (`hoveredAppt===id`) → impossible on touch (no hover) | `:3410` | HIGH (functional bug) |
| 1 | Calendar | Appointment text 7.5–9.5px — unreadable | `:3401-3402` | HIGH |
| 2 | App-wide | 229 sub-10px font sizes, no mobile bump | throughout | HIGH |
| 3 | WhatsApp Center | 6-col `<table>` in `overflow:hidden`, no scroll wrapper → clips | `whatsapp-center/page.jsx:86-87` | MEDIUM |
| 4 | Layout | `<main>` padding `28px 30px` never reduced on mobile (~16% of screen) | `beautyos.jsx:3083` | LOW (easy win) |
| 5 | Tap targets | Duration chips, calendar arrows, 32px icon-btns all <44px | various | MEDIUM |
| 6 | Post Designer | Fixed `380×380` square slightly overflows 375px | `beautyos.jsx:4794` | LOW |

**Already fine — leave alone:** in-app client/receipt/leads lists (flex-wrap + ellipsis),
analytics grids (`auto-fit` minmax), all modals (capped + scroll), and standalone pages
`/book`, `/login`, `/signup`, `/onboarding`, `/skin-scan` (responsive).

---

## Phased plan

### Phase 1 — Calendar mobile agenda view  *(build first, then review)*
- Under `@media (max-width:680px)`, swap the 6-column week grid for a **single-day list**:
  `◄ יום ג׳ 28.7 ►` day-picker header + full-width appointment rows (time · name · service · duration).
- Desktop week view stays **100% untouched** — additive mobile branch only.
- Rows get readable text (~12–13px) and proper tap targets (~40–44px buttons).
- **Fix the hover-only delete bug** — make ✕ / ♥ / ✉ / ₪ always visible on mobile rows.
- Reuse existing handlers unchanged: `handleApptClick` (edit/reschedule), `handleDelete`,
  `sendReminderToClient`, `handleOpenCashier`. No logic changes.
- **Commit → test on phone → proceed.**

### Phase 2 — Global font floor
- Central `@media` rules in `globals.css` enforcing ~11–12px minimum; bump worst 7.5–9px
  labels/badges. Class-based, not 229 inline edits.

### Phase 3 — `<main>` padding
- Reduce `28px 30px` → ~14–16px under 680px (`beautyos.jsx:3083`). One-liner.

### Phase 4 — Tap-target pass
- Nudge duration chips, calendar arrows, 32px icon-buttons toward ~44px on touch.

### Phase 5 — Loose ends
- WhatsApp Center table (`whatsapp-center/page.jsx:86-87`) → wrap in `overflow-x:auto`.
- Post Designer square (`beautyos.jsx:4794`) → `width:min(380px,100%)`.

---

## Guardrails
- All changes gated behind the mobile breakpoint or additive — **desktop rendering unchanged**.
- Each phase verified with `npx tsc --noEmit` + `npx next build` before committing.
- Everything stays on `mobile/responsive`; `main` untouched until merge.
