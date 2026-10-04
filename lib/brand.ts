// lib/brand.ts
// Kalmea brand surface, in one place.
//
// The tokens themselves live in app/globals.css; these are the strings pages
// use in inline styles, so no page has to remember the fallback hex. Before
// this existed, /login, /signup and /reset-password each declared their own
// identical copy - three chances to drift.
//
// BRAND vs ACCENT, the rule that decides which set to use:
//   --brand-*  Kalmea identity. FIXED. Logo, pre-auth pages, marketing.
//   --pc-*     Tenant accent. SWITCHABLE from settings.primary_color.
// If a client reads it as HER business it is --pc-*; if they read it as
// Kalmea it is --brand-*.

// ---- Brand tier (fixed) ----
// Ad-aligned pass: exact values sampled from the published ads (brand/ads/).
// --accent/--deep is TEXT, BUTTONS, PILLS AND SMALL MARKS ONLY, never a
// large background — the ads have one dark layout and the app gets none of
// it. --cream is the page background everywhere; --surface (white) is cards
// only. See app/globals.css's :root for the full comment.
export const ACCENT = 'var(--brand-accent, #183024)'
export const DEEP = 'var(--brand-deep, #183024)'
export const ROSE = 'var(--brand-rose, #F0CCC6)'
export const LILAC = 'var(--brand-lilac, #DCE4D5)'
export const CREAM = 'var(--brand-cream, #F0EADE)'
export const TINT = 'var(--brand-tint, #F0DDD3)'
export const SURFACE = 'var(--brand-surface, #FFFFFF)'
export const MUTED = 'var(--brand-muted, #656A56)'
export const CONTRAST = 'var(--brand-contrast, #FFFFFF)'
export const GRAD = 'var(--brand-grad, linear-gradient(135deg, #183024 0%, #F0CCC6 100%))'

// Rose — "the one word that matters in a heading", and handwriting accents.
// HIGHLIGHT is pixel-sampled from "פחות דברים לזכור" in ad-checklist.png,
// large/bold text only (3.6:1 on cream). HIGHLIGHT_TEXT is the same hue
// darkened to clear AA body contrast (4.5:1+).
export const HIGHLIGHT = 'var(--brand-highlight, #B26557)'
export const HIGHLIGHT_TEXT = 'var(--brand-highlight-text, #9D5548)'

// Sage — secondary marks and chips. A different, more saturated tone than
// LILAC's pale decorative wash above, not a replacement of it. SAGE is
// pixel-sampled from ad-checklist.png's icon-chip circles (large text /
// icon-scale only, 3.3:1 on cream); SAGE_TEXT is darkened to clear AA body
// contrast (4.5:1+).
export const SAGE = 'var(--brand-sage, #7C846B)'
export const SAGE_TEXT = 'var(--brand-sage-text, #666C58)'

// Thin gold hairline around the ad's green pill button, averaged from the
// hairline ring in ad-nails.png. Only that ad's button actually has it —
// ad-free-month.png and ad-checklist.png's buttons are plain solid green —
// so this is a real but occasional detail, not on every pill in the ads.
export const GOLD_HAIRLINE = 'var(--brand-gold-hairline, #C2A06B)'

// Ad headlines: Frank Ruhl Libre 900, bigger and tighter than the normal
// heading voice. Opt-in (.brand-headline in globals.css) for moment screens
// only — the normal --display stack is untouched everywhere else.
export const DISPLAY_HEAVY = 'var(--display-heavy)'

// ---- Accent tier (switchable per tenant) ----
// Use these on anything a client reads as HER business. Fallbacks match
// lib/theme.ts's DEFAULT_ACCENT (Kalmea's petal pink) - a brand-new tenant's
// product default, not a choice she's made, same relationship the old
// BloomOS-purple fallback had to the old default.
export const PC = 'var(--pc, #E9A9A1)'
export const PC_DEEP = 'var(--pc-deep, #C48E87)'
export const PC_TINT = 'var(--pc-tint, #FDF6F6)'
export const PC_SOFT = 'var(--pc-soft, rgba(233,169,161,0.10))'
export const PC_GRAD = 'var(--pc-grad, linear-gradient(135deg, #EEBCB6 0%, #C48E87 100%))'
// Readable text ON the accent, derived from its luminance in lib/theme.ts.
// Petal pink is pale, so its real contrastOn() result is --ink, not white.
export const PC_CONTRAST = 'var(--pc-contrast, #2A2233)'

