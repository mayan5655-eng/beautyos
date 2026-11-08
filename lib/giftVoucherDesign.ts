// lib/giftVoucherDesign.ts
//
// How HER gift voucher looks. Pure: no React, no database, so validation and the colour maths are proven by test-gift-vouchers.ts.
//
// Stored in automations.gift_vouchers.design and ALWAYS read through sanitizeDesign, on the server and in the browser:
//   { template, color, accent, background, image, headline, font }
//   template    one of TEMPLATES (elegant, floral, minimal, festive, birthday)
//   color       '#RRGGBB' or null (null = her brand colour, settings.primary_color)
//   accent      '#RRGGBB' or null (null = the template's own accent, mixed from her colour)
//   background  one of BACKGROUNDS, or 'image' with `image` set
//   image       her own upload only: https, on our Supabase storage host, inside the public bucket's folder of HER business
//               (the same path her branding uploads use, app/beautyos.jsx uploadOne). Anything else is dropped.
//   headline    plain text, at most 40 characters; angle brackets and control characters removed (rendered as text, never HTML)
//   font        one of FONTS: the design system's own Hebrew fonts (Frank Ruhl Libre, Heebo, Assistant)
//
// One look function (voucherLook) feeds both renderers: the web card (app/VoucherArt.tsx) and the shareable image
// (lib/og/voucherImage.tsx), so the picture she shares is the card her client opens.

import { contrastRatio, darken, lighten, contrastOn } from './theme.ts';

export const TEMPLATES = ['elegant', 'floral', 'minimal', 'festive', 'birthday'] as const;
export type TemplateKey = (typeof TEMPLATES)[number];
export const TEMPLATE_LABELS: Record<TemplateKey, string> = { elegant: 'אלגנטי', floral: 'פרחוני', minimal: 'מינימליסטי', festive: 'חגיגי', birthday: 'יום הולדת' };
export const TEMPLATE_HEADLINES: Record<TemplateKey, string> = { elegant: 'שובר מתנה', floral: 'פינוק במתנה', minimal: 'שובר מתנה', festive: 'חג שמח, מתנה בשבילך', birthday: 'יום הולדת שמח!' };

export const BACKGROUNDS = ['template', 'cream', 'blush', 'sage', 'night', 'gold', 'image'] as const;
export type BackgroundKey = (typeof BACKGROUNDS)[number];
export const BACKGROUND_LABELS: Record<BackgroundKey, string> = { template: 'של התבנית', cream: 'שמנת', blush: 'ורוד עדין', sage: 'מרווה', night: 'לילה', gold: 'זהב', image: 'תמונה שלך' };

export const FONTS = ['serif', 'modern', 'soft'] as const;
export type FontKey = (typeof FONTS)[number];
export const FONT_LABELS: Record<FontKey, string> = { serif: 'קלאסי', modern: 'מודרני', soft: 'רך' };
/** CSS families from the app's own fonts (app/layout.tsx), and the TTF the image renderer loads (public/design-fonts). */
export const FONT_CSS: Record<FontKey, string> = {
  serif: "var(--font-frank), 'Frank Ruhl Libre', Georgia, serif",
  modern: "var(--font-heebo), 'Heebo', system-ui, sans-serif",
  soft: "var(--font-assistant), 'Assistant', system-ui, sans-serif",
};
export const FONT_TTF: Record<FontKey, { name: string; path: string }> = {
  serif: { name: 'Frank', path: '/design-fonts/FrankRuhlLibre-700.ttf' },
  modern: { name: 'Heebo', path: '/design-fonts/Heebo-700.ttf' },
  soft: { name: 'Assistant', path: '/design-fonts/Assistant-700.ttf' },
};

export const MAX_HEADLINE = 40;

export type VoucherDesign = {
  template: TemplateKey;
  color: string | null;
  accent: string | null;
  background: BackgroundKey;
  image: string | null;
  headline: string;
  font: FontKey;
};

const TEMPLATE_DEFAULTS: Record<TemplateKey, { background: BackgroundKey; font: FontKey }> = {
  elegant: { background: 'cream', font: 'serif' },
  floral: { background: 'blush', font: 'serif' },
  minimal: { background: 'template', font: 'modern' },
  festive: { background: 'night', font: 'serif' },
  birthday: { background: 'blush', font: 'soft' },
};

export const DEFAULT_DESIGN: VoucherDesign = { template: 'elegant', color: null, accent: null, background: 'template', image: null, headline: '', font: 'serif' };

