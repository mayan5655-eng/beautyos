// lib/design/mapBranding.ts
//
// Her branding onto a template's roles, with a fallback for everything.
// A template never contains a colour, a name or a picture; this is where
// they come from. Same inputs the rest of the app already has - the
// settings row, the branding jsonb - plus whatever she typed for this
// design and whatever pictures she picked.
//
// Fallback rules, the ones the gallery preview relies on:
//   - no logo            -> the logo layer draws her business name (or nothing)
//   - no picture in slot -> the image layer draws a plate in her blush
//   - light accent       -> text on it goes dark (contrastOn), as everywhere
//   - empty variable     -> its source, then its default, then ''

import { buildAccentTokens, contrastOn, hexToRgb } from '../theme.ts';
import type { ColorRole, Template, VariableDef } from './contract.ts';

export type BrandingInput = {
  settings?: { business_name?: string | null; therapist_name?: string | null; business_phone?: string | null; primary_color?: string | null; branding?: unknown } | null;
  /** Values she typed for this design; win over sources and defaults. */
  inputs?: Record<string, string> | null;
  /** Pictures she picked, by slot key (public or signed URL). */
  images?: Record<string, string | null> | null;
  /** Which saved review to use, when the template has one. */
  reviewIndex?: number;
  /** Where her booking page lives, for booking_url. */
  bookingUrl?: string | null;
};

export type Fill = {
  values: Record<string, string>;
  images: Record<string, string | null>;
  colors: Record<ColorRole, string>;
  fonts: { display: string; body: string; accent: string };
  logoUrl: string | null;
  /** Variable keys and slot keys that are required and still empty. */
  missing: string[];
};

export const FONTS = {
  display: "var(--font-frank), 'Frank Ruhl Libre', serif",
  body: "var(--font-assistant), 'Assistant', sans-serif",
  accent: "var(--font-heebo), 'Heebo', sans-serif",
};

const DEFAULT_ACCENT = '#5B3E67';
const INK = '#2A2233';
const MUTED = '#7C6F68';
// The studio look never sits on white: a warm cream, a blush of her hue on
// it, and a warm neutral. Each takes a little of her accent so a gold brand
// gets honey-cream and a plum brand gets rose-cream.
const CREAM = '#FAF6F0';
const NEUTRAL = '#EDE5DA';

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
/** a mixed toward b by t (0..1), as hex. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return '#' + hex2(x.r + (y.r - x.r) * t) + hex2(x.g + (y.g - x.g) * t) + hex2(x.b + (y.b - x.b) * t);
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
/** "@handle" from whatever she typed: a handle, an @handle or a full instagram.com link. */
export const instagramHandle = (v: unknown): string => {
  const s = clean(v).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? '@' + s : '';
};
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

/** Every colour role from one accent (and an optional secondary). */
export function colorsFor(primary?: string | null, secondary?: string | null): Record<ColorRole, string> {
  const pc = isHex(primary) ? primary.trim() : DEFAULT_ACCENT;
  const t = buildAccentTokens(pc);
  return {
    primary: t['--pc'],
    deep: t['--pc-deep'],
    tint: t['--pc-tint'],
    contrast: contrastOn(pc),
    secondary: isHex(secondary) ? secondary.trim() : t['--pc-2'],
    ink: INK,
    surface: mix(CREAM, pc, 0.05),
    muted: MUTED,
    blush: mix(CREAM, pc, 0.16),
    sand: mix(NEUTRAL, pc, 0.08),
  };
}

const stars = (rating: unknown): string => {
  const n = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

function sourceValue(v: VariableDef, input: BrandingInput, branding: Record<string, unknown>): string {
  const s = input.settings || {};
  const reviews = Array.isArray(branding.reviews) ? (branding.reviews as Record<string, unknown>[]) : [];
  const review = reviews[input.reviewIndex ?? 0] || null;
  switch (v.source) {
    case 'business_name': return clean(s.business_name);
    case 'therapist_name': return clean(s.therapist_name);
    case 'therapist_title': return clean(branding.therapist_title);
    case 'booking_url': return clean(input.bookingUrl);
    case 'phone': return clean(s.business_phone);
    case 'instagram': return instagramHandle(branding.instagram);
    // The strip at the bottom of every design: phone and handle, whichever she has.
    case 'contact': return [clean(s.business_phone), instagramHandle(branding.instagram)].filter(Boolean).join('   ·   ');
    case 'review_text': return review ? clean(review.text) : '';
    case 'review_name': return review ? clean(review.name) : '';
    case 'review_rating': return review ? stars(review.rating) : '';
    case 'static':
    case 'user':
    default: return '';
  }
}

export function fillTemplate(template: Template, input: BrandingInput): Fill {
  const s = input.settings || {};
  const branding = (s.branding && typeof s.branding === 'object' ? s.branding : {}) as Record<string, unknown>;
  const colors = colorsFor(s.primary_color, typeof branding.secondary_color === 'string' ? branding.secondary_color : null);
  const missing: string[] = [];

  const values: Record<string, string> = {};
  for (const v of template.variables) {
    const typed = clean(input.inputs?.[v.key]);
    let val = typed || sourceValue(v, input, branding) || clean(v.default);
    if (v.maxLength && val.length > v.maxLength) val = val.slice(0, v.maxLength).trim();
    values[v.key] = val;
    if (v.required && !val) missing.push(v.key);
  }

  const images: Record<string, string | null> = {};
  for (const slot of template.slots) {
    const picked = clean(input.images?.[slot.key]);
    let url: string | null = picked || null;
    if (!url) {
      // A sensible first picture from her own assets, by what the slot allows.
      const gallery = Array.isArray(branding.gallery) ? (branding.gallery as unknown[]).map(clean).filter(Boolean) : [];
      const clinic = Array.isArray(branding.clinic_photos) ? (branding.clinic_photos as unknown[]).map(clean).filter(Boolean) : [];
      if (slot.sources.includes('portrait') && clean(branding.portrait_url)) url = clean(branding.portrait_url);
      else if (slot.sources.includes('hero') && clean(branding.hero_image_url)) url = clean(branding.hero_image_url);
      else if (slot.sources.includes('gallery') && gallery[0]) url = gallery[0];
      else if (slot.sources.includes('clinic') && clinic[0]) url = clinic[0];
    }
    // Client photos are never auto-filled: consent is a choice she makes.
    if (slot.consent && !picked) url = null;
    images[slot.key] = url;
    if (slot.required && !url) missing.push(`slot:${slot.key}`);
  }

  return {
    values,
    images,
    colors,
    fonts: FONTS,
    logoUrl: clean(branding.logo_url) || null,
    missing,
  };
}