// ---- Alpha shades ----
// Written literally: inline styles cannot take the alpha channel of a var().
// Derived from --brand-accent #1F3A30 and --brand-deep #14261F.
export const ACCENT_LINE = 'rgba(31,58,48,0.14)'
export const ACCENT_LINE_2 = 'rgba(31,58,48,0.18)'
export const ACCENT_RING = 'rgba(31,58,48,0.16)'
export const DEEP_SHADOW = 'rgba(20,38,31,0.22)'

// The rose used specifically for the hairline-flower-hairline divider
// treatment (botanical interface pass) - a named color of its own rather
// than reusing --brand-rose/petal pink, since it was specified separately.
export const ROSE_DIVIDER = '#C07A72'

// ---- Floral tints ----
// Passed to FloralCorners so its blossoms match the new logo's palette.
export const FLORAL_BLUSH = '#E9A9A1'
export const FLORAL_LILAC = '#DCE4D5'

// ---- Logo assets ----
// One image, every lockup: the flower + "kalmea" wordmark, transparent, for
// light backgrounds. Kalmea's set has no separate tagline/no-tagline pair the
// old BloomOS lockup had, so FULL and COMPACT are the same file - two names
// kept because call sites render them at different fixed widths (the header
// at 196px, /login and friends at their own layout width) and distinguishing
// "the hero lockup" from "the nav lockup" in the code is still worth it even
// though the asset itself is shared.
export const LOGO_FULL = '/kalmea-wordmark.png'
export const LOGO_FULL_W = 600
export const LOGO_FULL_H = 176
export const LOGO_COMPACT = '/kalmea-wordmark.png'
// Just the "kalmea" lettering, cropped from LOGO_COMPACT (sharp .extract at
// x=505, where the flower provably ends - checked pixel by pixel so the crop
// never bleeds a sliver of petal, then .trim() for the tightest box; 965x430).
// For the mobile header's compact lockup: the flower mark beside this, not
// the flower alone - a screen should always say what she's using, and not
// the full-width lockup either, which doesn't fit next to the menu button,
// search box and badges below 680px.
export const LOGO_TEXT = '/kalmea-wordmark-text.png'
export const LOGO_TEXT_W = 480
export const LOGO_TEXT_H = 214

// ---- Flower marks ----
// Solid silhouette, one flat color, transparent ground: small decorative
// marks where an icon is needed but a photographic flower would be too much
// detail at 14-24px (the hairline rule on /login, a "powered by" glyph, a
// page-level ✦ with no real tenant to color it). Pink by default - the
// flower's own color in the full wordmark - with green/white siblings for
// whichever background it lands on.
export const FLOWER_MARK = '/flower-pink-solid.png'
export const FLOWER_MARK_GREEN = '/flower-green-solid.png'
export const FLOWER_MARK_WHITE = '/flower-white-solid.png'

// Full-color, full-detail renders of the same flower, at the size that
// actually ships - not one 1235x1233 source scaled down by the browser
// everywhere it's used. 64/128 didn't exist in brand/ despite being asked
// for by name; generated from flower-full.png (sharp, resize+contain) since
// they're pure downsamples of an asset already in hand, not new artwork.
//   64   - a mark under ~30px (header, dividers)
//   128  - a mark/watermark around 70-150px (the "one question" card hint,
//          EmptyState's icon-less flower)
//   256  - a corner watermark around 150-260px (ChromeFlowerBg)
//   full - reserved for anything genuinely large (not currently used -
//          everything real so far fits in 256 or under)
export const FLOWER_64 = '/flower-64.png'
export const FLOWER_128 = '/flower-128.png'
export const FLOWER_256 = '/flower-256.png'
export const FLOWER_FULL = '/flower-full.png'
// Same image as FLOWER_256 (the 1.3MB 1235px original was drawn at 140-220px), kept as its own export
// because it's what Stage 3 already shipped under this name - swap call
// sites to the sized exports above as they're touched, rather than one
// mass rename.
export const FLOWER_WATERMARK = '/flower-256.png'

