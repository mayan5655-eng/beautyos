// lib/accessibilityContact.ts
//
// The accessibility coordinator shown on the public page /accessibility (app/accessibility/page.tsx).
// Israeli accessibility regulations require a named coordinator ("נציג/ת נגישות") and a way to reach them. Kalmea's line is WhatsApp-only (lib/support.ts),
// so the page shows that instead of `phone`, which is kept only as the local form of the same number.
export const ACCESSIBILITY_COORDINATOR = {
  name: 'מעין בבאי',
  phone: '050-7321978',
  email: 'kalmea.app@gmail.com',
} as const;

/** When the statement was last reviewed. Update it whenever the page, or the site's accessibility, changes. */
export const ACCESSIBILITY_UPDATED = '9 באוקטובר 2026';

export const isPlaceholder = (v: string) => /^\[.*\]$/.test(v);
