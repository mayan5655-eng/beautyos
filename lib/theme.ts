// lib/theme.ts
// Single source of truth for the tenant accent derivation.
//
// One stored value (settings.primary_color) fans out into the --pc-* family
// that every screen reads. The maths lived as closures inside beautyos.jsx,
// so no other page could reuse it - which is why /login, /book and /skin-scan
// each ended up with their own hardcoded palette.
//
// The ratios here MUST stay in sync with the declared defaults in
// app/globals.css, or an unthemed first paint will not match the themed one.

export type Rgb = { r: number; g: number; b: number };

// Kalmea's petal pink, used when a tenant has not chosen a colour. A product
// default, not her choice - she can change it in Settings whenever she likes.
export const DEFAULT_ACCENT = '#E9A9A1';

// Brand ink - the dark text colour, and one of the two candidates for
// readable text on an accent. Mirrors --brand-ink / --ink in globals.css.
export const BRAND_INK = '#2A2233';

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 91, g: 62, b: 103 };
}

export function lighten(hex: string, amt: number): string {
  const c = hexToRgb(hex);
  const f = (v: number) => Math.round(v + (255 - v) * amt);
  return `#${[f(c.r), f(c.g), f(c.b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function darken(hex: string, amt: number): string {
  const c = hexToRgb(hex);
  const f = (v: number) => Math.round(v * (1 - amt));
  return `#${[f(c.r), f(c.g), f(c.b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// Relative luminance per WCAG 2.1, used to decide readable text on the accent.
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// WCAG contrast ratio between two colours (1:1 identical .. 21:1 black/white).
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Ink or white, whichever is genuinely more readable ON the given colour.
//
// This compares real contrast ratios rather than testing luminance against a
// threshold. A mid-luminance accent like the #C9A24B gold in the swatch list
// scores ~2.4:1 with white but ~8.8:1 with ink, so a naive threshold picks the
// unreadable option exactly where it matters most.
export function contrastOn(hex: string): string {
  return contrastRatio(hex, BRAND_INK) >= contrastRatio(hex, '#FFFFFF')
    ? BRAND_INK
    : '#FFFFFF';
}

// Her accent as TEXT. The accent itself is a fill - buttons, rules, washes -
// and is chosen for how it looks as one: the default petal pink is 1.97:1
// against white, which is fine as a fill and unreadable as a heading. Anything
// that draws words in her colour on a light page (her booking page's headings,
// prices, step labels) reads --pc-text instead.
//
// Same hue and saturation as hers, lightness lowered only as far as it takes to
// reach `min` against white AND against Kalmea's cream (the darker of the two
// surfaces she can land on). An accent whose --pc-deep already passes - a deep
// plum, a forest green - gets exactly that, so only the colours that need it move.
const rgbToHsl = ({ r, g, b }: Rgb): [number, number, number] => {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
const hslToHex = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
};
export function readableAccentText(accent: string, min = 4.6): string {
  const surfaces = ['#FFFFFF', '#F0EADE'];
  const ok = (hex: string) => surfaces.every((bg) => contrastRatio(hex, bg) >= min);
  const start = darken(accent, 0.16);
  if (ok(start)) return start;
  const [h, s, l0] = rgbToHsl(hexToRgb(start));
  for (let l = l0; l > 0; l -= 0.01) {
    const hex = hslToHex(h, s, l);
    if (ok(hex)) return hex;
  }
  return BRAND_INK;
}

// The full accent family derived from one hex. Ratios mirror globals.css.
export function buildAccentTokens(accent?: string | null): Record<string, string> {
  const pc = (accent || '').trim() || DEFAULT_ACCENT;
  const rgb = hexToRgb(pc);
  const pc2 = lighten(pc, 0.22);
  const pcDeep = darken(pc, 0.16);

  return {
    '--pc': pc,
    '--pc-2': pc2,
    '--pc-deep': pcDeep,
    '--pc-text': readableAccentText(pc),
    '--pc-tint': lighten(pc, 0.9),
    '--pc-tint-2': lighten(pc, 0.82),
    '--pc-soft': `rgba(${rgb.r},${rgb.g},${rgb.b},0.10)`,
    // Chrome wash: the header and sidebars carry a hint of her colour so the
    // shell feels like hers. Deliberately far weaker than --pc-soft - this
    // sits behind navigation text, where readability wins over presence.
    '--pc-chrome': `rgba(${rgb.r},${rgb.g},${rgb.b},0.045)`,
    '--pc-shadow': `rgba(${rgb.r},${rgb.g},${rgb.b},0.28)`,
    '--pc-grad': `linear-gradient(135deg,${pc2} 0%,${pcDeep} 100%)`,
    '--pc-contrast': contrastOn(pc),
  };
}

// Apply the family to an element (defaults to :root). Client-side only.
export function applyAccentTokens(accent?: string | null, el?: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const target = el || document.documentElement;
  const tokens = buildAccentTokens(accent);
  for (const [name, value] of Object.entries(tokens)) {
    target.style.setProperty(name, value);
  }
}

// Style object for server-rendered wrappers, so a themed page paints correctly
// on first byte instead of flashing the default accent then correcting.
export function accentStyle(accent?: string | null): Record<string, string> {
  return buildAccentTokens(accent);
}