// ---- Wide banner ----
// Full lockup + slogan + "ניהול · שיווק · מכירות" + domain, on its own cream
// background (opaque, not transparent - it's a complete header strip, not an
// overlay). 1120x414 (2026-10-04: downsampled from 1568x580, drawn at <=280px), flowers dense on both thirds. Kept for anywhere with
// real width to give it (desktop, wherever it's embedded unscaled).
export const BANNER_WIDE = '/banner-wide.jpg'
export const BANNER_WIDE_W = 1120
export const BANNER_WIDE_H = 414
// Center crop of the above (scripts/crop-banner-header.mjs) - wordmark +
// slogan only, 800x448 (was 1035x580, same crop). The phone-width version: at full width on a
// ~380-400px auth card, the full banner's slogan/domain text shrank past
// comfortable reading and the side flower clusters doubled up with
// PhotoFlowerCorners on the same screens. This is THE login/signup/
// onboarding header.
export const BANNER_HEADER = '/banner-header.jpg'
export const BANNER_HEADER_W = 800
export const BANNER_HEADER_H = 448

// ---- Line icons ----
// Deep green outline + a small pink cosmos attached, 160x160 transparent
// PNGs (brand/icons/, copied to public/brand-icons/). The first five
// (flower/calendar/microphone/question/heart/play) shipped once already as
// crops from a 3x2 grid (brand/icons-set.png, scripts/crop-brand-icons.mjs)
// - THIS set replaced those files in place with cleaner standalone exports
// at the same paths, so no call site needed to change. RASTER, not SVG -
// fine strokes and a small flower that turn to mush below ~28px, so these
// are for section headers and empty states ONLY: never the bottom nav, an
// inline button, or a list row (EMPTY_ICONS' stroked-SVG set stays for all
// of that). Each one also counts as a flower appearance for the
// "never more than two per screen" rule.
//   flower      general empty state, trial banner, success confirmations,
//               anywhere with no more specific meaning
//   calendar    calendar tab header, an empty day, the waitlist
//   microphone  the voice screen and its empty state
//   question    help sheet, "תקועה?", the FAQ, the "שאלה אחת" card
//   heart       reviews, the client club
//   play        reels and video
//   wallet      cashier and payments
//   person      the empty clients screen
//   envelope    leads and messages
//   frame       content and templates
//   sparkle     anywhere the AI generates something
export const ICON_FLOWER = '/brand-icons/icon-flower.png'
export const ICON_CALENDAR = '/brand-icons/icon-calendar.png'
export const ICON_MICROPHONE = '/brand-icons/icon-microphone.png'
export const ICON_QUESTION = '/brand-icons/icon-question.png'
export const ICON_HEART = '/brand-icons/icon-heart.png'
export const ICON_PLAY = '/brand-icons/icon-play.png'
export const ICON_WALLET = '/brand-icons/icon-wallet.png'
export const ICON_PERSON = '/brand-icons/icon-person.png'
export const ICON_ENVELOPE = '/brand-icons/icon-envelope.png'
export const ICON_FRAME = '/brand-icons/icon-frame.png'
export const ICON_SPARKLE = '/brand-icons/icon-sparkle.png'

// The page wash used on every branded screen. A true ombré: paper at the top,
// warming through a pale-petal mid-tone, settling into the pale-petal edge.
// Identical everywhere, so screens never drift to a paler or flatter version
// of each other.
const BLUSH_WASH = 'var(--brand-blush, #FBEDE9)'
export const BRAND_WASH =
  `radial-gradient(130% 100% at 50% 18%, ${CREAM} 0%, ${CREAM} 26%, ` +
  `color-mix(in srgb, ${BLUSH_WASH} 38%, ${CREAM}) 58%, ${TINT} 100%)`

// Softer, flatter variant for data-heavy screens where a strong halo behind
// tables and the calendar grid would fight the content.
export const BRAND_WASH_SOFT =
  `linear-gradient(180deg, ${CREAM} 0%, ${TINT} 100%)`