const HEX = /^#[0-9a-f]{6}$/i;
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const pick = <T extends string>(list: readonly T[], v: unknown, dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
export const cleanHex = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toUpperCase() : null);

/** Plain text for a headline: no tags, no angle brackets, no control or direction-override characters, one line, 40 at most. */
export function cleanHeadline(v: unknown): string {
  return String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_HEADLINE);
}

/** Her own upload, and only that: https, our storage host, the public bucket, her business's folder. */
export function allowedDesignImage(url: unknown, tenantId: string | null | undefined, storageHost: string): string | null {
  if (typeof url !== 'string' || !tenantId || !storageHost || url.length > 600) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.host !== storageHost) return null;
    if (!u.pathname.startsWith(`/storage/v1/object/public/community-images/${tenantId}/`)) return null;
    if (/[\s"'()<>\\]/.test(url)) return null; // it goes into a CSS url(): nothing that could close it
    return u.toString();
  } catch {
    return null;
  }
}

/** The design, validated. Anything malformed becomes the default; an image that is not hers is dropped. */
export function sanitizeDesign(raw: unknown, tenantId?: string | null, storageHost = ''): VoucherDesign {
  const o = asObj(raw);
  const template = pick(TEMPLATES, o.template, DEFAULT_DESIGN.template);
  const image = allowedDesignImage(o.image, tenantId, storageHost);
  let background = pick(BACKGROUNDS, o.background, 'template');
  if (background === 'image' && !image) background = 'template';
  return {
    template,
    color: cleanHex(o.color),
    accent: cleanHex(o.accent),
    background,
    image: background === 'image' ? image : null,
    headline: cleanHeadline(o.headline),
    font: pick(FONTS, o.font, TEMPLATE_DEFAULTS[template].font),
  };
}

/** The storage host the image check compares with, from the app's own Supabase URL. */
export function storageHostOf(supabaseUrl: string | undefined | null): string {
  try { return new URL(String(supabaseUrl || '')).host; } catch { return ''; }
}

export type VoucherLook = {
  template: TemplateKey;
  bg: string;            // a CSS background (solid or linear-gradient), also valid for the image renderer
  image: string | null;  // her photo behind the card, with `veil` over it
  veil: string;
  ink: string;           // main text, checked against the background
  sub: string;           // secondary text
  accent: string;        // rules, ornaments, the code box border
  panel: string;         // the inner area under the headline
  panelInk: string;
  font: FontKey;
  headline: string;
};

const PRESET_BG: Record<Exclude<BackgroundKey, 'template' | 'image'>, string> = {
  cream: '#FBF8F1', blush: '#FBEDE9', sage: '#DCE4D5', night: '#1F2433', gold: '#F3E3BF',
};

/** Colours that read: when a choice would put text under 4.5:1 on its background, the text takes the readable side instead. */
const readable = (fg: string, bg: string) => (contrastRatio(fg, bg) >= 4.5 ? fg : contrastOn(bg));

/**
 * Everything both renderers need, decided once. `brandPrimary` is HER colour (settings.primary_color), never Kalmea's.
 */
export function voucherLook(d: VoucherDesign, brandPrimary: string): VoucherLook {
  const main = d.color || cleanHex(brandPrimary) || '#B5838D';
  const t = d.template;
  const accentDefault = t === 'festive' ? '#D4AF37' : t === 'minimal' ? main : t === 'birthday' ? lighten(main, 0.25) : darken(main, 0.15);
  const accent = d.accent || accentDefault;
  const bgKey = d.background === 'template' ? TEMPLATE_DEFAULTS[t].background : d.background;
  let base: string;
  if (bgKey === 'image') base = '#1F2433';
  else if (t === 'minimal' && d.background === 'template') base = '#FFFFFF';
  else base = PRESET_BG[bgKey as keyof typeof PRESET_BG];
  // A colour wash of her hue over light backgrounds, so even "cream" is hers.
  const dark = contrastRatio(base, '#FFFFFF') > 4.5;
  const bg = bgKey === 'image' ? base
    : t === 'minimal' ? base
    : dark ? `linear-gradient(160deg, ${base} 0%, ${darken(main, 0.55)} 100%)`
    : `linear-gradient(160deg, ${base} 0%, ${lighten(main, 0.82)} 100%)`;
  const ink = bgKey === 'image' ? '#FFFFFF' : readable(dark ? '#FFFFFF' : darken(main, 0.6), base);
  const sub = bgKey === 'image' ? '#F4F0EA' : readable(dark ? '#E8E2D6' : darken(main, 0.4), base);
  return {
    template: t,
    bg,
    image: bgKey === 'image' ? d.image : null,
    veil: 'linear-gradient(180deg, rgba(20,20,28,0.35) 0%, rgba(20,20,28,0.72) 100%)',
    ink,
    sub,
    accent: bgKey === 'image' || dark ? lighten(accent, 0.15) : accent,
    panel: dark || bgKey === 'image' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)',
    panelInk: dark || bgKey === 'image' ? '#FFFFFF' : darken(main, 0.6),
    font: d.font,
    headline: d.headline || TEMPLATE_HEADLINES[t],
  };
}

