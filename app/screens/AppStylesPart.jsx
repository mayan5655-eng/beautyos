"use client";
// app/screens/AppStylesPart.jsx — the <AppStyles> piece of the frame of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <AppStylesPart> in app/beautyos.jsx (the check fails until both sides agree).


export default function AppStylesPart({ ctx }) {
  const {
    pc,
  } = ctx;
  return (
    /* @screen-body */<style>{`
        .serif{font-family:var(--display)}

        /* ── Safe area, for everything anchored to the TOP of the viewport ──
           layout.tsx sets viewportFit:"cover", which is what lets the app run
           edge to edge in a home-screen install - and what puts anything at
           top:0 underneath the clock and the battery.

           .app-header was given padding-top:env(safe-area-inset-top) when that
           was found; nothing else was. These are the four surfaces that were
           missed. The drawers and the toast stack are handled here rather than
           inside the mobile media query because both are pinned to the viewport
           top on every screen size, and the inset is 0px on a desktop anyway -
           so one rule is correct everywhere instead of two that can drift.

           The ✕ is positioned against the header, which starts at the very top
           of the drawer, so it needs the same offset the header does. */
        .drawer-head{padding-top:calc(22px + env(safe-area-inset-top, 0px))!important}
        .drawer-close{top:calc(14px + env(safe-area-inset-top, 0px))!important}
        /* A confirmation under the status bar is not a confirmation. This one
           carries the toast for every write in the app, including the lead
           status and reminder toasts added alongside it. */
        .toast-stack{top:calc(14px + env(safe-area-inset-top, 0px))}

        /* Bottom-nav sheet rise. */
        @keyframes sheetUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
        /* Keyboard focus indicator (only for keyboard nav, not mouse). The
           !important overrides the many inline outline:none declarations. */
        button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,[role="button"]:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--pc)!important;outline-offset:2px;border-radius:10px}
        .slot:hover{background:var(--pc-tint)!important;cursor:pointer}
        .appt-card{transition:transform 0.2s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s}.appt-card:hover{transform:translateY(-2px) scale(1.01);box-shadow:var(--shadow-md)}
        .client-row{transition:box-shadow 0.2s,transform 0.2s,border-color 0.2s}
        .client-row:hover{cursor:pointer;box-shadow:var(--shadow-md);border-color:var(--pc)!important;transform:translateY(-2px)}
        .lead-row{transition:box-shadow 0.2s,transform 0.2s,border-color 0.2s}
        .stat-card{transition:transform 0.28s cubic-bezier(.2,.7,.3,1),box-shadow 0.28s,border-color 0.28s;box-shadow:var(--shadow-sm)}
        .stat-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);border-color:var(--pc)!important}
        .soft-card{box-shadow:var(--shadow-md)}
        .nav-item{display:flex;align-items:center;gap:12px;width:100%;background:none;border:none;border-radius:13px;padding:10px 13px;font-size:13.5px;font-weight:500;color:var(--ink-2);cursor:pointer;font-family:inherit;text-align:right;transition:background 0.2s,color 0.2s,transform 0.12s;position:relative;letter-spacing:-0.01em}
        .nav-item:hover{background:var(--pc-tint);color:var(--ink)}
        .nav-item:active{transform:scale(0.98)}
        .nav-item .nav-ico{width:19px;height:19px;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:0.7;transition:opacity 0.2s,color 0.2s}
        .nav-item.active{background:linear-gradient(100deg,var(--pc-tint),var(--pc-tint-2));color:var(--pc-deep);font-weight:700}
        .nav-item.active .nav-ico{opacity:1;color:var(--pc)}
        .nav-item.active::before{content:"";position:absolute;right:0;top:50%;transform:translateY(-50%);width:3.5px;height:20px;border-radius:4px;background:var(--pc);box-shadow:0 0 10px var(--pc-shadow)}
        /* 2026-10-20 design pass: WhatsApp buttons in the brand's calm language (white, WhatsApp-green text and hairline,
           AA on white) instead of a saturated green pill repeated down every list. */
        .wa-btn{background:var(--surface);color:#0F7A3E;border:1px solid rgba(18,140,74,0.45);border-radius:var(--r-full);padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none;transition:transform 0.12s,box-shadow 0.2s}
        .wa-btn:hover{background:#EEF8F1;transform:translateY(-1px);box-shadow:0 4px 12px rgba(18,140,74,0.15)}
        .call-btn{background:var(--pc);color:var(--surface);border:none;border-radius:var(--r-full);padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .icon-btn{background:var(--pc-tint);border:none;border-radius:50%;width:32px;height:32px;color:var(--pc);font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.2s,transform 0.12s;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
        /* The compact variant, for buttons that sit inside a dense row. Below
           the phone breakpoint it is overridden to 40px like every other
           icon-btn, because a tap target wins over density. Anything laying out
           a row must budget 40, not 26. */
        .icon-btn.sm{width:26px;height:26px;font-size:11px}
        .icon-btn:hover{background:var(--pc-tint-2);transform:translateY(-1px)}
        .icon-btn:disabled{opacity:0.5;cursor:default}
        .primary-btn{border:none;border-radius:var(--r-full);font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-0.01em;transition:transform 0.12s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s,filter 0.2s}
        .primary-btn:hover:not(:disabled){transform:translateY(-1.5px);filter:saturate(1.06)}
        .primary-btn:active:not(:disabled){transform:scale(0.97)}
        .primary-btn:disabled{opacity:0.5;cursor:default}
        /* Entry animations that used to need framer-motion (the whole library was in the first-load bundle for
           seven fades): plain keyframes, same easing, and off for people who asked for less motion. */
        @keyframes fmIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes fmGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes fmPulse{0%,100%{transform:scale(1);opacity:.82}50%{transform:scale(1.12);opacity:1}}
        .fm-in{animation:fmIn .42s cubic-bezier(.2,.7,.3,1) both}
        .fm-grow{transform-origin:bottom;animation:fmGrow .6s cubic-bezier(.2,.7,.3,1) both}
        .fm-pulse{animation:fmPulse 1.6s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.fm-in,.fm-grow,.fm-pulse{animation:none!important}}
        /* width:100%: the cards centre themselves with margin-inline:auto, which in a flex column stops them stretching. */
        .today-stack>*{order:8;width:100%;box-sizing:border-box}
        /* Reusable premium primitives for the redesign */
        .glass-card{background:var(--surface);border:1px solid var(--line);border-radius:19px;box-shadow:0 1px 2px rgba(31,58,48,.05), 0 8px 20px rgba(31,58,48,.06);position:relative;overflow:hidden}
        /* .card-boxed, translucent variant: the petal-pink page under היום's
           cards (app-main's background) should read through them, not sit
           behind an opaque block. This is the DESKTOP/default rule - the
           mobile media query has its own copy further down, because that's
           where the full-bleed/glass override (also !important) would
           otherwise win back the solid version. Two classes beats the base
           .glass-card rule's one, so this needs no !important here. */
        .glass-card.card-boxed{background:rgba(255,255,255,0.62);
          -webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1);
          border:1px solid rgba(255,255,255,0.7);
          box-shadow:0 1px 2px rgba(31,58,48,.03),0 8px 24px rgba(31,58,48,.05)}
        .pill{display:inline-flex;align-items:center;gap:6px;border-radius:var(--r-full);font-weight:600;font-size:11px;letter-spacing:-0.01em}
        .quick-action{transition:transform 0.16s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s,border-color 0.2s}
        .quick-action:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--pc)!important}
        .quick-action:active{transform:translateY(-1px) scale(0.99)}
        @keyframes toast-in{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
        .toast{animation:toast-in 0.24s cubic-bezier(.2,.7,.3,1)}
        @keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}
        .skel{background:linear-gradient(90deg,#EFE7F3 25%,#F8F2FB 50%,#EFE7F3 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}
        @keyframes fade-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        /* backwards, not both: a kept transform:translateY(0) made every tab a containing block for position:fixed, and a sheet opened
           from inside a tab (תבניות רילס, רילס מהצילומים שלי) rendered far below the screen behind a dim backdrop (2026-11-08 QA). */
        .fade-in{animation:fade-in-up 0.4s cubic-bezier(.2,.7,.3,1) backwards}
        @keyframes pop-in{0%{opacity:0;transform:scale(0.96)}100%{opacity:1;transform:none}}
        .pop-in{animation:pop-in 0.24s cubic-bezier(.2,.7,.3,1) both}
        @keyframes voice-pulse{0%{box-shadow:0 0 0 0 var(--pc-shadow)}70%{box-shadow:0 0 0 16px rgba(122,90,136,0)}100%{box-shadow:0 0 0 0 rgba(122,90,136,0)}}
        .voice-pulse{animation:voice-pulse 1.4s infinite}
        @keyframes sheen{0%{transform:translateX(-120%)}60%,100%{transform:translateX(220%)}}
        .empty-cta{transition:transform 0.14s,box-shadow 0.2s,filter 0.2s}.empty-cta:hover{transform:translateY(-2px);box-shadow:var(--shadow-glow);filter:saturate(1.06)}
        .mobile-only{display:none}
        /* Desktop: the sidebar keeps a sticky "book" pill in the same bottom-left corner as the mic, which hid it
           (found in the new-tenant walkthrough). Lift the mic above the pill. */
        @media (min-width:681px){
          .fab-voice{bottom:84px!important}
        }
        @media (max-width:680px){
          /* Toasts on a phone: at the bottom, clear of the nav bar, where her thumb and eyes already are (same place as
             app/MiniToast.tsx), and one step larger. At the top they sat under the header and were missed (2026-11-03 UX review). */
          .toast-stack{top:auto!important;bottom:calc(74px + env(safe-area-inset-bottom, 0px) + 14px)!important}
          .toast-stack .toast{font-size:var(--t-md)!important}
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
          .sidebar-aside{position:fixed!important;top:0;bottom:0;right:0;width:80%!important;max-width:280px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .sidebar-aside.open{transform:translateX(0)}
          /* The closed drawer sits at right:0 translated fully off to the right,
             so its box reaches viewport width + 270px - 710px on a 440pt screen,
             which is what the layout probe was reporting as an overflow.
             position:fixed means it never scrolled the page, but while it was
             merely translated it stayed VISIBLE to hit-testing and to the
             accessibility tree: a screen reader could walk into an off-screen
             menu, and a stray tap at the right edge could land on it.
             visibility:hidden takes it out of both. It is animated rather than
             switched so the slide still works - visibility is not interpolable,
             but it does honour a transition delay, so it flips at the end of the
             close and at the start of the open. */
          /* padding-top carries the safe-area inset for the same reason
             .app-header does: this is pinned to top:0 under viewport-fit:cover,
             so at its inline 16px the first nav item sat under the clock in a
             home-screen install. !important because it overrides the inline
             padding shorthand on the element. */
          .nav-aside{position:fixed!important;top:0;bottom:0;right:0;width:78%!important;max-width:270px;z-index:1500;transform:translateX(100%);visibility:hidden;transition:transform 0.25s,visibility 0s linear 0.25s;padding-top:calc(16px + env(safe-area-inset-top, 0px))!important}
          .nav-aside.open{transform:translateX(0);visibility:visible;transition:transform 0.25s,visibility 0s linear 0s}
          .sidebar-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1499}
          .header-search{max-width:none!important}
          .client-drawer,.lead-drawer{width:100%!important}
          /* Phase 2 — mobile readability: 16px form fields stop iOS zoom-on-focus;
             modest floor on the drawer nav so labels stay legible on a phone. */
          .nav-item{font-size:14px!important}
          /* Navigation adapts by width, from ONE markup tree rather than two
             layouts. Above this breakpoint the persistent sidebar already
             lists all 13 tabs with labels, so the bottom bar would only
             duplicate it; below it, the sidebar collapses to an off-canvas
             drawer and the bottom bar becomes the primary navigation.
             Clearance for the bar is scoped here too, so desktop keeps its
             full content height. */
          /* ONE rule, not two. This was previously a padding-bottom declaration
             followed by a padding shorthand, and the shorthand reset the
             bottom back to 12px - same specificity, both !important, so source
             order won. The bar has therefore been covering the last row of every
             scrolling tab ever since, which no z-index could fix because it is
             spacing, not layering.

             Zero side padding: content runs edge to edge like a native app, and
             the cards' own internal padding keeps text off the glass. Vertical
             padding stays, including the clearance for the bottom bar. */
          /* 2026-10-20 design pass: a 12px side gutter after all. Edge to edge left buttons, selects and the
             agenda's actions touching (and, with wrapping rows, crossing) the screen edge on a 375px phone,
             and the rounded היום cards met the edge with their corners. */
          .app-main{padding:12px 12px calc(74px + 62px + env(safe-area-inset-bottom, 0px))!important}
          /* Phase 4 — tap targets: round icon buttons up to a touch-friendly ~40px. */
          .icon-btn{width:44px!important;height:44px!important;font-size:15px!important}
          /* Floating buttons must clear the bottom bar, which only exists below
             this breakpoint. Both are position:fixed with a small bottom offset
             and a z-index far above the nav's 900, so at bottom:14 and bottom:22
             they sat ON TOP of it and clipped the nav items underneath.
             74px is the same bar height .app-main reserves above, plus the same
             home-indicator inset the bar itself pads with, plus a gap. */
          .fab-help{bottom:calc(74px + env(safe-area-inset-bottom, 0px) + 14px)!important}
          .fab-voice{bottom:calc(74px + env(safe-area-inset-bottom, 0px) + 14px)!important}
          .fab-help{font-size:0!important;gap:0!important;padding:6px!important;width:44px;height:44px;justify-content:center}
          .fab-voice{width:44px!important;height:44px!important}
          /* The two floating buttons sit over the content's lower edge; .app-main reserves 62px more at the bottom
             (above) so the last card, row or button can always be scrolled clear of them. */
          .wa-btn,.call-btn{padding:9px 14px!important;min-height:44px!important}
          /* Header fit — the desktop logo (30px, 6px letter-spacing, no shrink) pushed
             the left-side action icons off the viewport in RTL. Shrink the wordmark,
             hide the tagline, let the brand block shrink, and tighten header padding so
             the power/download/settings icons stay fully on-screen. */
          /* Header fit, done as arithmetic rather than by eye. Budget at 360px:
               padding 16 + brand 158 + gap 6 + search 64 + gap 6 + icons 86
               = 336, with the brand being hamburger 40 + gap 6 + logo 104 + 8.
             The old numbers came to 485 against a 390px iPhone, which is why the
             action icons ran off the left edge in RTL and the logo appeared to
             sit on top of the search field. Two of the four icons now live in
             the nav drawer instead, which is most of the saving. */
          /* Zero side padding here too, so the header's contents reach the same
             edges as the content below it and the bar above the home button.
             It also hands 16px back to the width budget below. The first and
             last children are 40px icon buttons, so running them to the edge
             makes them easier to hit, not harder. */
          /* One short row: hamburger, large logo, two icons. The search is gone
             from the header entirely on phones and lives in the nav drawer - it
             was competing with the logo for width when inline, and cost ~30px of
             permanent height when it took its own row.

             padding-top carries env(safe-area-inset-top) so that in a home-screen
             (standalone) install the header starts below the clock and battery
             instead of underneath them, which is what was letting the greeting
             card sit against the status bar.

             Budget at 360px: hamburger 40 + gap 6 + logo 168 + gap 6 + two
             icons 86 = 306, leaving room for the leads badge. */
          .app-header{padding:0 0 0 0!important;padding-top:env(safe-area-inset-top, 0px)!important;gap:6px!important;height:auto!important;min-height:56px!important;flex-wrap:nowrap!important}
          .hdr-brand{gap:6px!important}
          .header-search{display:none!important}

          /* ── 16px fields: the actual fix for Safari's zoom ─────────────────
             iOS zooms the page in when a focused input is under 16px, and does
             not zoom back out on blur. Every one of the 115 fields in this app
             was between 9px and 13px, so tapping any of them left the layout
             zoomed and overflowing - which is what "the app is too wide in
             Safari" was, all along.

             The alternative was maximum-scale=1 in the viewport, which
             suppresses the symptom by disabling pinch-zoom for everyone, all
             day, in a business app read at arm's length. Fixing the cause costs
             a few pixels of density on a phone; fixing the symptom costs the
             accessibility escape hatch permanently.

             !important because the sizes are inline styles, and one rule rather
             than 115 edits because a rule cannot miss a field.

             Mobile only: the zoom is an iOS behaviour, and 11-12px on desktop
             is a deliberate density choice with no problem to solve. */
          /* iOS ONLY. Chrome on Android does not zoom on focus at any font
             size, so on Android this rule was enlarging every field to solve a
             problem that platform does not have - a density change for half the
             users for nothing.

             @supports (-webkit-touch-callout: none) is the standard gate for
             this: the property is implemented in WebKit and not in Blink, so it
             is true on iOS Safari (and every iOS browser, which are all WebKit)
             and false in Chrome on Android. If Blink ever ships it, Android
             quietly gets larger fields back - untidy, not harmful. */
          @supports (-webkit-touch-callout: none) {
            input,textarea,select{font-size:16px!important}
            /* Inside the same gate: this width exists purely to give the 16px
               text room. On Android the fields stay at 11-12px, so widening
               them would be the same unnecessary density change. */
            input[type="number"]{min-width:62px!important}
          }

          /* Narrow numeric fields need the BOX widened too, not just the text.
             Service duration is 44px wide with 6px of side padding - about 32px
             of room, which at 16px is three digits. "120" only just fits and
             anything longer clips. A silently clipped duration or price is the
             worst kind of wrong: it looks like a number, so she would never
             think to check it.
             These sit in flex rows next to a name field that already carries
             minWidth:0, so the row absorbs the extra width by truncating the
             name, which truncates visibly. */
          /* The header's backdrop-filter creates a stacking context that (being
             earlier in the DOM than <main>) trapped the global-search results
             dropdown BEHIND the page content on mobile. Lift the whole header
             context above the content — but keep it below modals/drawers/toasts
             (>=1000) so those still overlay the header as before. */
          .app-header{position:relative!important;z-index:100!important}
          /* overflow stays visible: the logo's petals reach the edge of the
             artwork and must never be cropped by this container. */
          /* flex-shrink 0, not 1. Letting the brand block shrink was the actual
             clipping mechanism: the block narrowed, the img inside it did not
             (fixed width, flex-shrink:0), and overflow:visible let the artwork
             spill under the next sibling instead of pushing it aside. Nothing
             shares its row now, so it has no reason to shrink. */
          .hdr-brand{min-width:auto!important;flex-shrink:0!important;overflow:visible}
          /* Width-driven, matching /login: overriding height here would fight
             the aspect ratio the artwork sets. */
          .hdr-logo{width:132px!important;margin-inline-end:0!important}
          /* Dashboard hero — desktop's 26px side padding was far too wide on a
             ~344px screen. Only the box is adjusted here: the greeting's own
             size and leading are a clamp() on the element, so there is one
             source of truth rather than a rule here fighting an inline style.
             !important because the card carries padding/margin inline. */
          .hero-card{margin-bottom:26px!important;padding:16px 16px!important}

          /* Card padding. Ten tabs (leads, cashier, tax, marketing, insights,
             advisor, community, packages, protocols, whatsapp) had no mobile
             rules at all, so their cards kept desktop's 24-26px inset. With
             .app-main's 8px gutter that spent up to 68px of a 344px screen on
             padding alone. .glass-card carries no padding of its own - it is
             always inline - so this is the only place one rule can reach all of
             them, and it needs !important to outrank those inline values.

             .card-flush is the opt-out for the six cards whose children already
             supply their own padding (the calendar grid, the tax table, and
             four list cards). Padding them here would double the inset and, for
             the two scrolling ones, inset the scroll area itself. It MUST stay
             below the rule above: same specificity, both !important, so source
             order decides. */
          .glass-card{padding:19px 16px!important}
          .card-flush{padding:0!important}

          /* .card-boxed: opt-out of the full-bleed/glass treatment just below,
             for target-today.html's cards specifically (היום tab only - hero,
             question, setup-checklist, today, needs-attention, next-client,
             closing-list). That mockup is itself a 430px mobile view calling
             for a 19px-radius card with its own shadow, which is the opposite
             of full-bleed - so these two rules can't both win on the same
             element. Two classes beats one rule's specificity regardless of
             source order, so this sits anywhere relative to the rules below
             and still wins; .glass-card elsewhere (cashier, leads, settings,
             ...) is untouched.
             Translucent, not solid #fff: the petal-pink page background
             should read through the cards, so this is the SAME rule as the
             non-media .glass-card.card-boxed above - repeated here, with
             !important, only because it still has to beat the full-bleed
             rule's own !important a few lines down at this width. */
          .glass-card.card-boxed{border-radius:19px!important;border:1px solid rgba(255,255,255,0.7)!important;
            background:rgba(255,255,255,0.62)!important;-webkit-backdrop-filter:blur(14px) saturate(1.1)!important;
            backdrop-filter:blur(14px) saturate(1.1)!important;
            box-shadow:0 1px 2px rgba(31,58,48,.03),0 8px 24px rgba(31,58,48,.05)!important}
          /* The question card's own rose hairline (its only card with a border)
             needs one more class: inline style's border is itself overridden by
             the full-bleed rule's border-left/border-right:0 above, and
             .card-boxed just set border:none outright - three classes beats
             both at equal !important. */
          .glass-card.card-boxed.card-boxed-rose{border:1px solid rgba(233,169,161,.65)!important}
          /* Same problem, for the two cards with a one-side accent border
             instead of a hairline: the base rule's border-right:0 (this is
             RTL, so border-inline-start physically IS border-right) already
             wins over .card-boxed's border:none at equal specificity, so this
             needs the one-louder third class too. */
          .glass-card.card-boxed.card-boxed-accent{border-inline-start:3px solid ${pc}!important}

          /* Full bleed. Once the gutters are gone a card that keeps its rounded
             corners and side borders still reads as a framed panel floating on a
             page - the exact "website in a frame" look this is meant to remove.
             Squaring the corners and dropping the left/right borders turns each
             card into a full-width section, which is the native pattern. The top
             and bottom borders stay, because they are what still separates one
             section from the next.
             .sheet is a different class and keeps its radius: a
             centred sheet should still look like a sheet. */
          /* With the gutter back, a card is a card again: rounded, framed (was: squared and borderless for full bleed). */
          .glass-card,.hero-card{border-radius:16px!important}

          /* ── Richness. The wash and the blossoms were already identical to
             /login - BRAND_WASH, same two-hue florals, opacity 1 on the sparse
             tabs against /login's 0.9. The problem was that --surface is
             #FFFFFF, fully opaque, and going edge to edge turned every card
             into a full-bleed white panel that buried the artwork completely.
             Making the cards glass is what brings /login's world back: the
             ombré and the flowers now read THROUGH the content instead of
             behind it. Desktop keeps solid cards, where the wash is visible
             around them anyway.

             0.62 alpha with a blur is the readability line: ink on
             near-white over a pale cream-to-lavender wash still clears AA
             comfortably, and the blur stops the blossoms turning body text
             into texture. */
          .glass-card{background:rgba(255,255,255,0.62)!important;
                      -webkit-backdrop-filter:blur(14px) saturate(1.25);
                      backdrop-filter:blur(14px) saturate(1.25)}
          /* The hero keeps its own gradient - washing it out would flatten the
             one surface that already reads rich - but it lets a little through. */
          .hero-card{background:linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.14)),var(--grad-hero)!important}

          /* Tinted glass chrome, following HER accent rather than a hardcoded
             purple, so the header sits in the same world as the wash instead of
             capping it with a flat bar. */
          .app-header{background:linear-gradient(180deg,
                        color-mix(in srgb, var(--pc) 13%, rgba(255,255,255,0.74)),
                        color-mix(in srgb, var(--pc) 5%,  rgba(255,255,255,0.52)))!important;
                      -webkit-backdrop-filter:blur(16px) saturate(1.2);
                      backdrop-filter:blur(16px) saturate(1.2)}

          /* Gentle sheen on the flat chips, so they catch light like the rest of
             the surface. background-image only - the base colour each pill sets
             inline is left alone, which keeps the categorical status colours. */
          .pill{background-image:linear-gradient(180deg,rgba(255,255,255,0.38),rgba(255,255,255,0))}

          /* Same tinted glass as the header, so the two bars bracket the page in
             one material instead of one being glass and the other flat paint.
             The inline rgba(252,250,254,0.94) it replaces was near-opaque. */
          .app-bottombar{background:linear-gradient(180deg,
                           color-mix(in srgb, var(--pc) 6%,  rgba(255,255,255,0.60)),
                           color-mix(in srgb, var(--pc) 13%, rgba(255,255,255,0.78)))!important;
                         -webkit-backdrop-filter:blur(18px) saturate(1.2);
                         backdrop-filter:blur(18px) saturate(1.2)}

          /* Air above the first card. The per-card padding lives with the
             .card-flush opt-out further up and must stay there: declaring
             .glass-card padding again below .card-flush would win on source
             order and re-pad the six cards that must stay flush. */
          .app-main{padding-top:16px!important}
        }
        /* Small phones (SE, older Androids). Same budget as above but 316px:
           the logo gives up another 20px so nothing spills at 320. */
        @media (max-width:360px){
          .hdr-logo{width:118px!important}
        }
        @media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:fixed;top:0;left:0;width:100%;padding:40px}
          /* Tax report: print only the report card, clean A4, centered. */
          #tax-report,#tax-report *{visibility:visible}
          #tax-report{position:fixed;top:0;left:0;right:0;margin:0 auto;width:100%;max-width:720px;box-shadow:none!important;border:none!important;padding:32px 28px}}
      `}</style>/* @screen-end */
  );
}
