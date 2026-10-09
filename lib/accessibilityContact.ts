// lib/accessibilityContact.ts
//
// >>> FILL THESE THREE LINES BEFORE LAUNCH. <<<
// They are shown on the public page /accessibility (app/accessibility/page.tsx) under "פניות בנושא נגישות".
// Israeli accessibility regulations require a named accessibility coordinator ("נציג/ת נגישות") with a phone number and an email.
// Until you replace the bracketed placeholders, the live page shows the brackets exactly as written.
export const ACCESSIBILITY_COORDINATOR = {
  name: '[שם רכז/ת הנגישות]',
  phone: '[מספר טלפון]',
  email: '[כתובת אימייל]',
} as const;

/** When the statement was last reviewed. Update it whenever the page, or the site's accessibility, changes. */
export const ACCESSIBILITY_UPDATED = '9 באוקטובר 2026';

export const isPlaceholder = (v: string) => /^\[.*\]$/.test(v);
