// lib/brandSwatches.js
//
// The accent colours she can pick for HER brand (her booking page, her posts, her receipts), by name.
//
// Two defects found 2026-10-06, both here:
//  * onboarding's preset list had been run through the design-token sweep: its entries read
//    "var(--pc-tint)", "var(--success)", "rgba(242,184,75,0.16)" ... so tapping a swatch saved a string that
//    is not a colour, her page quietly kept the default accent, and the settings screen showed nothing wrong;
//  * every swatch was a <button> with no name, so a screen reader announced ten unlabeled buttons.
// A preset is DATA (a hex she is choosing), not styling: it must be a hex value, which isSwatchHex() checks and
// test-brand-swatches.ts enforces for every list that is offered.

export const SWATCH_NAMES = {
  '#E9A9A1': 'ורוד פטל',
  '#D98BA0': 'ורוד',
  '#C2557A': 'פוקסיה',
  '#A34A6B': 'ורוד כהה',
  '#B784C4': 'לילך',
  '#9B6FB0': 'סגול',
  '#7A5A88': 'סגול עמוק',
  '#5B3E67': 'שזיף',
  '#C68A5E': 'חרסית',
  '#C9A24B': 'זהב',
  '#2A2233': 'פחם',
};

/** The palette onboarding offers (first = the product default, so it can be chosen back). */
export const ONBOARDING_SWATCHES = ['#E9A9A1', '#D98BA0', '#C2557A', '#9B6FB0', '#5B3E67', '#C68A5E', '#C9A24B', '#2A2233'];
/** The palette settings offers. */
export const SETTINGS_SWATCHES = ['#5B3E67', '#7A5A88', '#9B6FB0', '#B784C4', '#D98BA0', '#C2557A', '#A34A6B', '#C68A5E', '#C9A24B', '#2A2233'];

export const isSwatchHex = (v) => /^#[0-9A-Fa-f]{6}$/.test(String(v || ''));

/** "צבע שזיף" - what a screen reader says for a swatch. */
export const swatchLabel = (hex) => `צבע ${SWATCH_NAMES[String(hex).toUpperCase()] || String(hex)}`;
