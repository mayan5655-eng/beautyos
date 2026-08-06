// lib/brand.ts
// BloomOS brand surface, in one place.
//
// The tokens themselves live in app/globals.css; these are the strings pages
// use in inline styles, so no page has to remember the fallback hex. Before
// this existed, /login, /signup and /reset-password each declared their own
// identical copy - three chances to drift.
//
// BRAND vs ACCENT, the rule that decides which set to use:
//   --brand-*  BloomOS identity. FIXED. Logo, pre-auth pages, marketing.
//   --pc-*     Tenant accent. SWITCHABLE from settings.primary_color.
// If a client reads it as HER business it is --pc-*; if they read it as
// BloomOS it is --brand-*.

// ---- Brand tier (fixed) ----
export const ACCENT = 'var(--brand-accent, #4A2E5A)'
export const DEEP = 'var(--brand-deep, #301848)'
export const ROSE = 'var(--brand-rose, #D28697)'
export const LILAC = 'var(--brand-lilac, #BB84A7)'
export const CREAM = 'var(--brand-cream, #FEFAF7)'
export const TINT = 'var(--brand-tint, #EDE4F5)'
export const SURFACE = 'var(--brand-surface, #FAF6FC)'
export const MUTED = 'var(--brand-muted, #98879B)'
export const CONTRAST = 'var(--brand-contrast, #FFFFFF)'
export const GRAD = 'var(--brand-grad, linear-gradient(135deg, #4A2E5A 0%, #D28697 100%))'

// ---- Accent tier (switchable per tenant) ----
// Use these on anything a client reads as HER business.
export const PC = 'var(--pc, #4A2E5A)'
export const PC_DEEP = 'var(--pc-deep, #3E2749)'
export const PC_TINT = 'var(--pc-tint, #EDE7F0)'
export const PC_SOFT = 'var(--pc-soft, rgba(74,46,90,0.10))'
export const PC_GRAD = 'var(--pc-grad, linear-gradient(135deg, #6B5279 0%, #3E2749 100%))'
// Readable text ON the accent, derived from its luminance in lib/theme.ts.
export const PC_CONTRAST = 'var(--pc-contrast, #FFFFFF)'

// ---- Alpha shades ----
// Written literally: inline styles cannot take the alpha channel of a var().
// Derived from --brand-accent #4A2E5A and --brand-deep #301848.
export const ACCENT_LINE = 'rgba(74,46,90,0.14)'
export const ACCENT_LINE_2 = 'rgba(74,46,90,0.18)'
export const ACCENT_RING = 'rgba(74,46,90,0.16)'
export const DEEP_SHADOW = 'rgba(48,24,72,0.22)'

// ---- Floral tints ----
// Passed to FloralCorners so its blossoms match the logo's watercolor.
export const FLORAL_BLUSH = '#FADDCF'
export const FLORAL_LILAC = '#BB84A7'

// ---- Logo assets ----
// Full lockup: florals + wordmark + tagline. For centred brand moments.
export const LOGO_FULL = '/bloomos-logo-full.png'
export const LOGO_FULL_W = 760
export const LOGO_FULL_H = 394
// Compact lockup: florals + wordmark, no tagline. For the nav sidebar.
export const LOGO_COMPACT = '/bloomos-logo-compact.png'

// The page wash used on every branded screen: cream lifting to a lavender
// halo. Identical everywhere, so screens never drift to a "lighter version".
export const BRAND_WASH =
  `radial-gradient(120% 90% at 50% 22%, ${CREAM} 0%, ${CREAM} 38%, ${TINT} 100%)`

// Softer, flatter variant for data-heavy screens where a strong halo behind
// tables and the calendar grid would fight the content.
export const BRAND_WASH_SOFT =
  `linear-gradient(180deg, ${CREAM} 0%, ${TINT} 100%)`