/** Each template at its own defaults: the gallery she picks from. */
export function templatePreset(t: TemplateKey): VoucherDesign {
  return { ...DEFAULT_DESIGN, template: t, font: TEMPLATE_DEFAULTS[t].font };
}

export type Ornament = {
  top?: number; left?: number; right?: number; bottom?: number;
  width: number; height: number; radius?: number;
  background?: string; border?: string; opacity?: number;
};

/**
 * The template's decoration, as plain absolutely-positioned shapes (circles, rings, frames) in units of a card `w` wide and `h`
 * high. Shapes, not emoji or images: the image renderer draws them identically, and nothing can fail to load.
 */
export function ornaments(look: VoucherLook, w: number, h: number): Ornament[] {
  const a = look.accent;
  const u = w / 100;
  switch (look.template) {
    case 'elegant':
      return [
        { top: 3 * u, left: 3 * u, width: w - 6 * u, height: h - 6 * u, radius: 2 * u, border: `${Math.max(1, 0.4 * u)}px solid ${a}`, opacity: 0.9 },
        { top: 4.6 * u, left: 4.6 * u, width: w - 9.2 * u, height: h - 9.2 * u, radius: 1.4 * u, border: `${Math.max(1, 0.2 * u)}px solid ${a}`, opacity: 0.55 },
      ];
    case 'floral': {
      const petal = (cx: number, cy: number, r: number, op: number): Ornament[] => [0, 72, 144, 216, 288].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return { left: cx + Math.cos(rad) * r - r * 0.7, top: cy + Math.sin(rad) * r - r * 0.7, width: r * 1.4, height: r * 1.4, radius: r, background: a, opacity: op };
      }).concat([{ left: cx - r * 0.45, top: cy - r * 0.45, width: r * 0.9, height: r * 0.9, radius: r, background: lighten(a, 0.55), opacity: 0.95 }]);
      return [...petal(8 * u, 8 * u, 7 * u, 0.28), ...petal(w - 9 * u, h - 9 * u, 9 * u, 0.22), ...petal(w - 10 * u, 12 * u, 3.4 * u, 0.3)];
    }
    case 'minimal':
      return [{ top: 0, right: 0, width: 2.2 * u, height: h, background: a, opacity: 1 }];
    case 'festive': {
      const dots: [number, number, number][] = [[8, 10, 1.6], [18, 6, 1], [30, 12, 0.8], [72, 7, 1.2], [86, 14, 1.8], [92, 30, 0.9], [6, 42, 1], [94, 62, 1.3], [10, 80, 1.5], [88, 90, 1], [50, 5, 0.7], [24, 92, 0.9]];
      return dots.map(([x, y, s], i) => ({ left: (x / 100) * w, top: (y / 100) * h, width: s * 2 * u, height: s * 2 * u, radius: s * u, background: i % 3 === 0 ? lighten(a, 0.35) : a, opacity: 0.9 }));
    }
    case 'birthday': {
      const b = (x: number, y: number, s: number, c: string): Ornament[] => [
        { left: x, top: y, width: s, height: s * 1.22, radius: s, background: c, opacity: 0.85 },
        { left: x + s / 2, top: y + s * 1.22, width: Math.max(1, 0.25 * u), height: s * 1.3, background: c, opacity: 0.5 },
      ];
      return [...b(5 * u, 5 * u, 9 * u, a), ...b(14 * u, 9 * u, 7 * u, lighten(a, 0.35)), ...b(w - 14 * u, h - 30 * u, 8 * u, a)];
    }
    default:
      return [];
  }
}
