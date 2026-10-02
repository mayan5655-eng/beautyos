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
export const ACCENT = 'var(--brand-accent, #1F3A30)'
export const DEEP = 'var(--brand-deep, #14261F)'
export const ROSE = 'var(--brand-rose, #E9A9A1)'
export const LILAC = 'var(--brand-lilac, #DCE4D5)'
export const CREAM = 'var(--brand-cream, #FDFBF9)'
export const TINT = 'var(--brand-tint, #FBEDE9)'
export const SURFACE = 'var(--brand-surface, #FDFBF9)'
export const MUTED = 'var(--brand-muted, #7D8D87)'
export const CONTRAST = 'var(--brand-contrast, #FFFFFF)'
export const GRAD = 'var(--brand-grad, linear-gradient(135deg, #1F3A30 0%, #E9A9A1 100%))'

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
export const LOGO_FULL_W = 1470
export const LOGO_FULL_H = 430
export const LOGO_COMPACT = '/kalmea-wordmark.png'

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
