// lib/branding.js
// ONE shared, tenant-scoped branding source for the PUBLIC customer experiences
// (skin scanner, results, booking).
//
// SECURITY: the public fetch selects ONLY an explicit allowlist of non-sensitive
// columns — it must NEVER read secrets (green_api_*, automations, bot_*, faq,
// tax, internal config). No `select('*')` on the public side. (Root-cause note:
// the settings RLS currently lets anon read the whole row; narrowing the query
// removes OUR exposure, and a DB-side RLS/RPC fix is proposed separately.)
//
// resolveBranding() applies safe FALLBACKS + CONTRAST VALIDATION so a clinic's
// chosen colors can never make text unreadable or break the UI.

// BloomOS neutral defaults (used for missing/invalid tenant, missing branding,
// or a clinic color that fails the contrast check).
const DEFAULT_PRIMARY = "#8E5A7C";
const DEFAULT_DEEP = "#5B3E67";
const DEFAULT_SECONDARY = "#C98BA6";
const DEFAULT_CTA = "קביעת תור";

// Allowlist of EXISTING, non-sensitive columns safe for anonymous access.
// (The additive `branding` jsonb is intentionally NOT selected until the migration
// is approved+applied — resolveBranding reads it defensively when present.)
const PUBLIC_BRANDING_COLUMNS =
  "business_name, primary_color, business_phone, instagram_business_account, cta_label, cover_title";
// /book additionally needs these NON-SECRET scheduling fields to compute slots:
const BOOK_SETTINGS_COLUMNS =
  "business_name, primary_color, cta_label, business_phone, instagram_business_account, cover_title, business_hours, working_hours_start, working_hours_end, working_days";

// --- color safety (WCAG relative luminance) ---
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrastRatio(h1, h2) {
  const l1 = luminance(h1), l2 = luminance(h2);
  if (l1 == null || l2 == null) return 0;
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
// Readable text color (white or dark ink) for a given background.
function readableTextOn(bg) {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#2A2233") ? "#FFFFFF" : "#2A2233";
}
// Safe as a PRIMARY button color on a light page? Reject too-light / near-white
// (unreadable white text, invisible on light bg) and malformed values.
function isSafePrimary(hex) {
  const l = luminance(hex);
  if (l == null) return false;
  return contrastRatio(hex, "#FFFFFF") >= 2.4 && l <= 0.62;
}
function normHex(hex, fallback) {
  const h = String(hex || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h : fallback;
}
function darken(hex, f = 0.68) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return "#" + rgb.map((v) => Math.round(v * f).toString(16).padStart(2, "0")).join("");
}

/**
 * Build a safe, normalized branding object from a settings row (existing columns
 * now; the additive `branding` jsonb is read defensively when present later).
 * Never returns broken images, empty required colors, or unreadable combinations.
 */
export function resolveBranding(row) {
  const b = row && row.branding && typeof row.branding === "object" ? row.branding : {};
  let primary = normHex(row?.primary_color, DEFAULT_PRIMARY);
  if (!isSafePrimary(primary)) primary = DEFAULT_PRIMARY; // unsafe clinic color -> safe default
  let secondary = normHex(b.secondary_color, DEFAULT_SECONDARY);
  if (luminance(secondary) == null) secondary = DEFAULT_SECONDARY;
  return {
    businessName: (row?.business_name || "").toString().trim(),
    primary,
    deep: darken(primary),
    secondary,
    onPrimary: readableTextOn(primary), // readable text on the primary button
    ctaLabel: ((row?.cta_label || b.booking_cta_label || "").toString().trim()) || DEFAULT_CTA,
    whatsapp: (row?.business_phone || b.public_whatsapp_number || "").toString().trim(),
    instagram: (row?.instagram_business_account || b.instagram_url || "").toString().trim(),
    logoUrl: (b.logo_url || "").toString().trim(),
    welcomeHeadline: (b.welcome_headline || row?.cover_title || "").toString().trim(),
    welcomeMessage: (b.welcome_message || "").toString().trim(),
    address: (b.public_address || b.address || "").toString().trim(),
    heroImageUrl: (b.hero_image_url || "").toString().trim(),
    hasBranding: !!row,
  };
}

/**
 * Public branding fetch — allowlist columns ONLY, strictly tenant-scoped, never
 * secrets. Missing/invalid tenant or any error -> neutral BloomOS defaults (never
 * another clinic's data).
 */
export async function fetchPublicBranding(supabase, tenantId) {
  if (!tenantId) return resolveBranding(null);
  try {
    const { data, error } = await supabase
      .from("settings")
      .select(PUBLIC_BRANDING_COLUMNS)
      .eq("tenant_id", tenantId)
      .limit(1);
    if (error || !data || !data[0]) return resolveBranding(null);
    return resolveBranding(data[0]);
  } catch {
    return resolveBranding(null);
  }
}

export { PUBLIC_BRANDING_COLUMNS, BOOK_SETTINGS_COLUMNS, readableTextOn, contrastRatio, isSafePrimary, DEFAULT_PRIMARY, DEFAULT_DEEP };
